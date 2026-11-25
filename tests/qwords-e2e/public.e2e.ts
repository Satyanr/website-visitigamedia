import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import data from '../qwords/browser-data.json' with { type: 'json' };

function bootstrap(route: string): Record<string, unknown> {
  const html = readFileSync(new URL(`../../artifacts/qwords/public_html/id/${route}index.html`, import.meta.url), 'utf8');
  return JSON.parse(html.match(/<script[^>]*id="visitiga-prerender-data"[^>]*>([\s\S]*?)<\/script>/)![1]);
}
const staticRows: Record<string, unknown[]> = {
  homepage_content: [bootstrap('').homepage],
  about_content: [bootstrap('about/').about],
  service_content: [bootstrap('services/').serviceContent],
  service_landings: ['led-indoor', 'videotron-outdoor', 'rental-led', 'media-konvensional', 'digital-signage', 'event-production'].map((slug) => bootstrap(`services/${slug}/`).serviceLanding),
};
const browserProblems = new WeakMap<Page, string[]>();

test.beforeEach(async ({ page }) => {
  const problems: string[] = [];
  browserProblems.set(page, problems);
  page.on('pageerror', (error) => problems.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error' && /Content Security Policy|violates.*script-src|Refused to execute/i.test(message.text())) problems.push(message.text());
  });
  // Keep the built canonical origin as the browser origin, while fulfilling
  // every request locally. This exercises CSP 'self' without external hosting.
  await page.route('https://qwords-stage.example.test/**', async (route) => {
    const local = new URL(route.request().url());
    local.protocol = 'http:';
    local.host = '127.0.0.1:4186';
    await route.fulfill({ response: await route.fetch({ url: local.href }) });
  });
  // Only the explicitly fake project is mocked; requests never touch production.
  await page.route('https://qwords-test.supabase.co/**', async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.includes('/rpc/')) return route.fulfill({ status: 204, body: '' });
    const table = url.pathname.split('/').at(-1) || '';
    if (table in staticRows) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(staticRows[table]) });
    let rows = table === 'news' ? data.news : table === 'portfolios' ? data.portfolios : [];
    const slug = url.searchParams.get('slug');
    if (slug) rows = rows.filter((row) => `eq.${row.slug}` === slug);
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(rows) });
  });
});

test.afterEach(async ({ page }) => {
  expect(browserProblems.get(page) ?? []).toEqual([]);
});

test('all public id/en routes survive direct refresh and preserve staging noindex', async ({ page }) => {
  const routes = ['', 'about/', 'services/', 'services/led-indoor/', 'services/videotron-outdoor/', 'services/rental-led/', 'services/media-konvensional/', 'services/digital-signage/', 'services/event-production/', 'product/', 'portfolio/', 'video/', 'contact/', 'news/', 'faq/', 'privacy/', 'careers/'];
  for (const locale of ['id', 'en']) for (const route of routes) {
    const response = await page.goto(`/${locale}/${route}`);
    expect(response?.status()).toBe(200);
    await expect(page.locator('#root')).toBeVisible();
    await expect(page.locator('#main-content h1').first()).toBeVisible();
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex, follow');
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', `https://qwords-stage.example.test/${locale}/${route}`);
  }
});

test('admin deep-link refresh redirects anonymous users to login', async ({ page }) => {
  for (const route of ['/admin', '/admin/news', '/admin/careers/submissions']) {
    const response = await page.goto(route);
    expect(response?.status()).toBe(200);
    await expect(page).toHaveURL(/\/admin\/login$/);
    await expect(page.getByRole('button', { name: /Masuk|Sign in|Login/i })).toBeVisible();
  }
});

test('dynamic crawler HTML, hydration and missing content status', async ({ page, request }) => {
  const get = (path: string) => request.get(`http://127.0.0.1:4186${path}`);
  for (const [kind, slug, title] of [['news', 'test-news', 'Test news SEO'], ['portfolio', 'test-project', 'Test project SEO']]) {
    const response = await get(`/id/${kind}/${slug}/`);
    expect(response.status()).toBe(200);
    const html = await response.text();
    expect(html).toContain(title);
    expect(html).toContain('application/ld+json');
    expect(html).toContain('hreflang="en"');
    expect(response.headers()['cache-control']).toBe('no-store');
    await page.goto(`/id/${kind}/${slug}/`);
    await expect(page.locator('#root')).toBeVisible();
    await expect(page.locator('#main-content article h1')).toBeVisible();
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex, follow');
  }
  expect((await get('/id/news/deleted/')).status()).toBe(404);
  expect((await get('/en/portfolio/deleted/')).status()).toBe(404);
  expect(await (await get('/sitemap.xml')).text()).toContain('/en/news/test-news/');
});

test('navigation, locale switch, mobile gallery and contact RPC remain functional', async ({ page }) => {
  await page.goto('/id/');
  await page.getByRole('link', { name: 'Tentang Kami', exact: true }).first().click();
  await expect(page).toHaveURL(/\/id\/about\/$/);
  await page.getByRole('button', { name: 'Ganti bahasa' }).first().click();
  await expect(page).toHaveURL(/\/en\/about\/$/);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/id/portfolio/test-project/');
  await expect(page.locator('#main-content article h1')).toBeVisible();
  await page.goto('/id/contact/');
  await page.getByLabel('Nama').fill('Pengguna Test');
  await page.getByLabel('Email').fill('test@example.test');
  await page.getByLabel('Kebutuhan Anda').fill('Konsultasi LED untuk pengujian lokal terisolasi.');
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: /Kirim Permintaan/ }).click();
  await expect(page.getByText(/berhasil dikirim/i)).toBeVisible();
});

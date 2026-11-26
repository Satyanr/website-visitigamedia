import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';

const publicRoutes = ['/id/', '/id/about/', '/id/services/', '/id/product/', '/id/portfolio/', '/id/video/', '/id/contact/', '/id/news/', '/id/faq/', '/id/privacy/', '/id/careers/'];
const navigation = { waitUntil: 'domcontentloaded' } as const;

function snapshot(route: string) {
  const html = readFileSync(new URL(`../../dist/id/${route}index.html`, import.meta.url), 'utf8');
  return JSON.parse(html.match(/<script[^>]*id="visitiga-prerender-data"[^>]*>([\s\S]*?)<\/script>/)![1]);
}

test.beforeEach(async ({ page }) => {
  // The static preview has no PHP process, so serve hydration data from the build's snapshots.
  const tables: Record<string, Record<string, unknown>[]> = {
    homepage_content: [snapshot('').homepage],
    about_content: [snapshot('about/').about],
    service_content: [snapshot('services/').serviceContent],
    news: snapshot('news/').news ?? [],
    portfolios: snapshot('portfolio/').portfolios ?? [],
    products: snapshot('product/').products ?? [],
    product_catalogue: [snapshot('product/').catalogue].filter(Boolean),
  };
  await page.route('**/api/**', (route) => {
    const url = new URL(route.request().url());
    if (!url.pathname.startsWith('/api/content/')) return route.fulfill({ json: null });
    let rows = (tables[url.pathname.split('/').at(-1) ?? ''] ?? []).filter(Boolean);
    const filters = JSON.parse(url.searchParams.get('filters') ?? '[]');
    for (const [field, operator, value] of filters) {
      if (operator === 'eq') rows = rows.filter((row) => String(row[field]) === String(value));
      if (operator === 'not-null') rows = rows.filter((row) => row[field] != null);
    }
    return route.fulfill({ json: { rows } });
  });
});

test('all public routes activate without browser or network errors', async ({ page }) => {
  test.setTimeout(60_000);
  const problems: string[] = [];
  page.on('console', (message) => { if (message.type() === 'error') problems.push(message.text()); });
  page.on('response', (response) => { if (response.status() >= 400) problems.push(`${response.status()} ${response.url()}`); });
  for (const route of publicRoutes) {
    await page.goto(route, navigation);
    await expect(page.locator('#main-content h1')).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('data-app-ready', 'true');
  }
  expect(problems.filter((problem) => !problem.includes('favicon'))).toEqual([]);
});

test('canonical public URLs stay indexable after hydration', async ({ page }) => {
  test.setTimeout(60_000);
  for (const route of publicRoutes) {
    const canonicalPath = route;
    await page.goto(canonicalPath, navigation);
    await expect(page.locator('#root')).toBeVisible();
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'index, follow');
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', new RegExp(`${canonicalPath}$`));
    expect(await page.title()).not.toContain('Halaman Tidak Ditemukan');
  }
});

test('navigation, language, article, 404, and admin redirect remain functional', async ({ page }) => {
  await page.goto('/id/', navigation);
  await page.getByRole('link', { name: 'Tentang Kami', exact: true }).first().click();
  await expect(page).toHaveURL(/\/id\/about\/$/);
  await page.getByRole('button', { name: 'Ganti bahasa' }).first().click();
  await expect(page).toHaveURL(/\/en\/about\/$/);
  await expect(page.getByRole('link', { name: 'About Us', exact: true }).first()).toBeVisible();
  await page.goto('/id/news/', navigation);
  const article = page.getByRole('link', { name: /Baca selengkapnya|Read more/ }).first();
  if (await article.count()) {
    await article.click();
    await expect(page).toHaveURL(/\/id\/news\/[^/]+\/$/);
    await expect(page.locator('article h1')).toBeVisible();
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'index, follow');
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', /\/news\/[^/]+\/$/);
  }
  await page.goto('/id/route-tidak-ada/', navigation);
  await expect(page.getByRole('heading', { name: /Halaman tidak ditemukan|Page not found/ })).toBeVisible();
  await page.goto('/admin', navigation);
  await expect(page).toHaveURL(/\/admin\/login$/);
});

test('contact form handles a successful RPC response', async ({ page }) => {
  const submitted = page.waitForRequest((request) =>
    new URL(request.url()).pathname === '/api/actions/submit_contact_message' && request.method() === 'POST');
  await page.route('**/api/actions/submit_contact_message', (route) => route.fulfill({ json: { ok: true } }));
  await page.goto('/id/contact/', navigation);
  await page.getByLabel('Nama').fill('Pengguna Test');
  await page.getByLabel('Email').fill('test@example.com');
  await page.getByLabel('Kebutuhan Anda').fill('Membutuhkan konsultasi LED untuk pengujian website.');
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: /Kirim Permintaan/ }).click();
  expect((await submitted).postDataJSON().p_name).toBe('Pengguna Test');
  await expect(page.getByText(/berhasil dikirim/i)).toBeVisible();
});

test('portfolio gallery and detail URLs work on desktop and mobile', async ({ page }) => {
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 844 });
    await page.goto('/id/portfolio/', navigation);
    const gallery = page.locator('#root #portfolio');
    await expect(gallery).toBeVisible();
    await expect(gallery.getByRole('heading', { name: /Proyek|Projects/ })).toBeVisible();
    await gallery.getByRole('button', { name: 'Lihat semua' }).click();
    const card = gallery.locator('.grid a[href^="/id/portfolio/"]').first();
    await expect(card).toBeVisible();
    const href = await card.getAttribute('href');
    await card.click();
    await expect(page).toHaveURL(/\/id\/portfolio\/[^/]+\/$/);
    await expect(page.locator('#main-content article h1')).toBeVisible();
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', new RegExp(`${href?.replaceAll('/', '\\/')}$`));
    await page.goto(href!, navigation);
    await expect(page.locator('#main-content article h1')).toBeVisible();
    await page.getByRole('link', { name: 'Kembali ke portofolio' }).click();
    await expect(page).toHaveURL(/\/id\/portfolio\/$/);
  }
});

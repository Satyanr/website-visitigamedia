import { expect, test, type Page } from '@playwright/test';
import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import sharp from 'sharp';
import data from '../qwords/browser-data.json' with { type: 'json' };

const origin = process.env.QWORDS_TEST_BROWSER_ORIGIN || 'https://qwords-stage.example.test';

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
  await page.route(`${origin}/**`, async (route) => {
    const local = new URL(route.request().url());
    local.protocol = 'http:';
    local.host = '127.0.0.1:4186';
    await route.fulfill({ response: await route.fetch({ url: local.href }) });
  });
  await page.route(`${origin}/api/**`, async (route) => {
    const url = new URL(route.request().url());
    if (!url.pathname.startsWith('/api/content/')) return route.fulfill({ status: 200, json: null });
    const table = url.pathname.split('/').at(-1) || '';
    if (table in staticRows) return route.fulfill({ status: 200, json: { rows: staticRows[table] } });
    let rows = table === 'news' ? data.news : table === 'portfolios' ? data.portfolios : [];
    const filters = JSON.parse(url.searchParams.get('filters') ?? '[]');
    const slug = filters.find(([field]: [string]) => field === 'slug')?.[2];
    if (slug) rows = rows.filter((row) => row.slug === slug);
    return route.fulfill({ status: 200, json: { rows } });
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
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', `${origin}/${locale}/${route}`);
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

test('hero retains six real image assets, advances after 6000 ms and supports pagination', async ({ page }) => {
  // Known repository files form a complete fixture. These are independent of staging's campaign mapping.
  const hero = [
    ['/hero-1600.webp', 'ADVERTISING'],
    ['/news/digital-signage.webp', 'OUTDOOR LED'],
    ['/news/led-indoor-vs-outdoor.webp', 'INDOOR EXPERIENCE'],
    ['/portfolio/indoor/indoor-9.webp', 'VIDEOTRON RENTAL'],
    ['/news/technology-visual.webp', 'BUY YOUR VIDEOTRON'],
    ['/portfolio/audiovisual/IMG_9584-scaled.webp', 'EVENT IMPACT'],
  ].map(([image_url, title]) => ({ image_url, alt: title, content_en: { title, subtitle: 'Fixture', ctaLabel: 'Contact us' } }));
  await page.route('**/api/content/homepage_content?*', (route) => route.fulfill({
    json: { rows: [{ ...(bootstrap('').homepage as Record<string, unknown>), hero_slides: hero }] },
  }));
  await page.clock.install();
  await page.goto('/en/');
  const slides = page.locator('.hero-carousel__slide img');
  const tabs = page.locator('.hero-carousel__pagination [role=tab]');
  await expect(slides).toHaveCount(6);
  await expect.poll(() => slides.evaluateAll((images: HTMLImageElement[]) => images.every((image) => image.complete && image.naturalWidth > 0))).toBe(true);
  await expect(tabs.nth(0)).toHaveAttribute('aria-selected', 'true');
  await page.clock.fastForward(6000);
  await expect(tabs.nth(1)).toHaveAttribute('aria-selected', 'true');
  await tabs.nth(4).click();
  await expect(tabs.nth(4)).toHaveAttribute('aria-selected', 'true');
});

test('Summernote uploads, saves and reloads article media across languages', async ({ page }) => {
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==', 'base64');
  const file = { name: 'article.png', mimeType: 'image/png', buffer: png };
  const uploaded: string[] = [];
  const removed: string[] = [];
  const external = 'https://images.example.test/photo.png';
  const title = 'Test news';
  let row = { ...data.news[0], content: '<p>Before after</p>', content_id: { content: '<p>Teks Indonesia</p>' } };
  let writes = 0;
  let releaseUpload!: () => void;
  const hold = new Promise<void>((resolve) => { releaseUpload = resolve; });
  await page.route('**/api/session', (route) => route.fulfill({
    json: { user: { id: 'fixture', email: 'fixture@example.test', role: 'admin' }, csrf: 'test-csrf', translationEnabled: false },
  }));
  await page.route('**/api/admin/news?*', async (route) => {
    if (route.request().method() === 'PATCH') {
      writes++;
      row = { ...row, ...route.request().postDataJSON() };
    }
    await route.fulfill({ json: { rows: [row] } });
  });
  await page.route('**/api/content/news?*', (route) => route.fulfill({ json: { rows: [row] } }));
  await page.route('**/api/admin/media', async (route) => {
    if (route.request().method() === 'DELETE') {
      removed.push(...route.request().postDataJSON().paths);
      return route.fulfill({ json: { ok: true } });
    }
    const request = route.request();
    expect(request.headers()['x-csrf-token']).toBe('test-csrf');
    expect(request.headers()['content-type']).toContain('multipart/form-data');
    const multipart = request.postDataBuffer()!;
    expect(multipart.byteLength).toBeLessThanOrEqual(2 * 1024 * 1024);
    const path = multipart.toString().match(/news\/[0-9a-f-]{36}\.(?:png|webp)/)![0];
    uploaded.push(path);
    if (uploaded.length === 1) await hold;
    return route.fulfill({ status: 201, json: { path } });
  });
  await page.route('**/media/news/**', (route) => route.fulfill({ contentType: 'image/png', body: png }));
  await page.route('https://images.example.test/**', (route) => route.request().url() === external
    ? route.fulfill({ contentType: 'image/png', body: png })
    : route.fulfill({ contentType: 'text/html', body: '<p>Not an image</p>' }));
  for (const host of ['www.youtube.com', 'www.youtube-nocookie.com', 'player.vimeo.com']) {
    await page.route(`https://${host}/**`, (route) => route.fulfill({
      contentType: 'text/html', body: '<button onclick="this.textContent = \'Playing fixture\'">Play fixture</button>',
    }));
  }

  await page.goto('/admin/news');
  const edit = page.getByRole('button', { name: 'Edit' });
  const body = page.locator('.note-editable');
  const save = page.getByRole('button', { name: 'Simpan', exact: true });
  const picture = page.locator('.note-toolbar .note-icon-picture');
  await edit.click();
  await expect(body).toBeVisible();
  await body.locator('p').click();
  await body.press('Home');
  await body.press('ArrowRight');
  await body.press('ArrowRight');
  await picture.click();
  await page.locator('.note-image-input').setInputFiles(file);
  await expect.poll(() => uploaded.length).toBe(1);
  await expect(save).toBeDisabled();
  await expect(page.getByText('Mengunggah gambar 1 dari 1…')).toBeVisible();
  expect(writes).toBe(0);
  releaseUpload();
  await expect(body.locator('img')).toHaveCount(1);
  expect(await body.innerHTML()).toMatch(/Be<img[^>]+>fore after/);
  await save.click();
  await expect(save).toBeHidden();
  expect(row.content).toContain('/media/' + uploaded[0]);
  expect(row.content).not.toContain('base64');

  await edit.click();
  await expect(body.locator('img')).toHaveCount(1);
  await body.locator('p').press('End');
  await picture.click();
  await page.locator('.note-image-input').setInputFiles([file, { ...file, name: 'second.png' }]);
  await expect(body.locator('img')).toHaveCount(3);
  for (const type of ['paste', 'drop']) {
    await body.evaluate((editable, { eventType, bytes }) => {
      const transfer = new DataTransfer();
      transfer.items.add(new File([new Uint8Array(bytes)], 'clipboard.png', { type: 'image/png' }));
      const event = eventType === 'paste'
        ? new ClipboardEvent('paste', { clipboardData: transfer, bubbles: true, cancelable: true })
        : new DragEvent('drop', { dataTransfer: transfer, bubbles: true, cancelable: true });
      editable.dispatchEvent(event);
    }, { eventType: type, bytes: [...png] });
    await expect.poll(() => uploaded.length).toBe(type === 'paste' ? 4 : 5);
    await expect(save).toBeEnabled();
  }
  const addImageUrl = async (url: string) => {
    await picture.click();
    await page.locator('.note-image-url').fill(url);
    await page.locator('.note-image-btn').click();
  };
  await addImageUrl('https://images.example.test/page.html');
  await expect(page.getByText('Gambar tidak dapat dimuat.', { exact: false })).toBeVisible();
  await addImageUrl(external);
  await expect(body.locator(`img[src="${external}"]`)).toBeVisible();
  for (const url of [
    'https://youtu.be/M7lc1UVf-VE', 'https://www.youtube-nocookie.com/embed/M7lc1UVf-VE',
    'https://vimeo.com/76979871', '/videos/service-showreel.webm',
  ]) {
    await page.getByRole('button', { name: 'Sisipkan video' }).click();
    await page.getByLabel('URL video').fill(url);
    await page.getByLabel('URL video').press('Enter');
  }
  await expect(body.locator('iframe')).toHaveCount(3);
  await expect(body.locator('video')).toHaveCount(1);
  // Editing the raw source runs the same policy before it returns to the visual editor.
  await page.locator('.btn-codeview').click();
  const source = page.locator('.note-codable');
  await source.fill(await source.inputValue() + '<iframe src="https://disallowed.example.test/"></iframe><img src="javascript:blocked()">');
  await page.locator('.btn-codeview').click();
  await expect(body.locator('iframe')).toHaveCount(3);
  await expect(body.locator('iframe[src*="disallowed"]')).toHaveCount(0);
  await save.click();
  await expect(save).toBeHidden();
  expect(row.content_id.content).toContain('Teks Indonesia');
  expect(row.content).not.toMatch(/base64|disallowed|javascript/);
  expect(row.content_id.content).toContain(external);
  expect(removed).toEqual([]);

  await edit.click();
  await expect(body.locator('img')).toHaveCount(6);
  await expect(body.locator('iframe')).toHaveCount(3);
  const largeInput = await sharp(randomBytes(1400 * 1000 * 3), { raw: { width: 1400, height: 1000, channels: 3 } }).png().toBuffer();
  expect(largeInput.byteLength).toBeGreaterThan(2 * 1024 * 1024);
  await picture.click();
  await page.locator('.note-image-input').setInputFiles({ ...file, buffer: largeInput });
  await expect(body.locator('img')).toHaveCount(7);
  expect(uploaded.at(-1)).toMatch(/\.webp$/);
  await page.getByRole('button', { name: 'Tutup', exact: true }).click();
  await expect.poll(() => removed).toEqual([uploaded.at(-1)]);

  for (const locale of ['en', 'id']) {
    await page.setViewportSize(locale === 'en' ? { width: 1280, height: 900 } : { width: 390, height: 844 });
    await page.goto(`/${locale}/news/test-news/`);
    await expect(page.getByRole('heading', { name: title })).toBeVisible();
    const article = page.locator('[data-article-media]');
    await expect(article.locator('img')).toHaveCount(6);
    await expect.poll(() => article.locator('img').evaluateAll((images: HTMLImageElement[]) => images.every((image) => image.complete && image.naturalWidth > 0))).toBe(true);
    for (const host of ['www.youtube.com', 'www.youtube-nocookie.com', 'player.vimeo.com']) {
      const frame = article.locator(`iframe[src*="${host}/"]`);
      await frame.scrollIntoViewIfNeeded();
      const player = frame.contentFrame().getByRole('button', { name: 'Play fixture' });
      await player.click();
      await expect(frame.contentFrame().getByRole('button', { name: 'Playing fixture' })).toBeVisible();
      expect((await frame.boundingBox())!.width).toBeLessThanOrEqual(page.viewportSize()!.width);
    }
    const video = article.locator('video');
    await video.evaluate(async (element: HTMLVideoElement) => { element.muted = true; await element.play(); });
    await expect.poll(() => video.evaluate((element: HTMLVideoElement) => element.currentTime)).toBeGreaterThan(0);
    await page.reload();
    await expect(article.locator('img')).toHaveCount(6);
    await expect(article.locator('iframe')).toHaveCount(3);
  }
});

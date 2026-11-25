import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright';
import { loadEnv } from 'vite';
import { buildRedirects, buildSitemap, canonicalRoute, localizedRoute, SEO_LANGUAGES, STATIC_ROUTES } from './seo-build-lib.mjs';
import { offlineBuildContent } from './prerender-defaults.mjs';

const projectRoot = process.cwd();
const distDir = join(projectRoot, process.env.BUILD_OUTPUT_DIR || 'dist');
const env = { ...loadEnv('production', projectRoot, ''), ...process.env };
const siteUrl = (env.VITE_SITE_URL || 'https://visitigamedia.com').replace(/\/$/, '');
if (!/^https:\/\/[a-z0-9.-]+(?::\d+)?$/i.test(siteUrl)) {
  throw new Error('VITE_SITE_URL harus berupa origin HTTPS tanpa path.');
}
const requireNews = env.SEO_REQUIRE_NEWS === 'true';
const qwordsStaticOnly = env.QWORDS_STATIC_ONLY === 'true';
const publicTables = ['news','portfolios','products','service_content','service_landings','product_catalogue',
  'homepage_content','about_content','contact_settings','careers_jobs','careers_page_content'];

async function publicSnapshot() {
  let value;
  if (env.QWORDS_CONTENT_EXPORT && env.QWORDS_CONTENT_API) throw new Error('Pilih satu sumber snapshot konten.');
  if (env.QWORDS_CONTENT_EXPORT) {
    const text = await readFile(env.QWORDS_CONTENT_EXPORT, 'utf8');
    if (Buffer.byteLength(text) > 32 * 1024 * 1024) throw new Error('Snapshot terlalu besar.');
    value = JSON.parse(text.replace(/^\uFEFF/, ''));
  } else {
    const origin = env.QWORDS_CONTENT_API || '';
    if (!/^https:\/\/[a-z0-9.-]+(?::\d+)?$/i.test(origin) || (env.QWORDS_EXPORT_KEY || '').length < 32) throw new Error('Sumber snapshot HTTPS dan token privat diperlukan.');
    const response = await fetch(origin + '/api/content-export', {
      headers: { 'X-Qwords-Export': env.QWORDS_EXPORT_KEY }, signal: AbortSignal.timeout(20_000), redirect: 'error',
    });
    if (!response.ok) throw new Error(`Ekspor konten gagal (HTTP ${response.status}).`);
    const reader = response.body.getReader();
    const chunks = [];
    let received = 0;
    while (true) {
      const { done, value: chunk } = await reader.read();
      if (done) break;
      received += chunk.length;
      if (received > 32 * 1024 * 1024) {
        await reader.cancel();
        throw new Error('Snapshot terlalu besar.');
      }
      chunks.push(Buffer.from(chunk));
    }
    value = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  }
  const fields = JSON.parse(await readFile(new URL('../server/qwords/app/schema.json', import.meta.url), 'utf8'));
  if (value?.version !== 1 || !value.tables || Object.keys(value.tables).some((name) => !publicTables.includes(name))) throw new Error('Format snapshot publik tidak valid.');
  for (const table of publicTables) {
    const rows = value.tables[table];
    if (!Array.isArray(rows) || rows.length > 10000) throw new Error(`Snapshot ${table} tidak valid.`);
    for (const row of rows) {
      if (!row || Array.isArray(row) || typeof row !== 'object' || Object.keys(row).some((key) =>
        !Object.prototype.hasOwnProperty.call(fields[table], key) && !(table === 'service_landings' && key === 'service_landing_portfolios'))) throw new Error(`Kolom snapshot ${table} tidak valid.`);
      if (table === 'service_landings' && (!Array.isArray(row.service_landing_portfolios) || row.service_landing_portfolios.some((link) =>
        !link || Object.keys(link).some((key) => !['portfolio_id','position'].includes(key))))) throw new Error('Relasi snapshot tidak valid.');
      if ((table === 'news' && !row.published_at) || (table === 'careers_jobs' && row.status !== 'published')) throw new Error('Snapshot berisi konten belum terbit.');
      if (/https?:[^"\s]*\/storage\/v1\/object\//i.test(JSON.stringify(row))) throw new Error('Pindahkan referensi Supabase Storage ke media lokal sebelum build.');
      if (JSON.stringify(row).includes('/api/admin/files/')) throw new Error('Snapshot publik memuat referensi dokumen privat.');
    }
  }
  return value.tables;
}

async function getBuildContent() {
  if (env.SEO_OFFLINE === 'true' || (!env.QWORDS_CONTENT_EXPORT && !env.QWORDS_CONTENT_API)) {
    if (requireNews) throw new Error('Snapshot konten publik diperlukan.');
    console.warn('[seo] Prerender lokal memakai fallback statis.');
    return offlineBuildContent();
  }
  const tables = await publicSnapshot();
  const { news, portfolios, products, service_content: serviceRows, service_landings: serviceLandings,
    product_catalogue: catalogueRows, homepage_content: homepageRows, about_content: aboutRows,
    contact_settings: contactRows, careers_jobs: careerJobs, careers_page_content: careersRows } = tables;
  if (requireNews && !homepageRows?.[0]) throw new Error('Homepage CMS wajib tersedia untuk build online.');
  if (requireNews && qwordsStaticOnly) {
    for (const [table, rows] of Object.entries({
      service_content: serviceRows, product_catalogue: catalogueRows, about_content: aboutRows,
      contact_settings: contactRows, careers_page_content: careersRows,
    })) if (!rows?.[0]) throw new Error(`Baris konfigurasi publik CMS belum tersedia: ${table}.`);
    for (const path of STATIC_ROUTES.filter((route) => route.startsWith('/services/'))) {
      if (!serviceLandings.some(({ slug }) => slug === path.split('/').at(-1))) {
        throw new Error(`Landing CMS belum tersedia: ${path}.`);
      }
    }
  }
  return {
    news: news ?? [], portfolios, products,
    serviceContent: serviceRows?.[0] ?? null,
    serviceLandings: serviceLandings?.map((landing) => ({
      ...landing,
      related_portfolio_ids: [...(landing.service_landing_portfolios ?? [])].sort((a, b) => a.position - b.position).map(({ portfolio_id }) => portfolio_id),
    })) ?? null,
    catalogue: catalogueRows?.[0] ?? null,
    homepage: homepageRows?.[0] ?? null,
    about: aboutRows?.[0] ?? null,
    tables: { news: news ?? [], portfolios: portfolios ?? [], products: products ?? [], service_content: serviceRows ?? [], service_landings: serviceLandings ?? [], product_catalogue: catalogueRows ?? [], homepage_content: homepageRows ?? [], about_content: aboutRows ?? [], contact_settings: contactRows ?? [], careers_jobs: careerJobs ?? [], careers_page_content: careersRows ?? [] },
  };
}

function dataForRoute(path, content) {
  const publicPath = (path.replace(/^\/(?:id|en)(?=\/|$)/, '').replace(/\/+$/, '') || '/');
  if (publicPath === '/news') return { route: path, news: content.news };
  if (publicPath.startsWith('/news/')) return { route: path, news: content.news, article: content.news.find(({ slug }) => publicPath === `/news/${slug}`) ?? null };
  if (publicPath === '/services') return { route: path, serviceContent: content.serviceContent, portfolios: content.portfolios ?? undefined };
  if (publicPath.startsWith('/services/')) return { route: path, portfolios: content.portfolios ?? undefined, serviceLanding: content.serviceLandings?.find(({ slug }) => publicPath === `/services/${slug}`) ?? null };
  if (publicPath === '/product') return { route: path, products: content.products ?? undefined, catalogue: content.catalogue };
  if (publicPath === '/portfolio') return { route: path, portfolios: content.portfolios ?? undefined };
  if (publicPath.startsWith('/portfolio/')) return { route: path, portfolios: content.portfolios ?? undefined, portfolio: content.portfolios?.find(({ slug }) => publicPath === `/portfolio/${slug}`) ?? null };
  if (publicPath === '/') return { route: path, news: content.news, portfolios: content.portfolios ?? undefined, homepage: content.homepage };
  if (publicPath === '/about') return { route: path, about: content.about };
  return { route: path };
}

async function waitForServer(url, child) {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    if (child.exitCode !== null) throw new Error(`Server preview berhenti dengan kode ${child.exitCode}.`);
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch { /* Server belum siap. */ }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error('Server preview tidak siap dalam 20 detik.');
}

async function stopServer(child) {
  if (child.exitCode !== null) return;
  const exited = once(child, 'exit');
  child.kill();
  await exited;
}

async function snapshot(page, path, content, outputOverride) {
  const response = await page.goto(`http://127.0.0.1:4173${path}`, { waitUntil: 'domcontentloaded' });
  if (!response?.ok()) throw new Error(`${path} mengembalikan status ${response?.status() ?? 'tanpa respons'}.`);
  const publicPath = (path.replace(/^\/(?:id|en)(?=\/|$)/, '').replace(/\/+$/, '') || '/');
  // Detail pages can render either an article shell or a fallback state while
  // data is resolving. Both states expose the page's primary heading as h1.
  await page.waitForSelector('h1', { timeout: 15_000 });
  // All CMS reads below are fulfilled from the frozen public build dataset.
  // Waiting for them captures contact/careers and other effect-driven content too.
  await page.waitForLoadState('networkidle');
  if (publicPath === '/news') {
    await page.waitForFunction(() => {
      const text = document.querySelector('#main-content')?.textContent || '';
      return !text.includes('Memuat berita') && !text.includes('Loading news');
    }, undefined, { timeout: 15_000 });
  }
  await page.waitForFunction(() => {
    const canonical = document.querySelector('link[rel="canonical"]');
    return Boolean(document.title && canonical && document.querySelector('meta[name="description"]'));
  });
  if (publicPath !== '/__not-found') {
    await page.waitForFunction((expected) => {
      const canonical = document.querySelector('link[rel="canonical"]');
      const robots = document.querySelector('meta[name="robots"]');
      return canonical?.href === expected.url && robots?.content === expected.robots;
    }, { url: `${siteUrl}${canonicalRoute(path.startsWith('/id/') || path.startsWith('/en/') ? path : localizedRoute(path, 'en'))}`, robots: env.VITE_NOINDEX === 'true' ? 'noindex, follow' : 'index, follow' });
  }
  const routeData = dataForRoute(path, content);
  await page.evaluate((data) => {
    document.documentElement.dataset.prerendered = 'true';
    if (window.__VISITIGA_SITE_URL__) document.documentElement.dataset.siteUrl = window.__VISITIGA_SITE_URL__;
    const snapshot = document.getElementById('root');
    if (!snapshot) throw new Error('Root prerender tidak ditemukan.');
    snapshot.id = 'prerender-content';
    const clientRoot = document.createElement('div');
    clientRoot.id = 'root';
    snapshot.before(clientRoot);
    const swapStyle = document.createElement('style');
    swapStyle.id = 'prerender-swap-style';
    swapStyle.textContent = '#root{display:none}';
    document.head.appendChild(swapStyle);
    const existing = document.getElementById('visitiga-prerender-data');
    existing?.remove();
    const script = document.createElement('script');
    script.id = 'visitiga-prerender-data';
    script.type = 'application/json';
    script.textContent = JSON.stringify(data).replace(/</g, '\\u003c');
    document.head.appendChild(script);
  }, routeData);
  const html = `<!doctype html>\n${await page.locator('html').evaluate((element) => element.outerHTML)}`;
  const output = outputOverride ?? (path === '/' ? join(distDir, 'index.html') : join(distDir, path.slice(1), 'index.html'));
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, html, 'utf8');
}

async function validateOutput(routes) {
  for (const path of routes) {
    const output = path === '/' ? join(distDir, 'index.html') : join(distDir, path.slice(1), 'index.html');
    const html = await readFile(output, 'utf8');
    const required = ['<title>', 'name="description"', 'rel="canonical"', 'property="og:title"', 'name="twitter:card"',
      'hreflang="id"', 'hreflang="en"', 'hreflang="x-default"', 'application/ld+json', '<h1'];
    for (const marker of required) if (!html.includes(marker)) throw new Error(`${output} tidak memiliki ${marker}.`);
    if (!html.includes(`${siteUrl}${canonicalRoute(path)}`)) throw new Error(`${output} memiliki canonical yang salah.`);
    if (html.includes('Memuat berita…') || html.includes('Loading news…')) throw new Error(`${output} masih berisi placeholder pemuatan.`);
  }
}

async function main() {
  const content = await getBuildContent();
  const appShell = await readFile(join(distDir, 'index.html'), 'utf8');
  const articles = content.news;
  for (const row of [...articles, ...(content.portfolios ?? [])]) {
    if (typeof row.slug !== 'string' || row.slug.length > 120 || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(row.slug)) throw new Error('Slug CMS tidak valid untuk prerender.');
  }
  const articleRoutes = articles.map(({ slug }) => `/news/${slug}`);
  if (content.portfolios?.some(({ slug }) => !slug)) throw new Error('Migrasi slug portofolio belum diterapkan di Supabase. Jalankan migrasi sebelum build/deploy.');
  const portfolioRoutes = (content.portfolios ?? []).map(({ slug }) => `/portfolio/${slug}`);
  const baseRoutes = qwordsStaticOnly ? STATIC_ROUTES : [...STATIC_ROUTES, ...articleRoutes, ...portfolioRoutes];
  const routes = baseRoutes.flatMap((path) => SEO_LANGUAGES.map((language) => localizedRoute(path, language)));
  const viteBin = join(projectRoot, 'node_modules', 'vite', 'bin', 'vite.js');
  const server = spawn(process.execPath, [viteBin, 'preview', '--outDir', distDir, '--host', '127.0.0.1', '--port', '4173', '--strictPort'], { stdio: 'inherit' });
  let browser;
  try {
    await waitForServer('http://127.0.0.1:4173/', server);
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    await page.route('**/api/**', (route) => {
      const request = route.request();
      const url = new URL(request.url());
      if (request.method() !== 'GET' || !url.pathname.startsWith('/api/content/')) {
        return route.fulfill({ status: 200, json: null });
      }
      const table = url.pathname.split('/').at(-1);
      let rows = content.tables?.[table] ?? [];
      const filters = JSON.parse(url.searchParams.get('filters') ?? '[]');
      for (const [field, operator, value] of filters) {
        if (operator === 'eq') rows = rows.filter((row) => String(row[field]) === String(value));
        if (operator === 'not-null') rows = rows.filter((row) => row[field] != null);
      }
      const offset = Number(url.searchParams.get('offset') ?? 0);
      const limit = Number(url.searchParams.get('limit') ?? 200);
      return route.fulfill({ status: 200, json: { rows: rows.slice(offset, offset + limit) } });
    });
    await page.addInitScript((origin) => { window.__VISITIGA_SITE_URL__ = origin; }, siteUrl);
    await page.addInitScript((allContent) => {
      window.__VISITIGA_PRERENDER_MODE__ = true;
      const path = window.location.pathname;
      const publicPath = (path.replace(/^\/(?:id|en)(?=\/|$)/, '').replace(/\/+$/, '') || '/');
      const data = publicPath === '/news'
        ? { route: path, news: allContent.news }
        : publicPath.startsWith('/news/')
          ? { route: path, news: allContent.news, article: allContent.news.find(({ slug }) => publicPath === `/news/${slug}`) ?? null }
          : publicPath === '/services'
            ? { route: path, serviceContent: allContent.serviceContent, portfolios: allContent.portfolios ?? undefined }
          : publicPath.startsWith('/services/')
            ? { route: path, portfolios: allContent.portfolios ?? undefined, serviceLanding: allContent.serviceLandings?.find(({ slug }) => publicPath === `/services/${slug}`) ?? null }
            : publicPath === '/product'
              ? { route: path, products: allContent.products ?? undefined, catalogue: allContent.catalogue }
              : publicPath === '/portfolio'
                ? { route: path, portfolios: allContent.portfolios ?? undefined }
                : publicPath.startsWith('/portfolio/')
                  ? { route: path, portfolios: allContent.portfolios ?? undefined, portfolio: allContent.portfolios?.find(({ slug }) => publicPath === `/portfolio/${slug}`) ?? null }
                  : publicPath === '/'
                    ? { route: path, news: allContent.news, portfolios: allContent.portfolios ?? undefined, homepage: allContent.homepage }
                    : publicPath === '/about' ? { route: path, about: allContent.about }
                    : { route: path };
      window.__VISITIGA_PRERENDER_DATA__ = data;
    }, content);
    for (const path of routes) {
      await snapshot(page, path, content);
      console.log(`[seo] prerendered ${path}`);
    }
    await snapshot(page, '/id/__not-found', content, join(distDir, '404.html'));
    console.log('[seo] prerendered 404');
    if (!qwordsStaticOnly) await writeFile(join(distDir, '_redirects'), buildRedirects(articles), 'utf8');
  } finally {
    await browser?.close();
    await stopServer(server);
  }
  const adminShell = appShell
    .replace('<meta name="robots" content="index, follow" />', '<meta name="robots" content="noindex, nofollow" />')
    .replace(`<link rel="canonical" href="${siteUrl}/" />`, `<link rel="canonical" href="${siteUrl}/admin" />`)
    .replace(/<title>.*?<\/title>/, '<title>Admin Visitiga</title>');
  await mkdir(join(distDir, 'admin'), { recursive: true });
  await writeFile(join(distDir, 'admin', 'index.html'), adminShell, 'utf8');
  await writeFile(join(distDir, 'portfolio-fallback.html'), appShell, 'utf8');
  await writeFile(join(distDir, '_routes.json'), JSON.stringify({ version: 1, include: ['/api/*', '/sitemap.xml', '/news/*', '/portfolio/*', '/id/news/*', '/en/news/*', '/id/portfolio/*', '/en/portfolio/*'], exclude: [] }), 'utf8');
  await writeFile(join(distDir, 'sitemap.xml'), buildSitemap(STATIC_ROUTES, articles, siteUrl, content.portfolios ?? []), 'utf8');
  await writeFile(join(distDir, 'robots.txt'), `User-agent: *\nAllow: /\nDisallow: /admin\n\nSitemap: ${siteUrl}/sitemap.xml\n`, 'utf8');
  await validateOutput(routes);
  console.log(`[seo] ${routes.length} halaman tervalidasi; sitemap dan robots.txt dibuat.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}

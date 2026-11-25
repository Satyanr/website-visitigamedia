import { createHash } from 'node:crypto';
import { access, readFile, writeFile } from 'node:fs/promises';
import { offlineBuildContent } from './prerender-defaults.mjs';

function seedId(namespace, key) {
  const digest = createHash('sha256').update(`${namespace}:${key}`).digest('hex');
  return `${digest.slice(0,8)}-${digest.slice(8,12)}-5${digest.slice(13,16)}-a${digest.slice(17,20)}-${digest.slice(20,32)}`;
}

async function tuples(file) {
  const text = await readFile(new URL(`../supabase/migrations/${file}`, import.meta.url), 'utf8');
  return [...text.matchAll(/from\s*\(values\s*([\s\S]+?)\)\s*as legacy\(/gi)].map(([, rows]) =>
    [...rows.matchAll(/\(((?:E?'(?:''|[^'])*'(?:\:\:date)?|\d+|,|\s)+)\)/g)].map(([, row]) =>
      [...row.matchAll(/(E)?'((?:''|[^'])*)'(?:\:\:date)?|(\d+)/g)].map(([, escaped, string, integer]) =>
        integer !== undefined ? Number(integer) : string.replaceAll("''", "'").replace(/\\n/g, escaped ? '\n' : '\\n'))));
}

const stamp = '2026-08-24T00:00:00Z';
const slugify = (value) => value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const ids = new Set();
function uniqueSlug(title) {
  const base = slugify(title);
  let candidate = base;
  for (let suffix = 2; ids.has(candidate); suffix++) candidate = `${base}-${suffix}`;
  ids.add(candidate);
  return candidate;
}
async function builtImage(original) {
  // 20261008000000_move_plaza_indonesia_portfolio_image records the move.
  const verified = original === '/portfolio/indoor-9.jpg' ? '/portfolio/indoor/indoor-9.jpg' : original;
  const webp = verified.replace(/\.(?:png|jpe?g)$/i,'.webp');
  for (const path of [webp, verified]) {
    try { await access(new URL('../public' + path, import.meta.url)); return path; }
    catch { /* Try the original file. */ }
  }
  throw new Error(`Missing reviewed seed asset ${original}. Map the verified original before using the seed.`);
}

const [portfolio, news] = await tuples('20260824020000_import_legacy_content.sql');
const [products] = await tuples('20260826000000_add_product_catalog_cards.sql');
if (!portfolio.length || !news.length || products.length !== 6) throw new Error('Unexpected historical seed rows.');
const { tables } = await offlineBuildContent();
tables.portfolios = await Promise.all(portfolio.map(async ([title, path, client, category, description]) => ({
  id: seedId('portfolio',path), slug: uniqueSlug(title), title, image_url: await builtImage(path),
  client, category, description, overview:'', seo_title:'',seo_description:'', project_date:null, created_at:stamp,updated_at:stamp,
})));
ids.clear();
tables.news = await Promise.all(news.map(async ([title,path,content,category,excerpt,publication]) => ({
  id:seedId('news',path),slug:uniqueSlug(title),title,cover_image:await builtImage(path),content,category,excerpt,author:'Visitiga Media',
  seo_title:'',seo_description:'',cover_alt:'',target_keyword:'',published_at:publication+'T00:00:00Z',created_at:stamp,updated_at:stamp,
})));
tables.products = await Promise.all(products.map(async ([name,path,category,description,label,color,accent,sort_order]) => ({
  id:seedId('product',path),name,image_url:await builtImage(path),category,description,label,color,accent,sort_order,created_at:stamp,updated_at:stamp,
})));
tables.product_catalogue = [{ id:1, title:'Product Catalogue',title_en:'Product Catalogue',title_id:'Katalog Produk',
  file_url:'/products/product-catalogue-2026.pdf',updated_at:stamp }];
for (const table of ['contact_settings','careers_page_content']) tables[table] = [{ ...tables[table][0], id:1, updated_at:stamp }];
for (const table of ['homepage_content','about_content','service_content']) tables[table] = [{ ...tables[table][0], updated_at:stamp }];
const { process_eyebrow, process_title, process: processSteps, ...service } = tables.service_content[0];
tables.service_content = [{ ...service, content_en: { process_eyebrow, process_title, process: processSteps } }];
tables.service_landings = tables.service_landings.map(({ related_portfolio_ids: _ids, ...row }) => ({ ...row, updated_at:stamp }));
const output = JSON.stringify({ version:1, tables }) + '\n';
if (process.argv[2]) await writeFile(process.argv[2], output, { flag: 'wx', mode: 0o600 });
else process.stdout.write(output);

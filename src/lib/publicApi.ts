import type { AboutContent, CareerJob, CareersPageContent, ContactSettings, HomepageContent, NewsRecord, Portfolio, Product, ProductCatalogue } from '@/types/admin';

async function client() {
  const { api } = await import('@/lib/api');
  if (!api) throw new Error('Layanan website belum tersedia.');
  return api;
}

export async function listPublicPortfolios(): Promise<Portfolio[]> {
  const { data, error } = await (await client()).from('portfolios').select('*').order('created_at', { ascending: false });
  if (error) throw error;
  return data as unknown as Portfolio[];
}

export async function listPublicNews(): Promise<NewsRecord[]> {
  const { data, error } = await (await client()).from('news').select('*').not('published_at', 'is', null).order('published_at', { ascending: false });
  if (error) throw error;
  return data as unknown as NewsRecord[];
}

export async function listPublicProducts(): Promise<Product[]> {
  const { data, error } = await (await client()).from('products').select('*').order('sort_order').order('created_at');
  if (error) throw error;
  return data as unknown as Product[];
}

export async function getPublicHomepageContent(): Promise<HomepageContent | null> {
  const { data, error } = await (await client()).from('homepage_content').select('*').eq('id', 1).maybeSingle();
  if (error) throw error;
  return data as unknown as HomepageContent | null;
}

export async function getPublicContactSettings(): Promise<ContactSettings | null> {
  const { data, error } = await (await client()).from('contact_settings').select('*').eq('id', 1).maybeSingle();
  if (error) throw error;
  return data as unknown as ContactSettings | null;
}

export async function getPublicAboutContent(): Promise<AboutContent | null> {
  const { data, error } = await (await client()).from('about_content').select('*').eq('id', 1).maybeSingle();
  if (error) throw error;
  return data as unknown as AboutContent | null;
}

export async function getProductCatalogue(): Promise<ProductCatalogue | null> {
  const { data, error } = await (await client()).from('product_catalogue').select('*').eq('id', 1).maybeSingle();
  if (error) throw error;
  return data as unknown as ProductCatalogue | null;
}

export async function listPublicCareerJobs(): Promise<CareerJob[]> {
  const { data, error } = await (await client()).from('careers_jobs').select('*').eq('status', 'published').order('sort_order').order('created_at', { ascending: false });
  if (error) throw error;
  return data as unknown as CareerJob[];
}

export async function getPublicCareersPageContent(): Promise<CareersPageContent | null> {
  const { data, error } = await (await client()).from('careers_page_content').select('*').eq('id', 1).maybeSingle();
  if (error) throw error;
  return data as unknown as CareersPageContent | null;
}

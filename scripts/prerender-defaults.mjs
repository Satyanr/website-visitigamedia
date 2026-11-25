import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { transformWithEsbuild } from 'vite';

// Reuse existing typed content defaults during explicitly offline builds.
// Vite strips types; local default-module imports become immutable data URLs.
const modules = new Map();
async function defaultModule(name) {
  if (modules.has(name)) return modules.get(name);
  const source = await readFile(join(process.cwd(), 'src/lib', `${name}.ts`), 'utf8');
  let { code } = await transformWithEsbuild(source, `${name}.ts`, { loader: 'ts' });
  for (const match of [...code.matchAll(/from ["']@\/lib\/([A-Za-z]+)["']/g)]) {
    const dependency = await defaultModule(match[1]);
    code = code.replace(match[0], `from '${dependency.url}'`);
  }
  const url = `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`;
  const result = { url, value: await import(url) };
  modules.set(name, result);
  return result;
}

export async function offlineBuildContent() {
  const defaults = {};
  for (const name of ['homepageContent', 'aboutContent', 'serviceContent', 'serviceLanding', 'contactSettings', 'careersPageContent']) Object.assign(defaults, (await defaultModule(name)).value);
  const homepage = { id: 1, ...defaults.defaultHomepageContent };
  const about = { id: 1, ...defaults.defaultAboutContent };
  const serviceContent = { id: 1, ...defaults.defaultServiceContent };
  const serviceLandings = Object.values(defaults.defaultServiceLandings);
  return {
    news: [], portfolios: [], products: [], serviceContent, serviceLandings, catalogue: null, homepage, about,
    tables: { homepage_content: [homepage], about_content: [about], service_content: [serviceContent], service_landings: serviceLandings, contact_settings: [defaults.defaultContactSettings], careers_page_content: [defaults.defaultCareersPageContent], careers_jobs: [] },
  };
}

import { request } from '@/lib/api';

export async function translateContent<T>(content: T): Promise<T> {
  const result = await request<{ content: T }>('translate-content', 'POST', {
    source_locale: 'en', target_locale: 'id', content,
  });
  return result.content;
}

function overlay(template: unknown, supplied: unknown): unknown {
  if (supplied === undefined) return template;
  if (Array.isArray(template) && Array.isArray(supplied)) {
    return supplied.map((entry, index) => overlay(template[index] ?? template[0] ?? entry, entry));
  }
  if (template && supplied && typeof template === 'object' && typeof supplied === 'object'
    && !Array.isArray(template) && !Array.isArray(supplied)) {
    const fields = supplied as Record<string, unknown>;
    return Object.fromEntries(Object.entries(template).map(([key, value]) => [key, overlay(value, Object.prototype.hasOwnProperty.call(fields, key) ? fields[key] : undefined)]));
  }
  if (typeof template === 'string' && typeof supplied === 'string') return supplied;
  throw new Error('Format terjemahan tidak sesuai dengan versi English.');
}

export async function localize<T>(english: T, previous?: T, form?: FormData, field = 'locale_id'): Promise<T> {
  if (form?.get(`auto_${field}`) === 'on') return translateContent(english);
  const manual = form?.get(field);
  if (typeof manual === 'string' && manual.trim()) {
    let parsed: unknown;
    try { parsed = JSON.parse(manual); }
    catch { throw new Error('Format JSON Bahasa Indonesia tidak valid.'); }
    return overlay(english, parsed) as T;
  }
  return previous ?? english;
}

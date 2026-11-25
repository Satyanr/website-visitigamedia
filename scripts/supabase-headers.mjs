export function publicSupabaseHeaders(key) {
  const headers = { apikey: key };
  if (!key.startsWith('sb_publishable_')) headers.Authorization = `Bearer ${key}`;
  return headers;
}

export interface ApiError extends Error { code?: string; status?: number }
export interface AdminSession { user: { id: string; email: string; role: 'admin' }; csrf: string; translationEnabled: boolean }
type Row = Record<string, unknown>;
type Filter = [string, 'eq' | 'gte' | 'lt' | 'null' | 'not-null', unknown];
type QueryResult<T> = { data: T; error: ApiError | null; count?: number };
let csrf = '';

export async function request<T>(path: string, method = 'GET', payload?: unknown): Promise<T> {
  const headers = new Headers({ Accept: 'application/json' });
  if (csrf && method !== 'GET') headers.set('X-CSRF-Token', csrf);
  if (payload !== undefined && !(payload instanceof FormData)) headers.set('Content-Type', 'application/json');
  const response = await fetch(`/api/${path}`, {
    method, credentials: 'same-origin', cache: 'no-store', headers,
    body: payload instanceof FormData ? payload : payload === undefined ? undefined : JSON.stringify(payload),
  });
  const value = await response.json().catch(() => null);
  if (!response.ok) {
    if (response.status === 401 && csrf) {
      csrf = '';
      window.dispatchEvent(new Event('admin-session-expired'));
    }
    throw Object.assign(new Error(value?.error || 'Layanan website sementara tidak tersedia.'), { code: value?.code, status: response.status });
  }
  return value as T;
}

async function safe<T>(callback: () => Promise<T>, fallback: T): Promise<QueryResult<T>> {
  try { return { data: await callback(), error: null }; }
  catch (error) { return { data: fallback, error: error as ApiError }; }
}

class Collection {
  private method = 'GET';
  private projection = '*';
  private filters: Filter[] = [];
  private sort: [string, boolean][] = [];
  private size?: number;
  private offset = 0;
  private countOnly = false;
  private payload?: object;
  private cursor?: { created_at: string; id: string };
  constructor(private readonly name: string, private readonly admin: boolean) {}
  select(columns = '*', options?: { count: 'exact'; head: boolean }) {
    this.projection = columns; this.countOnly = options?.head === true; return this;
  }
  eq(key: string, value: unknown) { this.filters.push([key, 'eq', value]); return this; }
  gte(key: string, value: string) { this.filters.push([key, 'gte', value]); return this; }
  lt(key: string, value: string) { this.filters.push([key, 'lt', value]); return this; }
  is(key: string, value: null) { this.filters.push([key, 'null', value]); return this; }
  not(key: string, _operator: 'is', value: null) { this.filters.push([key, 'not-null', value]); return this; }
  order(key: string, options?: { ascending?: boolean; nullsFirst?: boolean }) {
    this.sort.push([key, options?.ascending !== false]); return this;
  }
  limit(size: number) { this.size = size; return this; }
  range(first: number, last: number) { this.offset = first; this.size = last - first + 1; return this; }
  before(cursor: { created_at: string; id: string }) { this.cursor = cursor; return this; }
  insert(payload: object) { this.method = 'POST'; this.payload = payload; return this; }
  update(payload: object) { this.method = 'PATCH'; this.payload = payload; return this; }
  upsert(payload: object) { this.method = 'PUT'; this.payload = payload; return this; }
  delete() { this.method = 'DELETE'; return this; }
  private async run(): Promise<QueryResult<Row[]>> {
    const fallback: Row[] = [];
    try {
      const scope = this.admin || !['GET'].includes(this.method) ? 'admin' : 'content';
      const limit = this.size ?? 200;
      const data: Row[] = [];
      for (let offset = this.offset; offset < 100000; offset += limit) {
        const params = new URLSearchParams({ fields: this.projection, filters: JSON.stringify(this.filters), sort: JSON.stringify(this.sort),
          offset: String(offset), limit: String(limit) });
        if (this.countOnly) params.set('count', 'true');
        if (this.cursor) params.set('before', JSON.stringify(this.cursor));
        const page = await request<{ rows: Row[]; count?: number }>(`${scope}/${this.name}?${params}`, this.method, this.payload);
        data.push(...page.rows);
        if (this.method !== 'GET' || this.size || this.countOnly || page.rows.length < limit) return { data, count: page.count, error: null };
      }
      throw new Error('Gunakan filter untuk koleksi yang terlalu besar.');
    } catch (error) { return { data: fallback, error: error as ApiError }; }
  }
  then<TResult>(resolve: (result: QueryResult<Row[]>) => TResult | PromiseLike<TResult>, reject?: (error: unknown) => never) {
    return this.run().then(resolve, reject);
  }
  async maybeSingle(): Promise<QueryResult<Row | null>> {
    this.limit(1);
    const result = await this.run();
    return { data: result.data[0] ?? null, error: result.error };
  }
  async single() {
    const result = await this.maybeSingle();
    return result.data || result.error ? result : { data: null, error: new Error('Data tidak ditemukan.') };
  }
}

export const api = {
  from: (name: string) => new Collection(name, false),
  adminFrom: (name: string) => new Collection(name, true),
  rpc: (name: string, args: object = {}) => safe(() => request(`actions/${name}`, 'POST', args), null),
  media: {
    async upload(path: string, file: File) {
      const data = new FormData();
      data.set('path', path);
      data.set('file', file);
      return safe(() => request('admin/media', 'POST', data), null);
    },
    getPublicUrl: (path: string) => ({ data: { publicUrl: `/media/${path.split('/').map(encodeURIComponent).join('/')}` } }),
    list: (folder: string, options: { limit: number; offset: number }) =>
      safe(() => request<{ name: string }[]>(`admin/media?${new URLSearchParams({ folder, limit: String(options.limit), offset: String(options.offset) })}`), []),
    remove: (paths: string[]) => safe(() => request('admin/media', 'DELETE', { paths }), null),
  },
};

export async function getSession() {
  const session = await request<AdminSession | null>('session');
  csrf = session?.csrf ?? '';
  return session;
}
export async function login(email: string, password: string) {
  const session = await request<AdminSession>('session', 'POST', { email, password });
  csrf = session.csrf;
  return session;
}
export async function logout() {
  await request('session', 'DELETE');
  csrf = '';
}

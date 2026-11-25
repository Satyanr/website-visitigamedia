import { useAuth } from '@/contexts/AuthContext';

export function LocalizedEditor({ value, name = 'locale_id', template }: { value?: unknown; name?: string; template?: unknown }) {
  const { session } = useAuth();
  const initial = value === undefined ? '' : JSON.stringify(value, null, 2);
  return <details className="rounded-xl border border-slate-200 bg-slate-50 p-4 sm:col-span-2">
    <summary className="cursor-pointer text-sm font-bold text-slate-900">Bahasa Indonesia</summary>
    <label className="mt-3 block text-sm">Terjemahan manual (JSON)
      <textarea key={initial} name={name} defaultValue={initial} placeholder={template ? JSON.stringify(template, null, 2) : undefined}
        rows={9} className="mt-2 w-full rounded-lg border border-slate-300 bg-white p-3 font-mono text-sm" />
    </label>
    {session?.translationEnabled
      ? <label className="mt-2 flex gap-2 text-sm"><input name={`auto_${name}`} type="checkbox" />Buat ulang terjemahan dengan DeepL saat menyimpan</label>
      : <p className="mt-2 text-sm text-slate-500">DeepL nonaktif. Terjemahan bisa diedit dan disimpan secara manual.</p>}
  </details>;
}

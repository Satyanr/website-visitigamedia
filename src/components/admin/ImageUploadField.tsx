import { useEffect, useId, useRef, useState } from 'react';
import { ImagePlus, LoaderCircle } from 'lucide-react';
import { api } from '@/lib/api';

import { ARTICLE_IMAGE_BYTES, compressForUpload, imageExtension, type ImageFolder } from '@/lib/imageUpload';

type ImageUploadFieldProps = { name: string; label?: string; initial?: string; folder: ImageFolder; allowClear?: boolean; onUploadState?: (pending: boolean) => boolean | void; onUploaded?: (path: string) => void };

export function ImageUploadField({ name, label = 'Gambar', initial = '', folder, allowClear = false, onUploadState, onUploaded }: ImageUploadFieldProps) {
  const inputId = useId();
  const [url, setUrl] = useState(initial);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);
  useEffect(() => { setUrl(initial); setError(''); }, [initial]);

  const upload = async (file?: File) => {
    if (!file || onUploadState?.(true) === false) return;
    setUploading(true); setError('');
    try {
      const uploadFile = await compressForUpload(file, folder, folder === 'news' ? ARTICLE_IMAGE_BYTES : undefined);
      const extension = imageExtension(uploadFile);
      const path = `${folder}/${crypto.randomUUID()}.${extension}`;
      const { error: uploadError } = await api.media.upload(path, uploadFile);
      if (uploadError) throw uploadError;
      if (!mounted.current) {
        if (onUploaded) void api.media.remove([path]);
        return;
      }
      onUploaded?.(path);
      setUrl(api.media.getPublicUrl(path).data.publicUrl);
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Gambar tidak dapat diunggah.'); }
    finally { if (mounted.current) { setUploading(false); onUploadState?.(false); } }
  };

  return <div className="sm:col-span-2"><label className="text-sm font-medium" htmlFor={inputId}>{label}</label><input name={name} value={url} readOnly className="sr-only" aria-hidden="true" /><div className="mt-2 flex flex-col gap-3 rounded-xl border border-dashed border-slate-300 bg-slate-50 p-3 sm:flex-row sm:items-center"><div className="grid h-24 w-full shrink-0 place-items-center overflow-hidden rounded-lg bg-white sm:w-32">{url ? <img src={url} alt="Preview unggahan" className="h-full w-full object-cover" /> : <ImagePlus className="h-6 w-6 text-slate-400" />}</div><div><div className="flex flex-wrap gap-2"><label htmlFor={inputId} className="inline-flex cursor-pointer items-center gap-2 rounded-lg bg-white px-3 py-2 text-sm font-semibold text-slate-700 shadow-sm ring-1 ring-slate-200 hover:bg-slate-100"><input id={inputId} type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" disabled={uploading} onChange={(event) => { const file = event.target.files?.[0]; event.currentTarget.value = ''; void upload(file); }} />{uploading ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />}{uploading ? 'Mengunggah...' : url ? 'Ganti gambar' : 'Pilih gambar'}</label>{allowClear && url && <button type="button" onClick={() => setUrl('')} className="rounded-lg px-3 py-2 text-sm font-semibold text-red-600 ring-1 ring-red-200 hover:bg-red-50">Hapus gambar</button>}</div><p className="mt-2 text-xs text-slate-500">JPG, PNG, dan WebP dikompresi otomatis. Gambar slideshow dipertahankan hingga 2400 px dengan kualitas lebih tinggi.</p>{error && <p role="alert" className="mt-1 text-xs text-red-600">{error}</p>}</div></div></div>;
}

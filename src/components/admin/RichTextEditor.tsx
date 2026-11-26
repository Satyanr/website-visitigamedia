import { useEffect, useId, useRef, useState } from 'react';
import { api } from '@/lib/api';
import { articleImageUrl, articleVideo, sanitizeArticleHtml } from '@/lib/articleMedia';
import { ARTICLE_IMAGE_BYTES, compressForUpload, imageExtension } from '@/lib/imageUpload';
import 'summernote/dist/summernote-lite.css';

type Props = {
  name: string;
  initial?: string;
  onUploadState: (pending: boolean) => boolean | void;
  onUploaded: (path: string) => void;
};

function verifyImage(url: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    const fail = () => finish(new Error('Gambar tidak dapat dimuat. Gunakan URL langsung ke file gambar yang mengizinkan pemuatan dari website ini.'));
    const timeout = window.setTimeout(fail, 12000);
    const finish = (error?: Error) => {
      window.clearTimeout(timeout);
      image.onload = image.onerror = null;
      if (error) { image.removeAttribute('src'); reject(error); }
      else resolve();
    };
    image.onload = () => finish();
    image.onerror = fail;
    image.src = url;
  });
}

export function RichTextEditor({ name, initial = '', onUploadState, onUploaded }: Props) {
  const id = useId();
  const editorRef = useRef<HTMLTextAreaElement>(null);
  const videoRange = useRef<Range | null>(null);
  const insertVideo = useRef<(url: string) => void>(() => {});
  const observers = useRef({ onUploadState, onUploaded });
  observers.current = { onUploadState, onUploaded };
  const [content, setContent] = useState(initial);
  const [ready, setReady] = useState(false);
  const [editorError, setEditorError] = useState(false);
  const [mediaError, setMediaError] = useState('');
  const [progress, setProgress] = useState('');
  const [videoUrl, setVideoUrl] = useState<string | null>(null);

  useEffect(() => {
    let disposed = false;
    let destroy: (() => void) | undefined;
    const initialise = async () => {
      try {
        const editor = editorRef.current;
        if (!editor) return;
        const { default: jquery } = await import('jquery');
        window.jQuery = jquery;
        window.$ = jquery;
        await import('summernote/dist/summernote-lite.js');
        if (disposed) return;
        const $editor = jquery(editor);
        if (typeof $editor.summernote !== 'function') throw new Error('Summernote tidak berhasil dimuat.');
        let busy = false;

        const currentRange = () => $editor.summernote('editor.getLastRange').nativeRange().cloneRange();
        const insertAt = (node: HTMLElement, range: Range) => {
          if (!editable.contains(range.commonAncestorContainer)) {
            range.selectNodeContents(editable);
            range.collapse(false);
          }
          const previous = document.activeElement;
          editable.focus({ preventScroll: true });
          const selection = document.getSelection();
          selection?.removeAllRanges();
          selection?.addRange(range);
          $editor.summernote('editor.setLastRange');
          $editor.summernote('editor.insertNode', node);
          const next = document.createRange();
          next.setStartAfter(node);
          next.collapse(true);
          if (previous instanceof HTMLElement && !layout.contains(previous)) previous.focus({ preventScroll: true });
          return next;
        };
        const startMedia = () => {
          if (busy) return false;
          if (observers.current.onUploadState(true) === false) return false;
          busy = true;
          setMediaError('');
          return true;
        };
        const finishMedia = () => {
          busy = false;
          if (disposed) return;
          setProgress('');
          observers.current.onUploadState(false);
        };

        const uploadImages = async (files: File[]) => {
          if (!files.length || !startMedia()) return;
          let range = currentRange();
          const errors: string[] = [];
          try {
            for (const [index, file] of files.entries()) {
              if (disposed) break;
              setProgress(`Mengunggah gambar ${index + 1} dari ${files.length}…`);
              try {
                const compressed = await compressForUpload(file, 'news', ARTICLE_IMAGE_BYTES);
                if (disposed) break;
                const path = `news/${crypto.randomUUID()}.${imageExtension(compressed)}`;
                const { error } = await api.media.upload(path, compressed);
                if (error) throw error;
                if (disposed) { void api.media.remove([path]); break; }
                observers.current.onUploaded(path);
                const image = document.createElement('img');
                image.src = api.media.getPublicUrl(path).data.publicUrl;
                image.alt = '';
                range = insertAt(image, range);
              } catch (reason) {
                errors.push(`${file.name}: ${reason instanceof Error ? reason.message : 'Gambar gagal diunggah.'}`);
              }
            }
            if (!disposed) setMediaError(errors.join(' '));
          } finally {
            finishMedia();
          }
        };

        const insertImageUrl = async (value: string) => {
          const url = articleImageUrl(value.trim());
          if (!url) {
            setMediaError('Gunakan URL gambar HTTPS yang valid atau path gambar dari website ini.');
            return;
          }
          if (!startMedia()) return;
          const range = currentRange();
          setProgress('Memeriksa URL gambar…');
          try {
            await verifyImage(url);
            if (disposed) return;
            const image = document.createElement('img');
            image.src = url;
            image.alt = '';
            insertAt(image, range);
          } catch (reason) {
            if (!disposed && reason instanceof Error) setMediaError(reason.message);
          } finally {
            finishMedia();
          }
        };

        insertVideo.current = (value) => {
          if (busy) return;
          const video = articleVideo(value.trim());
          if (!video || !videoRange.current) {
            setMediaError('Gunakan URL HTTPS YouTube atau Vimeo, atau URL MP4/WebM publik dari website ini.');
            return;
          }
          insertAt(video, videoRange.current);
          setMediaError('');
          setVideoUrl(null);
          editable.focus({ preventScroll: true });
        };

        $editor.summernote({
          dialogsInBody: true,
          height: 320,
          acceptImageFileTypes: 'image/jpeg,image/png,image/webp',
          placeholder: 'Tulis isi artikel di sini…',
          styleTags: ['p', 'blockquote', 'pre', 'h2', 'h3', 'h4'],
          codeviewIframeFilter: false,
          onCreateLink: (value: string) => {
            const link = value.trim();
            if (/^(?:mailto|tel):[^\s/]+$/i.test(link)) return link;
            if (articleImageUrl(link)) return link;
            return /^[a-z\d-]+(?:\.[a-z\d-]+)+(?:[/?#].*)?$/i.test(link) ? articleImageUrl(`https://${link}`) ?? '#' : '#';
          },
          toolbar: [
            ['style', ['style']], ['font', ['bold', 'italic', 'underline', 'clear']],
            ['color', ['color']], ['para', ['ul', 'ol', 'paragraph']],
            ['insert', ['link', 'picture', 'articleVideo']], ['view', ['fullscreen', 'codeview']],
          ],
          buttons: {
            articleVideo: () => jquery('<button type="button" class="note-btn" aria-label="Sisipkan video">Video</button>')
              .on('mousedown', (event) => event.preventDefault())
              .on('click', () => {
                if (busy || layout.classList.contains('codeview')) return;
                videoRange.current = currentRange();
                setMediaError('');
                setVideoUrl('');
              }),
          },
          callbacks: {
            onChange: (value: string) => setContent(value),
            onChangeCodeview: (value: string) => setContent(value),
            onImageUpload: (files: FileList | File[]) => void uploadImages(Array.from(files)),
            onImageLinkInsert: (url: string) => void insertImageUrl(url),
          },
        });
        const layout = editor.nextElementSibling as HTMLElement;
        const editable = layout.querySelector<HTMLElement>('.note-editable')!;
        const paste = (event: ClipboardEvent) => {
          const clipboard = event.clipboardData;
          if (!clipboard) return;
          if (busy) { event.preventDefault(); event.stopImmediatePropagation(); return; }
          if (clipboard.files.length) return; // Summernote routes image files to onImageUpload.
          const html = clipboard.getData('text/html');
          if (!html) return;
          event.preventDefault();
          event.stopImmediatePropagation();
          $editor.summernote('editor.setLastRange');
          $editor.summernote('editor.pasteHTML', sanitizeArticleHtml(html));
        };
        const drop = (event: DragEvent) => {
          event.preventDefault();
          if (busy || !event.dataTransfer?.files.length) {
            event.stopImmediatePropagation();
            layout.classList.remove('dragover');
            return;
          }
          const range = document.caretRangeFromPoint?.(event.clientX, event.clientY);
          if (range && editable.contains(range.startContainer)) {
            editable.focus();
            const selection = document.getSelection();
            selection?.removeAllRanges();
            selection?.addRange(range);
            $editor.summernote('editor.setLastRange');
          }
          const files = Array.from(event.dataTransfer.files);
          event.stopImmediatePropagation();
          layout.classList.remove('dragover');
          void uploadImages(files);
        };
        const beforeCodeView = (event: MouseEvent) => {
          if (!(event.target instanceof Element) || !event.target.closest('.btn-codeview')) return;
          if (busy) { event.stopImmediatePropagation(); return; }
          const source = layout.querySelector<HTMLTextAreaElement>('.note-codable');
          if (layout.classList.contains('codeview') && source) source.value = sanitizeArticleHtml(source.value);
        };
        editable.addEventListener('paste', paste, true);
        layout.addEventListener('drop', drop, true);
        layout.addEventListener('click', beforeCodeView, true);
        destroy = () => {
          editable.removeEventListener('paste', paste, true);
          layout.removeEventListener('drop', drop, true);
          layout.removeEventListener('click', beforeCodeView, true);
          $editor.summernote('destroy');
        };
        const sanitized = sanitizeArticleHtml(initial);
        $editor.summernote('code', sanitized);
        setContent(sanitized);
        setReady(true);
      } catch {
        if (!disposed) setEditorError(true);
      }
    };
    void initialise();
    return () => {
      disposed = true;
      destroy?.();
    };
  }, [initial]);

  return <div className="sm:col-span-2">
    <label htmlFor={id} className="text-sm font-medium">Isi artikel</label>
    <input type="hidden" name={name} value={content} />
    <textarea id={id} ref={editorRef} defaultValue={initial} onChange={(event) => setContent(event.target.value)} className={ready ? '' : 'mt-2 min-h-64 w-full rounded-xl border border-slate-300 px-3 py-2 outline-none focus:border-orange-500'} />
    {!ready && !editorError && <p className="mt-2 text-xs text-slate-500">Memuat editor…</p>}
    {editorError && <p role="alert" className="mt-2 text-xs text-amber-700">Editor visual tidak dapat dimuat. Anda tetap dapat menulis isi artikel di kolom ini.</p>}
    {videoUrl !== null && <div className="mt-2 flex flex-wrap items-end gap-2">
      <label className="min-w-52 flex-1 text-sm">URL video
        <input type="text" inputMode="url" value={videoUrl} autoFocus onChange={(event) => setVideoUrl(event.target.value)} onKeyDown={(event) => {
          if (event.key === 'Enter') { event.preventDefault(); insertVideo.current(videoUrl); }
          if (event.key === 'Escape') { event.stopPropagation(); setVideoUrl(null); setMediaError(''); }
        }} className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-1" />
      </label>
      <button type="button" className="admin-button admin-button--primary" onClick={() => insertVideo.current(videoUrl)}>Sisipkan video</button>
      <button type="button" className="admin-button" onClick={() => { setVideoUrl(null); setMediaError(''); }}>Batal</button>
    </div>}
    {progress && <p role="status" className="mt-2 text-sm text-slate-600">{progress}</p>}
    {mediaError && <p role="alert" className="mt-2 text-sm text-red-600">{mediaError}</p>}
  </div>;
}

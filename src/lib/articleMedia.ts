import DOMPurify from 'dompurify';

function httpsUrl(value: string): URL | null {
  if (!/^https:\/\/[^/?#]/.test(value) || value.length > 2048 || /[\s\\\p{Cc}]/u.test(value)) return null;
  try {
    const url = new URL(value);
    return url.hostname && !url.username && !url.password && !url.port ? url : null;
  } catch {
    return null;
  }
}

export function articleImageUrl(value: string): string | null {
  if (value.length <= 2048 && /^\/(?!\/)/.test(value) && !/[\s\\\p{Cc}]/u.test(value)) return value;
  return httpsUrl(value)?.href ?? null;
}

export function articleVideo(value: string): HTMLIFrameElement | HTMLVideoElement | null {
  const url = httpsUrl(value);
  const path = url?.origin === window.location.origin && !url.search && !url.hash ? url.pathname : value;
  const asset = /^\/videos\/(?:[\w-]+\/)*[\w.-]+\.(?:mp4|webm)$/i;
  const publicMedia = /^\/media\/(?:homepage|news|portfolios|products|catalogues|services|imported)\/[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}\.(?:mp4|webm)$/;
  if (asset.test(path) || publicMedia.test(path)) {
    const video = document.createElement('video');
    video.src = path;
    video.controls = true;
    video.playsInline = true;
    video.preload = 'metadata';
    return video;
  }

  if (!url) return null;
  const { hostname, pathname, searchParams } = url;
  const youtube = ['youtube.com', 'www.youtube.com'].includes(hostname);
  const privateYoutube = ['youtube-nocookie.com', 'www.youtube-nocookie.com'].includes(hostname);
  let source = '';
  if (youtube || privateYoutube || hostname === 'youtu.be') {
    const id = hostname === 'youtu.be' ? pathname.slice(1)
      : youtube && pathname === '/watch' ? searchParams.get('v')
      : (youtube ? /^\/(?:embed|shorts)\/([^/]+)$/ : /^\/embed\/([^/]+)$/).exec(pathname)?.[1];
    if (id && /^[\w-]{11}$/.test(id)) {
      source = `https://www.${privateYoutube ? 'youtube-nocookie.com' : 'youtube.com'}/embed/${id}`;
    }
  } else if (['vimeo.com', 'www.vimeo.com', 'player.vimeo.com'].includes(hostname)) {
    const match = (hostname === 'player.vimeo.com' ? /^\/video\/(\d{1,12})$/
      : /^\/(\d{1,12})(?:\/([a-f\d]{10}))?$/i).exec(pathname);
    if (match) {
      const hash = match[2] ?? searchParams.get('h');
      source = `https://player.vimeo.com/video/${match[1]}${hash && /^[a-f\d]{10}$/i.test(hash) ? `?h=${hash}` : ''}`;
    }
  }
  if (!source) return null;
  const frame = document.createElement('iframe');
  frame.src = source;
  frame.title = hostname.includes('vimeo') ? 'Vimeo video' : 'YouTube video';
  frame.loading = 'lazy';
  frame.referrerPolicy = 'strict-origin-when-cross-origin';
  frame.allow = 'fullscreen; picture-in-picture; encrypted-media';
  frame.allowFullscreen = true;
  return frame;
}

export function sanitizeArticleHtml(html: string): string {
  const fragment = DOMPurify.sanitize(html, {
    USE_PROFILES: { html: true },
    ADD_TAGS: ['iframe'],
    FORBID_TAGS: ['object', 'embed', 'source', 'track', 'audio', 'form', 'input', 'button', 'textarea', 'select'],
    FORBID_ATTR: ['srcdoc', 'srcset', 'poster', 'id', 'name'],
    RETURN_DOM_FRAGMENT: true,
  });
  fragment.querySelectorAll('iframe, video, img').forEach((node) => {
    const src = node.getAttribute('src') ?? '';
    if (node.tagName === 'IMG') {
      const url = articleImageUrl(src);
      if (url) node.setAttribute('src', url);
      else node.remove();
      return;
    }
    const video = articleVideo(src);
    if (video?.tagName === node.tagName) node.replaceWith(video);
    else node.remove();
  });
  fragment.querySelectorAll('[style]').forEach((node) => {
    const rules = (node.getAttribute('style') ?? '').split(';').map((rule) => rule.trim()).filter((rule) =>
      /^(?:(?:text-align|font-weight|font-style):\s*[\da-z-]+|(?:font-size|width|max-width|height):\s*[.\d]+(?:px|%|em|rem)|(?:color|background-color):\s*(?:#[\da-f]{3,8}|[a-z]+|rgba?\([\d.,% ]+\)))$/i.test(rule),
    );
    if (rules.length) node.setAttribute('style', rules.join(';'));
    else node.removeAttribute('style');
  });
  const template = document.createElement('template');
  template.content.append(fragment);
  return template.innerHTML;
}

export function appendMissingArticleMedia(localized: string, source: string): string {
  const local = document.createElement('template');
  local.innerHTML = sanitizeArticleHtml(localized);
  const original = document.createElement('template');
  original.innerHTML = source;
  const existing = new Map<string, number>();
  const keyOf = (node: Element) => `${node.tagName}:${node.getAttribute('src')}`;
  local.content.querySelectorAll('img, iframe, video').forEach((node) => {
    const key = keyOf(node);
    existing.set(key, (existing.get(key) ?? 0) + 1);
  });
  original.content.querySelectorAll('img, iframe, video').forEach((node) => {
    const key = keyOf(node);
    const count = existing.get(key) ?? 0;
    if (count) existing.set(key, count - 1);
    else {
      const paragraph = document.createElement('p');
      paragraph.append(node.cloneNode(true));
      local.content.append(paragraph);
    }
  });
  return local.innerHTML;
}

export async function translateArticleMedia(html: string, translate: (html: string) => Promise<string>): Promise<string> {
  const template = document.createElement('template');
  template.innerHTML = html;
  const media = new Map<string, Element>();
  template.content.querySelectorAll('img, iframe, video').forEach((node) => {
    const marker = document.createElement('span');
    marker.className = 'notranslate';
    marker.setAttribute('translate', 'no');
    const token = `VISITIGA_MEDIA_${crypto.randomUUID()}`;
    marker.textContent = token;
    media.set(token, node);
    node.replaceWith(marker);
  });
  template.innerHTML = await translate(template.innerHTML);
  template.content.querySelectorAll('span.notranslate').forEach((marker) => {
    const token = marker.textContent ?? '';
    const node = media.get(token);
    if (node) {
      marker.replaceWith(node);
      media.delete(token);
    }
  });
  if (media.size) throw new Error('Terjemahan tidak dapat mempertahankan media artikel. Coba lagi atau gunakan terjemahan manual.');
  return sanitizeArticleHtml(template.innerHTML);
}

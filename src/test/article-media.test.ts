import { describe, expect, it } from 'vitest';
import { appendMissingArticleMedia, articleVideo, sanitizeArticleHtml, translateArticleMedia } from '@/lib/articleMedia';

const youtube = 'https://www.youtube.com/embed/M7lc1UVf-VE';
const privateYoutube = 'https://www.youtube-nocookie.com/embed/M7lc1UVf-VE';
const vimeo = 'https://player.vimeo.com/video/76979871?h=a0b1c2d3e4';
const direct = '/videos/service-showreel.webm';
const english = '<p>Hello</p><img src="/media/news/example.png"><img src="https://images.example.test/test.webp">';
const template = (html: string) => {
  const element = document.createElement('template');
  element.innerHTML = html;
  return element.content;
};

describe('article media policy', () => {
  it('canonicalizes supported video URLs and adds only player attributes', () => {
    expect(articleVideo('https://youtu.be/M7lc1UVf-VE?t=50')?.getAttribute('src')).toBe(youtube);
    expect(articleVideo(privateYoutube)?.getAttribute('src')).toBe(privateYoutube);
    expect(articleVideo('https://vimeo.com/76979871/a0b1c2d3e4')?.getAttribute('src')).toBe(vimeo);
    expect(articleVideo(direct)?.tagName).toBe('VIDEO');
    expect(articleVideo(direct)?.hasAttribute('controls')).toBe(true);
    expect(articleVideo('/media/services/11111111-1111-4111-8111-111111111111.mp4')?.hasAttribute('controls')).toBe(true);
    expect(articleVideo('/media/documents/11111111-1111-4111-8111-111111111111.mp4')).toBeNull();
    expect(articleVideo('https://elsewhere.example.test/clip.mp4')).toBeNull();
  });

  it('keeps valid legacy and uploaded media and removes unsafe elements and attributes', () => {
    const safe = sanitizeArticleHtml(english + `<iframe src="${youtube}" srcdoc="forbidden" onload="forbidden()"></iframe>
      <iframe src="${privateYoutube}"></iframe><iframe src="${vimeo}"></iframe>
      <video src="${direct}" autoplay poster="//example.test/x" onerror="forbidden()"></video>
      <iframe src="https://www.youtube.com.evil.test/embed/M7lc1UVf-VE"></iframe>
      <iframe src="https://www.youtube.com/redirect"></iframe><iframe src="https://user@www.youtube.com/embed/M7lc1UVf-VE"></iframe>
      <iframe src="https://player.vimeo.com:8443/video/76979871"></iframe>
      <object data="https://example.test/"></object><embed src="https://example.test/">
      <img src="http://example.test/x"><img src="data:image/png;base64,AAAA"><img src="//example.test/x">
      <img src="javascript:forbidden()"><img src="/\\example.test/x"><a href="javascript:forbidden()">x</a>
      <script>forbidden()</script><p style="position:fixed;color:red">text</p>`);
    const dom = template(safe);
    expect([...dom.querySelectorAll('iframe')].map((frame) => frame.src)).toEqual([youtube, privateYoutube, vimeo]);
    expect(dom.querySelector('video')?.getAttribute('src')).toBe(direct);
    expect(dom.querySelectorAll('img')).toHaveLength(2);
    expect(dom.querySelector('a')?.hasAttribute('href')).toBe(false);
    expect(dom.querySelector('p[style]')?.getAttribute('style')).toBe('color:red');
    expect(safe).not.toMatch(/forbidden|srcdoc|autoplay|position:fixed|<object|<embed/);
    expect(sanitizeArticleHtml(safe)).toBe(safe);
  });

  it('merges media into manually localized text and masks it for auto translation', async () => {
    const media = sanitizeArticleHtml(english + `<iframe src="${youtube}"></iframe>`);
    const localized = appendMissingArticleMedia('<p>Halo</p><img src="/media/news/example.png">', media);
    expect(localized).toContain('Halo');
    expect(template(localized).querySelectorAll('img, iframe')).toHaveLength(3);
    const translated = await translateArticleMedia(media, async (masked) => {
      expect(masked).not.toContain('/media/news/');
      expect(masked).not.toContain('youtube.com');
      return masked.replace('Hello', 'Halo');
    });
    expect(translated).toBe(media.replace('Hello', 'Halo'));
    await expect(translateArticleMedia(media, async () => '<p>Halo</p>')).rejects.toThrow('mempertahankan media');
  });
});

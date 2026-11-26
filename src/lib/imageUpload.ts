export type ImageFolder = 'products' | 'portfolios' | 'news' | 'services' | 'homepage';

export const MAX_IMAGE_INPUT_BYTES = 8 * 1024 * 1024;
// Leave space for the multipart envelope if post_max_size is also set to 2 MiB.
export const ARTICLE_IMAGE_BYTES = 2 * 1024 * 1024 - 16 * 1024;
const extensions = new Map([['image/jpeg', 'jpg'], ['image/png', 'png'], ['image/webp', 'webp']]);

export function imageExtension(file: File): string {
  const extension = extensions.get(file.type);
  if (!extension) throw new Error('Pilih gambar JPG, PNG, atau WebP.');
  return extension;
}

export async function compressForUpload(file: File, folder: ImageFolder, limit = Infinity): Promise<File> {
  imageExtension(file);
  if (file.size > MAX_IMAGE_INPUT_BYTES) throw new Error('Ukuran gambar asli maksimal 8 MiB.');
  if (file.size < 350 * 1024 && file.size <= limit) return file;
  const bitmap = await createImageBitmap(file).catch(() => {
    throw new Error('File gambar tidak dapat dibaca.');
  });
  try {
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    const homepage = folder === 'homepage';
    let dimension = homepage ? 2400 : 1600;
    let quality = homepage ? 0.9 : 0.78;
    for (let attempt = 0; context && attempt < 5; attempt++) {
      const scale = Math.min(1, dimension / Math.max(bitmap.width, bitmap.height));
      canvas.width = Math.max(1, Math.round(bitmap.width * scale));
      canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      context.imageSmoothingQuality = 'high';
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/webp', quality));
      if (blob && blob.size <= limit && blob.size < file.size) return new File([blob], file.name, { type: blob.type });
      if (file.size <= limit) return file;
      dimension = Math.floor(dimension * 0.75);
      quality = Math.max(0.5, quality - 0.08);
    }
    if (file.size <= limit) return file;
    throw new Error('Gambar masih melebihi batas unggahan 2 MiB setelah kompresi.');
  } finally {
    bitmap.close();
  }
}

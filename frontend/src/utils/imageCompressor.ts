/**
 * Ultra-Resilient Client-Side Image Compressor & Memory Optimizer.
 * Downscales oversized mobile camera photos (12MP-108MP, 8MB-20MB) to crisp 1280px JPEG.
 * Eliminates mobile OS Low Memory Killer (LMK) crashes by avoiding large base64 memory allocations.
 */

export async function compressImage(file: File, maxWidth = 1280, quality = 0.78): Promise<File> {
  // If not an image or SVG/GIF, return as is
  if (!file.type.startsWith('image/') || file.type.includes('svg') || file.type.includes('gif')) {
    return file;
  }

  return new Promise((resolve) => {
    let objectUrl = '';
    try {
      objectUrl = URL.createObjectURL(file);
    } catch {
      resolve(file);
      return;
    }

    const img = new Image();
    img.crossOrigin = 'anonymous';

    const cleanup = () => {
      if (objectUrl) {
        try {
          URL.revokeObjectURL(objectUrl);
        } catch {}
      }
    };

    img.onload = () => {
      try {
        let width = img.naturalWidth || img.width;
        let height = img.naturalHeight || img.height;

        if (!width || !height) {
          cleanup();
          resolve(file);
          return;
        }

        // Clamp maximum resolution to 1280px (maintains handwriting readability while reducing RAM footprint by ~85%)
        if (width > maxWidth || height > maxWidth) {
          if (width > height) {
            height = Math.round((height * maxWidth) / width);
            width = maxWidth;
          } else {
            width = Math.round((width * maxWidth) / height);
            height = maxWidth;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');

        if (!ctx) {
          cleanup();
          resolve(file);
          return;
        }

        // Enable high-quality image smoothing
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, 0, 0, width, height);

        // Convert to JPEG with targeted 0.75 - 0.8 quality
        const outputType = 'image/jpeg';
        canvas.toBlob(
          (blob) => {
            // Free canvas backing store memory immediately
            canvas.width = 0;
            canvas.height = 0;
            cleanup();

            if (!blob) {
              resolve(file);
            } else {
              const baseName = file.name.replace(/\.[^/.]+$/, '');
              const compressedFile = new File(
                [blob],
                `${baseName}.jpg`,
                { type: outputType, lastModified: Date.now() }
              );
              resolve(compressedFile);
            }
          },
          outputType,
          quality
        );
      } catch (err) {
        console.warn('Image downscaling failed, using original file:', err);
        cleanup();
        resolve(file);
      }
    };

    img.onerror = () => {
      cleanup();
      resolve(file);
    };

    img.src = objectUrl;
  });
}

export async function compressImages(
  files: File[],
  maxWidth = 1280,
  quality = 0.78
): Promise<{ compressedFiles: File[]; originalTotalBytes: number; compressedTotalBytes: number; savedPercentage: number }> {
  let originalTotalBytes = 0;
  let compressedTotalBytes = 0;
  const compressedFiles: File[] = [];

  // Process sequentially to prevent mobile RAM spikes
  for (const f of files) {
    originalTotalBytes += f.size;
    if (f.type.startsWith('image/') && !f.type.includes('svg') && !f.type.includes('gif')) {
      try {
        const comp = await compressImage(f, maxWidth, quality);
        compressedTotalBytes += comp.size;
        compressedFiles.push(comp);
      } catch {
        compressedTotalBytes += f.size;
        compressedFiles.push(f);
      }
    } else {
      compressedTotalBytes += f.size;
      compressedFiles.push(f);
    }
  }

  const savedBytes = Math.max(0, originalTotalBytes - compressedTotalBytes);
  const savedPercentage = originalTotalBytes > 0 ? Math.round((savedBytes / originalTotalBytes) * 100) : 0;

  return {
    compressedFiles,
    originalTotalBytes,
    compressedTotalBytes,
    savedPercentage,
  };
}

/**
 * Converts a File (already downscaled/compressed) to a base64 string for sessionStorage preservation.
 */
export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = (err) => reject(err);
    reader.readAsDataURL(file);
  });
}

/**
 * Converts a base64 string back into a File object.
 */
export function base64ToFile(base64: string, filename: string, mimeType = 'image/jpeg'): File {
  const arr = base64.split(',');
  const mime = arr[0].match(/:(.*?);/)?.[1] || mimeType;
  const bstr = atob(arr[1] || arr[0]);
  let n = bstr.length;
  const u8arr = new Uint8Array(n);
  while (n--) {
    u8arr[n] = bstr.charCodeAt(n);
  }
  return new File([u8arr], filename, { type: mime, lastModified: Date.now() });
}


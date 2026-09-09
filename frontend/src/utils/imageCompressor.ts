/**
 * Zero-dependency Client-Side Canvas Image Compressor.
 * Downscales oversized camera images (up to 48MP/108MP) to crisp 1200px JPEG,
 * shrinking 4-15MB phone photos to ~100-200KB without losing handwriting clarity.
 */
export async function compressImage(file: File, maxWidth = 1200, quality = 0.62): Promise<File> {
  // If not an image or SVG/GIF, return as is
  if (!file.type.startsWith('image/') || file.type.includes('svg') || file.type.includes('gif')) {
    return file;
  }

  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target?.result as string;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;

        // Clamp maximum resolution to 1200px (ideal for notebook scans)
        if (width > maxWidth || height > maxWidth) {
          if (width > height) {
            height = Math.round((height * maxWidth) / width);
            width = maxWidth;
          } else {
            width = Math.round((width * maxWidth) / height);
            height = maxWidth;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(file);
          return;
        }

        // Apply slight image smoothing
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, 0, 0, width, height);

        // Convert to JPEG for 100% universal support and minimal payload
        const outputType = 'image/jpeg';
        canvas.toBlob(
          (blob) => {
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
      };
      img.onerror = () => resolve(file);
    };
    reader.onerror = () => resolve(file);
  });
}

export async function compressImages(
  files: File[],
  maxWidth = 1200,
  quality = 0.62
): Promise<{ compressedFiles: File[]; originalTotalBytes: number; compressedTotalBytes: number; savedPercentage: number }> {
  let originalTotalBytes = 0;
  let compressedTotalBytes = 0;
  const compressedFiles: File[] = [];

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

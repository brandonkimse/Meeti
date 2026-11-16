"use client";

/** Resize an image file in the browser to a square-ish JPEG data URL. */
export async function fileToDataUrl(file: File, max = 384): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((res, rej) => {
      const i = new Image();
      i.onload = () => res(i);
      i.onerror = rej;
      i.src = url;
    });
    const size = Math.min(img.width, img.height);
    const scale = Math.min(1, max / size);
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(size * scale);
    canvas.height = Math.round(size * scale);
    const ctx = canvas.getContext("2d")!;
    ctx.drawImage(img, (img.width - size) / 2, (img.height - size) / 2, size, size, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", 0.85);
  } finally {
    URL.revokeObjectURL(url);
  }
}

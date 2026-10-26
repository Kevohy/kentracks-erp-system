/**
 * The main colour of an image (for example a brand icon), as "#RRGGBB", or null when it has none (only white, black or
 * greys). Runs in the browser: the image is shrunk to 64 × 64 and its strongly coloured pixels are grouped.
 */
export async function dominantColor(src: Blob | string): Promise<string | null> {
  const url = typeof src === "string" ? src : URL.createObjectURL(src);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = reject;
      i.src = url;
    });
    const size = 64;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0, size, size);
    const data = ctx.getImageData(0, 0, size, size).data;
    const groups = new Map<number, { n: number; r: number; g: number; b: number }>();
    for (let i = 0; i < data.length; i += 4) {
      const [r, g, b, a] = [data[i], data[i + 1], data[i + 2], data[i + 3]];
      if (a < 200) continue;
      const max = Math.max(r, g, b), min = Math.min(r, g, b);
      const light = (max + min) / 510;
      const sat = max === min ? 0 : (max - min) / (255 - Math.abs(max + min - 255));
      if (sat < 0.45 || light < 0.15 || light > 0.85) continue; // skip white, black and greys
      const key = ((r >> 5) << 6) | ((g >> 5) << 3) | (b >> 5);
      const e = groups.get(key) ?? { n: 0, r: 0, g: 0, b: 0 };
      e.n++; e.r += r; e.g += g; e.b += b;
      groups.set(key, e);
    }
    let best: { n: number; r: number; g: number; b: number } | null = null;
    for (const e of groups.values()) if (!best || e.n > best.n) best = e;
    if (!best || best.n < 12) return null;
    const hex = (v: number) => Math.round(v / best!.n).toString(16).padStart(2, "0");
    return `#${hex(best.r)}${hex(best.g)}${hex(best.b)}`.toUpperCase();
  } catch {
    return null;
  } finally {
    if (typeof src !== "string") URL.revokeObjectURL(url);
  }
}

import type { Direction } from './types';
export interface Sprite { image: HTMLCanvasElement; x: number; y: number; width: number; height: number }
const cache = new Map<string, Promise<Sprite>>();
export function loadSprite(url: string): Promise<Sprite> {
  if (!cache.has(url)) cache.set(url, (async () => {
    const image = new Image(); image.src = url; await image.decode();
    const canvas = document.createElement('canvas'); canvas.width = image.width; canvas.height = image.height;
    const ctx = canvas.getContext('2d')!; ctx.drawImage(image, 0, 0);
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height), pixels = data.data;
    // The exported silhouette has a one-source-pixel matte, including tinted edge pixels.
    // Trim only that outside contour, leaving all interior colors untouched.
    const original = new Uint8ClampedArray(pixels);
    const opaque = (x: number, y: number) => x >= 0 && y >= 0 && x < canvas.width && y < canvas.height && original[(y * canvas.width + x) * 4 + 3] > 16;
    for (let y = 0; y < canvas.height; y++) for (let x = 0; x < canvas.width; x++) {
      if (opaque(x,y) && [[x-1,y],[x+1,y],[x,y-1],[x,y+1]].some(([a,b]) => !opaque(a,b))) {
        pixels[(y*canvas.width+x)*4+3] = 0;
      }
    }
    // All exported actions may contain disconnected sheet borders, not just kiss frames.
    {
      const seen = new Uint8Array(canvas.width * canvas.height); let largest: number[] = [];
      for (let index = 0; index < seen.length; index++) {
        if (seen[index] || pixels[index * 4 + 3] <= 16) continue;
        const component = [index]; seen[index] = 1;
        for (let cursor = 0; cursor < component.length; cursor++) {
          const p = component[cursor], x = p % canvas.width, y = Math.floor(p / canvas.width);
          for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
            const nx = x + dx, ny = y + dy, n = ny * canvas.width + nx;
            if (nx >= 0 && nx < canvas.width && ny >= 0 && ny < canvas.height && !seen[n] && pixels[n * 4 + 3] > 16) { seen[n] = 1; component.push(n); }
          }
        }
        if (component.length > largest.length) largest = component;
      }
      const keep = new Set(largest);
      for (let p = 0; p < seen.length; p++) if (!keep.has(p)) pixels[p * 4 + 3] = 0;
      ctx.putImageData(data, 0, 0);
    }
    let x = canvas.width, y = canvas.height, right = 0, bottom = 0;
    for (let row = 0; row < canvas.height; row++) for (let col = 0; col < canvas.width; col++) {
      if (pixels[(row * canvas.width + col) * 4 + 3] > 16) { x = Math.min(x, col); y = Math.min(y, row); right = Math.max(right, col + 1); bottom = Math.max(bottom, row + 1); }
    }
    return { image: canvas, x, y, width: Math.max(1, right - x), height: Math.max(1, bottom - y) };
  })());
  return cache.get(url)!;
}
export function getStaticFrame(id: string, name: string) {
  if (id === 'pet-b' && name.startsWith('kiss-')) name = name === 'kiss-left' ? 'kiss-right' : 'kiss-left';
  return `/assets/${id}/${name}.png`;
}
export async function getWalkFrames(id: string, direction: Direction): Promise<string[]> {
  const frames = Array.from({ length: id === 'pet-a' ? 7 : 4 }, (_, i) => `/assets/${id}/walk-${direction}/${String(i + 1).padStart(2, '0')}.png`);
  await Promise.all(frames.map(loadSprite)); return frames;
}



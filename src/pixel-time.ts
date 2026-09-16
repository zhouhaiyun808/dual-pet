// Small, locally drawn glyphs keep the timer identical on Windows and macOS.
const glyphs: Record<string, string[]> = {
  '0': ['01110','11011','11011','11011','11011','11011','01110'],
  '1': ['00110','01110','00110','00110','00110','00110','01111'],
  '2': ['01110','11011','00011','00110','01100','11000','11111'],
  '3': ['11110','00011','00011','01110','00011','00011','11110'],
  '4': ['11011','11011','11011','11111','00011','00011','00011'],
  '5': ['11111','11000','11000','11110','00011','11011','01110'],
  '6': ['01110','11000','11000','11110','11011','11011','01110'],
  '7': ['11111','00011','00110','00110','01100','01100','01100'],
  '8': ['01110','11011','11011','01110','11011','11011','01110'],
  '9': ['01110','11011','11011','01111','00011','00011','01110'],
  ':': ['00','11','11','00','11','11','00'],
  '—': ['00000','00000','00000','11111','00000','00000','00000'],
};

export function renderPixelTime(element: HTMLElement, value: string): void {
  if (element.dataset.time === value) return;
  element.dataset.time = value;
  element.setAttribute('aria-label', value);
  let x = 0;
  let pixels = '';
  for (const char of value) {
    const glyph = glyphs[char] ?? glyphs['—'];
    glyph.forEach((row, y) => [...row].forEach((pixel, col) => {
      if (pixel === '1') pixels += `<rect x="${x + col}" y="${y}" width="1" height="1"/>`;
    }));
    x += glyph[0].length + 1;
  }
  element.innerHTML = `<svg aria-hidden="true" viewBox="0 0 ${x - 1} 7" xmlns="http://www.w3.org/2000/svg" fill="currentColor" shape-rendering="crispEdges">${pixels}</svg>`;
}

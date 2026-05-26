/**
 * Convert hex color to OKLCH format.
 * Accurate implementation: hex → linear sRGB → LMS → Oklab → OKLCH
 */
export function hexToOklch(hex: string): string {
  hex = hex.replace(/^#/, "");
  if (hex.length === 3) hex = hex[0]! + hex[0]! + hex[1]! + hex[1]! + hex[2]! + hex[2]!;

  const r = parseInt(hex.slice(0, 2), 16) / 255;
  const g = parseInt(hex.slice(2, 4), 16) / 255;
  const b = parseInt(hex.slice(4, 6), 16) / 255;

  // sRGB to linear
  const toLinear = (c: number) => c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  const rl = toLinear(r);
  const gl = toLinear(g);
  const bl = toLinear(b);

  // Linear sRGB to LMS (using Oklab matrix)
  const l = 0.4122214708 * rl + 0.5363325363 * gl + 0.0514459929 * bl;
  const m = 0.2119034982 * rl + 0.6806995451 * gl + 0.1073969566 * bl;
  const s = 0.0883024619 * rl + 0.2817188376 * gl + 0.6299787005 * bl;

  // LMS to Oklab
  const l_ = Math.cbrt(l);
  const m_ = Math.cbrt(m);
  const s_ = Math.cbrt(s);

  const L = 0.2104542553 * l_ + 0.7936177850 * m_ - 0.0040720468 * s_;
  const a = 1.9779984951 * l_ - 2.4285922050 * m_ + 0.4505937099 * s_;
  const bOk = 0.0259040371 * l_ + 0.7827717662 * m_ - 0.8086757660 * s_;

  // Oklab to OKLCH
  const C = Math.sqrt(a * a + bOk * bOk);
  let H = Math.atan2(bOk, a) * (180 / Math.PI);
  if (H < 0) H += 360;

  const Lpct = (L * 100).toFixed(2);
  const Cfmt = C.toFixed(4);
  const Hfmt = H.toFixed(2);

  return `oklch(${Lpct}% ${Cfmt} ${Hfmt})`;
}

/**
 * Batch convert multiple hex colors to OKLCH.
 */
export function hexBatchToOklch(colors: Record<string, string>): Record<string, { hex: string; oklch: string }> {
  const result: Record<string, { hex: string; oklch: string }> = {};
  for (const [name, hex] of Object.entries(colors)) {
    result[name] = { hex, oklch: hexToOklch(hex) };
  }
  return result;
}

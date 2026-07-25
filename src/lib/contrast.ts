/**
 * WCAG 2.1 relative luminance and contrast ratio.
 *
 * Used by a test to hold the palette to accessibility thresholds mechanically
 * rather than by eye. Reference: WCAG 2.1 SC 1.4.3 (contrast minimum) and
 * SC 1.4.11 (non-text contrast).
 */

/** AA minimum for body text. */
export const AA_TEXT = 4.5;
/** AA minimum for large text, icons, borders and other graphical objects. */
export const AA_LARGE = 3;

export function parseHex(hex: string): [number, number, number] {
  const clean = hex.replace('#', '').trim();
  const full =
    clean.length === 3
      ? clean
          .split('')
          .map((c) => c + c)
          .join('')
      : clean;
  if (!/^[0-9a-fA-F]{6}$/.test(full)) {
    throw new Error(`Invalid hex colour: ${hex}`);
  }
  return [
    parseInt(full.slice(0, 2), 16),
    parseInt(full.slice(2, 4), 16),
    parseInt(full.slice(4, 6), 16),
  ];
}

/** WCAG relative luminance of an sRGB colour. */
export function relativeLuminance(hex: string): number {
  const channels = parseHex(hex).map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

/** Contrast ratio between two colours, from 1 to 21. */
export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const lighter = Math.max(la, lb);
  const darker = Math.min(la, lb);
  return (lighter + 0.05) / (darker + 0.05);
}

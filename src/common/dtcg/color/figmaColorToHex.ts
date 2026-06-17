// Convert a Figma color object {r, g, b, a} to a Hex string.
export function figmaColorToHex(color: { r: number; g: number; b: number; a?: number }): string {
  const r = Math.round(color.r * 255);
  const g = Math.round(color.g * 255);
  const b = Math.round(color.b * 255);
  const a = color.a !== undefined ? Math.round(color.a * 255) : 255;

  const toHex = (val: number) => val.toString(16).padStart(2, "0");

  if (a === 255) {
    return `#${toHex(r)}${toHex(g)}${toHex(b)}`.toLowerCase();
  }
  return `#${toHex(r)}${toHex(g)}${toHex(b)}${toHex(a)}`.toLowerCase();
}

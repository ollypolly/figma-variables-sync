// Convert a Hex/RGB/RGBA string to a Figma color object {r, g, b, a}.
export function parseColor(colorStr: string): { r: number; g: number; b: number; a: number } {
  const clean = colorStr.trim().toLowerCase();

  // Hex format
  if (clean.startsWith("#")) {
    const hex = clean.substring(1);
    if (hex.length === 3 || hex.length === 4) {
      const r = parseInt(hex[0] + hex[0], 16) / 255;
      const g = parseInt(hex[1] + hex[1], 16) / 255;
      const b = parseInt(hex[2] + hex[2], 16) / 255;
      const a = hex.length === 4 ? parseInt(hex[3] + hex[3], 16) / 255 : 1;
      return { r, g, b, a };
    }
    if (hex.length === 6 || hex.length === 8) {
      const r = parseInt(hex.substring(0, 2), 16) / 255;
      const g = parseInt(hex.substring(2, 4), 16) / 255;
      const b = parseInt(hex.substring(4, 6), 16) / 255;
      const a = hex.length === 8 ? parseInt(hex.substring(6, 8), 16) / 255 : 1;
      return { r, g, b, a };
    }
  }

  // RGB / RGBA format
  if (clean.startsWith("rgb")) {
    const matches = clean.match(/rgba?\(?\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+)\s*)?\)?/);
    if (matches) {
      const r = parseInt(matches[1], 10) / 255;
      const g = parseInt(matches[2], 10) / 255;
      const b = parseInt(matches[3], 10) / 255;
      const a = matches[4] !== undefined ? parseFloat(matches[4]) : 1;
      return { r, g, b, a };
    }
  }

  // Fallback to black
  return { r: 0, g: 0, b: 0, a: 1 };
}

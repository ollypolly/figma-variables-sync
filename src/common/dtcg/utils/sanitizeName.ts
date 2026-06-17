// Helper to sanitize collection, variable, and mode names for DTCG compatibility.
export function sanitizeName(name: string): string {
  return name
    .trim()
    .replace(/[\/\.]/g, "-") // replace slashes and dots with hyphens
    .replace(/[{}]/g, "")    // remove curly braces
    .replace(/\s+/g, "-");   // replace spaces with hyphens
}

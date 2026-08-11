// Helper to read a value at a nested path in an object, mirroring setPath's traversal.
export function getPath(obj: any, path: string[]): any {
  let current = obj;
  for (const key of path) {
    if (current == null || typeof current !== "object" || !(key in current)) {
      return undefined;
    }
    current = current[key];
  }
  return current;
}

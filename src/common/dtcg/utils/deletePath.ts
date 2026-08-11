// Deletes the value at a nested path, then prunes any ancestor left empty — but never the root itself.
export function deletePath(obj: any, path: string[]): void {
  const ancestors: any[] = [obj];
  let current = obj;
  for (let i = 0; i < path.length - 1; i++) {
    const key = path[i];
    if (current == null || typeof current !== "object" || !(key in current)) {
      return;
    }
    current = current[key];
    ancestors.push(current);
  }

  const leafKey = path[path.length - 1];
  if (current == null || typeof current !== "object" || !(leafKey in current)) {
    return;
  }
  delete current[leafKey];

  for (let i = ancestors.length - 1; i > 0; i--) {
    const node = ancestors[i];
    if (Object.keys(node).length > 0) break;
    delete ancestors[i - 1][path[i - 1]];
  }
}

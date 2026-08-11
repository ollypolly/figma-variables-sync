// Shared DTCG leaf-token builders for tests — the surrounding tree structure
// (which paths, what's nested where) stays inline per test since that's what's
// actually under test; only the repeated { $type, $value } wrapper is factored out.
export function color(value: string, extra: Record<string, any> = {}) {
  return { $type: "color", $value: value, ...extra };
}

export function dimension(value: string, extra: Record<string, any> = {}) {
  return { $type: "dimension", $value: value, ...extra };
}

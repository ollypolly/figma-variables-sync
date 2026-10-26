import { describe, it, expect, beforeEach } from "vitest";

import { settingsKey } from "./storageKeys";

describe("file-scoped storage keys", () => {
  beforeEach(() => {
    delete (globalThis as any).figma;
  });

  it("scopes keys by figma.fileKey when it is available", () => {
    (globalThis as any).figma = { fileKey: "design-system" };
    const designSystemKey = settingsKey();

    (globalThis as any).figma = { fileKey: "goodform-test" };

    expect(settingsKey()).not.toBe(designSystemKey);
  });

  it("falls back to a generated id stored on the file and reuses it", () => {
    const pluginData: Record<string, string> = {};
    (globalThis as any).figma = {
      root: {
        getPluginData: (key: string) => pluginData[key] ?? "",
        setPluginData: (key: string, value: string) => {
          pluginData[key] = value;
        },
      },
    };

    const firstKey = settingsKey();

    expect(Object.values(pluginData)).toHaveLength(1);
    expect(settingsKey()).toBe(firstKey);
  });
});

import { describe, it, expect } from "vitest";
import { trimSettings, DEFAULT_SETTINGS, PluginSettings } from "./types";

describe("trimSettings", () => {
  it("should trim leading and trailing whitespace from string fields", () => {
    const dirtySettings: PluginSettings = {
      pat: "  my-secret-pat  ",
      owner: "\tmy-owner\n",
      repo: " my-repo ",
      filePath: "  tokens/design-tokens.json",
      branch: "main  ",
    };

    const trimmed = trimSettings(dirtySettings);

    expect(trimmed).toEqual({
      pat: "my-secret-pat",
      owner: "my-owner",
      repo: "my-repo",
      filePath: "tokens/design-tokens.json",
      branch: "main",
    });
  });

  it("should handle already clean settings without modifications", () => {
    const cleanSettings: PluginSettings = {
      pat: "pat",
      owner: "owner",
      repo: "repo",
      filePath: "tokens.json",
      branch: "main",
    };

    const trimmed = trimSettings(cleanSettings);
    expect(trimmed).toEqual(cleanSettings);
  });

  it("should handle DEFAULT_SETTINGS successfully", () => {
    const trimmed = trimSettings(DEFAULT_SETTINGS);
    expect(trimmed).toEqual(DEFAULT_SETTINGS);
  });

  it("should handle non-string fields if present in any extended input", () => {
    // Cast to test the fallback behavior on non-string values
    const settingsWithNonString = {
      pat: "  pat  ",
      owner: "owner",
      repo: "repo",
      filePath: "tokens.json",
      branch: "main",
      someNumber: 42,
      someBoolean: true,
    } as unknown as PluginSettings;

    const trimmed = trimSettings(settingsWithNonString);
    expect((trimmed as any).someNumber).toBe(42);
    expect((trimmed as any).someBoolean).toBe(true);
    expect(trimmed.pat).toBe("pat");
  });
});

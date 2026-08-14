import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@create-figma-plugin/utilities", () => ({ on: vi.fn(), emit: vi.fn() }));

import { emit, on, type EventHandler } from "@create-figma-plugin/utilities";
import { figmaPersistedAtom } from "./figmaPersistedAtom";

interface TestLoadHandler extends EventHandler {
  name: "TEST_LOAD";
  handler: () => void;
}

interface TestLoadedHandler extends EventHandler {
  name: "TEST_LOADED";
  handler: (value: string) => void;
}

interface TestSaveHandler extends EventHandler {
  name: "TEST_SAVE";
  handler: (value: string) => void;
}

function subscribeAndCaptureLoadedHandler() {
  const unsubscribeLoaded = vi.fn();
  vi.mocked(on).mockReturnValue(unsubscribeLoaded);

  const { store, loaded } = figmaPersistedAtom<
    string,
    TestLoadHandler,
    TestLoadedHandler,
    TestSaveHandler
  >("default", "TEST_LOAD", "TEST_LOADED", "TEST_SAVE");

  const unsubscribeStore = store.listen(() => {});
  const loadedHandler = vi.mocked(on).mock.calls[0][1] as (value: string) => void;

  return { store, loaded, loadedHandler, unsubscribeLoaded, unsubscribeStore };
}

describe("figmaPersistedAtom", () => {
  beforeEach(() => {
    vi.mocked(on).mockReset();
    vi.mocked(emit).mockReset();
  });

  it("requests the persisted value as soon as something subscribes", () => {
    const { unsubscribeStore } = subscribeAndCaptureLoadedHandler();

    expect(emit).toHaveBeenCalledWith("TEST_LOAD");
    expect(on).toHaveBeenCalledWith("TEST_LOADED", expect.any(Function));

    unsubscribeStore();
  });

  it("hydrates the store and flips loaded when the LOADED event fires, without re-saving that value", () => {
    const { store, loaded, loadedHandler, unsubscribeStore } = subscribeAndCaptureLoadedHandler();
    vi.mocked(emit).mockClear();

    loadedHandler("from figma");

    expect(store.get()).toBe("from figma");
    expect(loaded.get()).toBe(true);
    expect(emit).not.toHaveBeenCalledWith("TEST_SAVE", expect.anything());

    unsubscribeStore();
  });

  it("saves subsequent changes once hydrated", () => {
    const { store, loadedHandler, unsubscribeStore } = subscribeAndCaptureLoadedHandler();
    loadedHandler("from figma");
    vi.mocked(emit).mockClear();

    store.set("edited by user");

    expect(emit).toHaveBeenCalledWith("TEST_SAVE", "edited by user");

    unsubscribeStore();
  });

  it("never saves when no save event is configured", () => {
    const unsubscribeLoaded = vi.fn();
    vi.mocked(on).mockReturnValue(unsubscribeLoaded);

    const { store } = figmaPersistedAtom<string, TestLoadHandler, TestLoadedHandler, TestSaveHandler>(
      "default",
      "TEST_LOAD",
      "TEST_LOADED",
      null
    );
    const unsubscribeStore = store.listen(() => {});
    const loadedHandler = vi.mocked(on).mock.calls[0][1] as (value: string) => void;
    loadedHandler("from figma");
    vi.mocked(emit).mockClear();

    store.set("edited by user");

    expect(emit).not.toHaveBeenCalled();

    unsubscribeStore();
  });

  it("tears down its load listener once the store has no more subscribers", () => {
    vi.useFakeTimers();
    const { unsubscribeLoaded, unsubscribeStore } = subscribeAndCaptureLoadedHandler();

    unsubscribeStore();
    vi.advanceTimersByTime(1000);

    expect(unsubscribeLoaded).toHaveBeenCalled();
    vi.useRealTimers();
  });
});

import { emit, on, type EventHandler } from "@create-figma-plugin/utilities";
import { atom, onMount, onSet, type WritableAtom } from "nanostores";

export function figmaPersistedAtom<
  T,
  LoadH extends EventHandler,
  LoadedH extends EventHandler,
  SaveH extends EventHandler,
>(
  initial: T,
  loadEvent: LoadH["name"],
  loadedEvent: LoadedH["name"],
  saveEvent: SaveH["name"] | null
): { store: WritableAtom<T>; loaded: WritableAtom<boolean> } {
  const store = atom<T>(initial);
  const loaded = atom(false);
  let hydrating = false;

  // `onSet` patches `.set()` directly rather than subscribing as a listener, so registering
  // it here (outside onMount) doesn't hold the store permanently "mounted" the way
  // `store.listen()` would — that self-subscription would stop onMount's cleanup below from
  // ever running, since the store's listener count would never reach zero.
  if (saveEvent) {
    onSet(store, ({ newValue }) => {
      if (hydrating) return;
      (emit as (name: SaveH["name"], value: T) => void)(saveEvent, newValue);
    });
  }

  onMount(store, () => {
    const offLoaded = on<LoadedH>(loadedEvent, ((value: T) => {
      hydrating = true;
      store.set(value);
      hydrating = false;
      loaded.set(true);
    }) as LoadedH["handler"]);

    (emit as (name: LoadH["name"]) => void)(loadEvent);

    return offLoaded;
  });

  return { store, loaded };
}

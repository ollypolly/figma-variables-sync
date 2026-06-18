import { useCallback, useState } from "preact/hooks";

interface AsyncState<T> {
  loading: boolean;
  error: string | null;
  data: T | null;
}

export function useAsync<T, A extends unknown[] = []>(
  fn: (...args: A) => Promise<T>
) {
  const [state, setState] = useState<AsyncState<T>>({
    loading: false,
    error: null,
    data: null,
  });

  const execute = useCallback(
    async (...args: A): Promise<T | null> => {
      setState((prev) => ({ ...prev, loading: true, error: null }));
      try {
        const result = await fn(...args);
        setState({ loading: false, error: null, data: result });
        return result;
      } catch (e: unknown) {
        const message = e instanceof Error ? e.message : "An error occurred.";
        setState({ loading: false, error: message, data: null });
        return null;
      }
    },
    [fn]
  );

  return { ...state, execute };
}

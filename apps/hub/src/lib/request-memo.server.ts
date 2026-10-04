/**
 * Create inside one request. Sharing the returned function across requests
 * would also share results and errors across authorization boundaries.
 */
export function memoizeRequest<T>(loader: (key: string) => Promise<T>) {
  const pending = new Map<string, Promise<T>>();
  return (key: string): Promise<T> => {
    const existing = pending.get(key);
    if (existing) return existing;
    const request = Promise.resolve().then(() => loader(key));
    pending.set(key, request);
    return request;
  };
}

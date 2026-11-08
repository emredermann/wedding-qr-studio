/**
 * Runs `worker` over `items` with at most `limit` promises in flight and
 * returns one settled result per item, in input order. Used to fan out
 * Google Drive calls without tripping its per-user rate limits.
 */
export async function mapSettledLimit<T, R>(
  items: readonly T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<PromiseSettledResult<R>[]> {
  const results: PromiseSettledResult<R>[] = new Array(items.length);
  let next = 0;
  const lanes = Math.max(1, Math.min(limit, items.length));

  async function lane(): Promise<void> {
    while (next < items.length) {
      const index = next;
      next += 1;
      try {
        results[index] = { status: "fulfilled", value: await worker(items[index], index) };
      } catch (reason) {
        results[index] = { status: "rejected", reason };
      }
    }
  }

  await Promise.all(Array.from({ length: lanes }, lane));
  return results;
}

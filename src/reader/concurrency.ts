/**
 * Runs `fn` over `items`, at most `limit` at a time, results in input order. After the first throw
 * no new item starts, and the error is rethrown only once every started item has settled, so a
 * caller that stops on it (a spend ceiling) never races writes still in flight.
 */
export async function mapLimit<T, R>(items: readonly T[], limit: number, fn: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length)
  let next = 0
  let failure: { error: unknown } | null = null
  async function worker(): Promise<void> {
    while (!failure && next < items.length) {
      const index = next++
      try {
        results[index] = await fn(items[index], index)
      } catch (error) {
        failure ??= { error }
      }
    }
  }
  await Promise.all(Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, worker))
  if (failure) throw (failure as { error: unknown }).error
  return results
}

/** Returns a runner that starts each given function only after the previous one has settled. */
export function serial(): <R>(fn: () => Promise<R>) => Promise<R> {
  let tail: Promise<unknown> = Promise.resolve()
  return <R>(fn: () => Promise<R>) => {
    const run = tail.then(fn, fn)
    tail = run.catch(() => undefined)
    return run
  }
}

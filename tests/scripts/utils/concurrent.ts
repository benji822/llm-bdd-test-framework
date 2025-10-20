export async function runConcurrent<T>(
  tasks: Array<() => Promise<T>>,
  limit: number
): Promise<T[]> {
  const results: T[] = [];
  let nextIndex = 0;

  const worker = async (): Promise<void> => {
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const currentIndex = nextIndex;
      if (currentIndex >= tasks.length) {
        return;
      }
      nextIndex += 1;
      results[currentIndex] = await tasks[currentIndex]();
    }
  };

  const workers = Array.from({ length: Math.min(limit, tasks.length) }, () => worker());
  await Promise.all(workers);
  return results;
}

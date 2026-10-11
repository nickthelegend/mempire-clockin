/**
 * The fetch every Connection in the app uses.
 *
 * Public devnet RPC rate-limits hard. web3.js's own 429 retry logs a
 * console.error for every attempt ("Server responded with 429...") and keeps
 * going for a long time, so the Connections disable it and use this instead:
 * a few quiet retries with backoff (honouring Retry-After), then the 429
 * response goes back to web3.js, which throws and the caller shows a readable
 * message.
 */
const BACKOFF_MS = [500, 1000, 2000, 4000];

export type FetchLike = typeof fetch;

export function quietRateLimitFetch(base: (input: Parameters<typeof fetch>[0], init?: RequestInit) => Promise<Response> = (i, o) => fetch(i, o), sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))): FetchLike {
  return (async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
    for (let i = 0; ; i++) {
      const res = await base(input, init);
      if (res.status !== 429 || i >= BACKOFF_MS.length) return res;
      const after = Number(res.headers?.get?.('retry-after'));
      const wait = Number.isFinite(after) && after > 0 ? Math.min(after * 1000, 8000) : BACKOFF_MS[i];
      await sleep(wait + Math.floor(Math.random() * 150));
    }
  }) as FetchLike;
}

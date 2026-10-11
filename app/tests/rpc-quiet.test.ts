/**
 * Audit fix: public-RPC 429s are retried quietly (web3.js's own retry logs a
 * console.error per attempt), then surface as a normal error.
 *
 *   cd app && npx vitest run tests/rpc-quiet.test.ts
 */
import { describe, expect, it, vi } from 'vitest';
import { quietRateLimitFetch } from '../../mobile/src/chain/rpcFetch';

const res = (status: number, headers: Record<string, string> = {}) =>
  ({ status, headers: new Headers(headers) }) as unknown as Response;

describe('quietRateLimitFetch', () => {
  it('retries 429 quietly with backoff, then returns the success', async () => {
    const seq = [res(429), res(429), res(200)];
    const base = vi.fn(async () => seq.shift()!);
    const waits: number[] = [];
    const err = vi.spyOn(console, 'error');
    const f = quietRateLimitFetch(base, async (ms) => { waits.push(ms); });
    const r = await f('https://rpc', { method: 'POST' });
    expect(r.status).toBe(200);
    expect(base).toHaveBeenCalledTimes(3);
    expect(waits[0]).toBeGreaterThanOrEqual(500);
    expect(waits[1]).toBeGreaterThanOrEqual(1000);
    expect(err).not.toHaveBeenCalled();
    err.mockRestore();
  });

  it('honours Retry-After (capped) and gives the 429 back after 4 retries', async () => {
    const base = vi.fn(async () => res(429, { 'retry-after': '30' }));
    const waits: number[] = [];
    const r = await quietRateLimitFetch(base, async (ms) => { waits.push(ms); })('https://rpc');
    expect(r.status).toBe(429);
    expect(base).toHaveBeenCalledTimes(5);
    expect(waits.every((w) => w >= 8000 && w < 8200)).toBe(true);
  });

  it('passes other statuses straight through', async () => {
    const base = vi.fn(async () => res(500));
    const r = await quietRateLimitFetch(base, async () => {})('https://rpc');
    expect(r.status).toBe(500);
    expect(base).toHaveBeenCalledTimes(1);
  });
});

describe('readableError', () => {
  it('never shows raw JSON-RPC bodies to the player', async () => {
    const { readableError } = await import('../../mobile/src/chain/send');
    const raw = '429 client error: {"jsonrpc":"2.0","error":{"code": 429, "message":"Too many requests from your IP"}, "id": "x" }';
    expect(readableError(new Error(raw))).toBe('The devnet RPC is rate-limiting right now. Try again in a moment.');
    expect(readableError(new Error('503 : {"jsonrpc":"2.0","error":{"code":-32000}}'))).toBe('The Solana network returned an error. Try again in a moment.');
    expect(readableError(new Error('Not enough SKR'))).toBe('Not enough SKR');
  });
});

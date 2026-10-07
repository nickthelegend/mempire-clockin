import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect } from 'react';
import { PublicKey } from '@solana/web3.js';
import { create } from 'zustand';
import { MAINNET } from '../chain/seeker';
import {
  SKR_PARENT, displayName, hashedName, nameAccountKey, parseNameRecord, resolveSkr,
} from '../chain/skrName';

/**
 * `.skr` names for any address the app shows, resolved from mainnet
 * (read-only), cached, and never in the way:
 *  - the short address renders immediately; the name replaces it when it lands;
 *  - each lookup is capped at 6 s and runs once per address per session;
 *  - hits are cached on the device for 24 h; misses only for the session (a
 *    public RPC can answer an overloaded getProgramAccounts with nothing, and
 *    that must not hide a real name for hours).
 */
const TIMEOUT_MS = 6000;
const HIT_TTL = 24 * 3600_000;
const key = (a: string) => `mempire.skr.v2.${a}`;

type Entry = { name: string | null; at: number };
interface IdentityState {
  names: Record<string, string | null | undefined>;
  /** Why the last lookup failed (timeout, rate limit), for the UI. */
  lastError: string | null;
  resolve: (address: string) => Promise<string | null>;
}

const inflight = new Map<string, Promise<string | null>>();

const withTimeout = <T,>(p: Promise<T>) => Promise.race([
  p, new Promise<never>((_, rej) => setTimeout(() => rej(new Error('timeout')), TIMEOUT_MS)),
]);

export const useIdentity = create<IdentityState>((set, get) => ({
  names: {},
  lastError: null,
  resolve: (address) => {
    if (get().names[address] !== undefined) return Promise.resolve(get().names[address] ?? null);
    const running = inflight.get(address);
    if (running) return running;
    const job = (async () => {
      try {
        const raw = await AsyncStorage.getItem(key(address)).catch(() => null);
        if (raw) {
          const e = JSON.parse(raw) as Entry;
          if (e.name && Date.now() - e.at < HIT_TTL) {
            set({ names: { ...get().names, [address]: e.name } });
            return e.name;
          }
        }
        const name = await withTimeout(resolveSkr(MAINNET, address));
        set({ names: { ...get().names, [address]: name } });
        if (name) void AsyncStorage.setItem(key(address), JSON.stringify({ name, at: Date.now() } satisfies Entry)).catch(() => {});
        return name;
      } catch (e) {
        // Timeout or rate limit: show the address this session, retry next launch.
        set({ names: { ...get().names, [address]: null }, lastError: e instanceof Error ? e.message.slice(0, 120) : String(e) });
        return null;
      } finally {
        inflight.delete(address);
      }
    })();
    inflight.set(address, job);
    return job;
  },
}));

/** "alice.skr" once resolved, the short address until then (and forever if none). */
export function useDisplayName(address: string | null | undefined, n = 4): { label: string; skr: string | null } {
  const skr = useIdentity((s) => (address ? s.names[address] : undefined));
  useEffect(() => {
    if (!address) return;
    try { new PublicKey(address); } catch { return; }
    void useIdentity.getState().resolve(address);
  }, [address]);
  return { label: displayName(address, skr, n), skr: skr ?? null };
}

/** Forward lookup for the "find a Seeker" field: alice.skr → owner address. */
export async function lookupSkrOwner(name: string): Promise<string | null> {
  const label = name.trim().toLowerCase().replace(/\.skr$/, '');
  if (!/^[a-z0-9_-]{1,64}$/.test(label)) return null;
  const k = nameAccountKey(hashedName(label), undefined, SKR_PARENT);
  const info = await withTimeout(MAINNET.getAccountInfo(k));
  const rec = info ? parseNameRecord(info.data) : null;
  if (!rec || (rec.expiresAt !== 0 && rec.expiresAt < Date.now() / 1000)) return null;
  return rec.owner;
}

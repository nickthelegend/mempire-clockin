import { Buffer } from 'buffer';
import {
  Keypair, PublicKey, TransactionInstruction, TransactionMessage, VersionedTransaction,
} from '@solana/web3.js';
import type { Web3MobileWallet } from '@solana-mobile/mobile-wallet-adapter-protocol-web3js';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import { create } from 'zustand';
import { connection, getSol } from '../chain/solana';
import { skrBalance } from '../chain/skr';

/**
 * Two ways to hold a key, one interface for everything that signs.
 *
 *  - **Mobile Wallet Adapter** (Android): the primary path. Seed Vault on a
 *    Seeker, or Phantom / Solflare anywhere else. The app never sees a key;
 *    every transaction goes to the wallet for approval. The `auth_token` is
 *    kept in the OS keystore so a daily open reconnects without a prompt —
 *    the wallet still approves every signature.
 *  - **Dev wallet (devnet only)**: a keypair generated on the device and kept
 *    in the keystore. It exists because iOS has no MWA and an emulator usually
 *    has no wallet app; it is labelled as what it is everywhere it appears.
 */
export const APP_IDENTITY = {
  name: 'Mempire',
  uri: 'https://mempire.fun',
  icon: 'favicon.ico', // relative to uri, as MWA expects
};
const CHAIN = 'solana:devnet';
const DEV_KEY = 'mempire.devwallet.v1';
const MWA_TOKEN = 'mempire.mwa.auth.v1';
const MWA_ADDR = 'mempire.mwa.addr.v1';
const LAST_KIND = 'mempire.wallet.kind.v1';

export const MWA_AVAILABLE = Platform.OS === 'android';

type Transact = typeof import('@solana-mobile/mobile-wallet-adapter-protocol-web3js').transact;
/** MWA's native module only exists on Android; a static import crashes iOS. */
function mwaTransact<T>(cb: (w: Web3MobileWallet) => Promise<T>): Promise<T> {
  if (!MWA_AVAILABLE) return Promise.reject(new Error('Mobile Wallet Adapter is Android-only'));
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const mod = require('@solana-mobile/mobile-wallet-adapter-protocol-web3js') as { transact: Transact };
  return mod.transact(cb) as Promise<T>;
}

function friendly(e: unknown): Error {
  const msg = e instanceof Error ? e.message : String(e);
  if (/no installed wallet|ERROR_WALLET_NOT_FOUND|not found/i.test(msg)) {
    return new Error('No Mobile Wallet Adapter wallet found on this device. Install Phantom or Solflare (or use Seed Vault on a Seeker), or continue with the dev wallet.');
  }
  if (/declin|reject|cancel/i.test(msg)) return new Error('You declined the request in your wallet.');
  return e instanceof Error ? e : new Error(msg);
}

/**
 * Authorize, reusing the cached token (a silent reauthorize in the wallet).
 * A wallet that no longer honours the token — revoked, reinstalled, expired —
 * rejects it; the token is then dropped and a fresh authorize is asked for,
 * once, instead of failing every future sign-in.
 */
async function authorize(wallet: Web3MobileWallet) {
  const cached = await SecureStore.getItemAsync(MWA_TOKEN);
  try {
    const auth = await wallet.authorize({ chain: CHAIN, identity: APP_IDENTITY, auth_token: cached ?? undefined });
    await SecureStore.setItemAsync(MWA_TOKEN, auth.auth_token);
    return auth;
  } catch (e) {
    if (!cached || /declin|reject|cancel/i.test(e instanceof Error ? e.message : String(e))) throw e;
    await SecureStore.deleteItemAsync(MWA_TOKEN);
    const auth = await wallet.authorize({ chain: CHAIN, identity: APP_IDENTITY });
    await SecureStore.setItemAsync(MWA_TOKEN, auth.auth_token);
    return auth;
  }
}

let devKeypair: Keypair | null = null;

async function loadDevKeypair(create: boolean): Promise<Keypair | null> {
  if (devKeypair) return devKeypair;
  const stored = await SecureStore.getItemAsync(DEV_KEY);
  if (stored) {
    devKeypair = Keypair.fromSecretKey(Uint8Array.from(Buffer.from(stored, 'base64')));
    return devKeypair;
  }
  if (!create) return null;
  devKeypair = Keypair.generate();
  await SecureStore.setItemAsync(DEV_KEY, Buffer.from(devKeypair.secretKey).toString('base64'));
  return devKeypair;
}

export type WalletKind = 'mwa' | 'dev';

interface WalletState {
  kind: WalletKind | null;
  address: string | null;
  sol: number | null;
  skr: number | null;
  restoring: boolean;
  /** Reconnect silently to whatever this device used last. */
  restore: () => Promise<void>;
  connectMwa: () => Promise<void>;
  connectDev: () => Promise<void>;
  disconnect: () => Promise<void>;
  refresh: () => Promise<void>;
  /**
   * Sign and send one transaction made of `ixs`, paid by the connected wallet,
   * and wait for confirmation. Returns the signature.
   */
  send: (ixs: TransactionInstruction[]) => Promise<string>;
}

export const useWallet = create<WalletState>((set, get) => ({
  kind: null,
  address: null,
  sol: null,
  skr: null,
  restoring: true,

  restore: async () => {
    try {
      const kind = (await SecureStore.getItemAsync(LAST_KIND)) as WalletKind | null;
      if (kind === 'dev') {
        const kp = await loadDevKeypair(false);
        if (kp) set({ kind: 'dev', address: kp.publicKey.toBase58() });
      } else if (kind === 'mwa' && MWA_AVAILABLE) {
        const addr = await SecureStore.getItemAsync(MWA_ADDR);
        if (addr) set({ kind: 'mwa', address: addr });
      }
    } finally {
      set({ restoring: false });
    }
    if (get().address) void get().refresh();
  },

  connectMwa: async () => {
    try {
      const address = await mwaTransact(async (wallet) => {
        const auth = await authorize(wallet);
        // MWA returns the address base64-encoded, not base58.
        return new PublicKey(Buffer.from(auth.accounts[0].address, 'base64')).toBase58();
      });
      await SecureStore.setItemAsync(MWA_ADDR, address);
      await SecureStore.setItemAsync(LAST_KIND, 'mwa');
      set({ kind: 'mwa', address, sol: null, skr: null });
      void get().refresh();
    } catch (e) {
      throw friendly(e);
    }
  },

  connectDev: async () => {
    const kp = await loadDevKeypair(true);
    await SecureStore.setItemAsync(LAST_KIND, 'dev');
    set({ kind: 'dev', address: kp!.publicKey.toBase58(), sol: null, skr: null });
    void get().refresh();
  },

  disconnect: async () => {
    // The dev key and the MWA token are kept: disconnecting is "sign out of
    // the game", not "destroy the wallet". The wallet app owns revocation.
    await SecureStore.deleteItemAsync(LAST_KIND);
    set({ kind: null, address: null, sol: null, skr: null });
  },

  refresh: async () => {
    const a = get().address;
    if (!a) return;
    const [sol, skr] = await Promise.all([
      getSol(a).catch(() => get().sol),
      skrBalance(a).catch(() => get().skr),
    ]);
    if (get().address === a) set({ sol, skr });
  },

  send: async (ixs) => {
    const { kind, address } = get();
    if (!kind || !address) throw new Error('Connect a wallet first');
    const payer = new PublicKey(address);
    const { context: { slot: minContextSlot }, value: bh } = await connection.getLatestBlockhashAndContext();
    const message = new TransactionMessage({
      payerKey: payer, recentBlockhash: bh.blockhash, instructions: ixs,
    }).compileToV0Message();
    const tx = new VersionedTransaction(message);

    let sig: string;
    if (kind === 'dev') {
      const kp = await loadDevKeypair(false);
      if (!kp) throw new Error('Dev wallet key missing');
      tx.sign([kp]);
      sig = await connection.sendRawTransaction(tx.serialize(), { minContextSlot });
    } else {
      try {
        sig = await mwaTransact(async (wallet) => {
          await authorize(wallet);
          const [s] = await wallet.signAndSendTransactions({ transactions: [tx], minContextSlot });
          return s;
        });
      } catch (e) {
        throw friendly(e);
      }
    }
    const res = await connection.confirmTransaction({ signature: sig, ...bh }, 'confirmed');
    if (res.value.err) throw new Error(`Transaction failed: ${JSON.stringify(res.value.err)}`);
    void get().refresh();
    return sig;
  },
}));

export const walletLabel = (k: WalletKind | null) =>
  k === 'mwa' ? 'Mobile Wallet Adapter' : k === 'dev' ? 'Dev wallet (devnet only)' : 'Not connected';

import { Buffer } from 'buffer';
import { createReceiptJournal } from './pendingReceipt';
import bs58 from 'bs58';
import {
  Keypair, PublicKey, TransactionInstruction, TransactionMessage, VersionedTransaction,
} from '@solana/web3.js';
import type { Web3MobileWallet } from '@solana-mobile/mobile-wallet-adapter-protocol-web3js';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import { create } from 'zustand';
import { connection, getSol } from '../chain/solana';
import { skrBalance } from '../chain/skr';
import { looksLikeSeeker } from '../chain/seeker';
import {
  buildSignInInput, createSignInMessageText, signInLocally, verifySignIn,
  utf8, type SignInInput, type SiwsProof,
} from '../chain/siws';

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
const SIWS_KEY = 'mempire.siws.v1';
const PENDING_TX = 'mempire.pending.devnet.v1';
const receiptJournal = createReceiptJournal({
  get: () => SecureStore.getItemAsync(PENDING_TX),
  set: (value) => SecureStore.setItemAsync(PENDING_TX, value),
  clear: () => SecureStore.deleteItemAsync(PENDING_TX),
});

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
  // Only the MWA error itself — not any message containing "not found" (e.g. a
  // wallet's "Blockhash not found" after a slow approval).
  if (/no installed wallet|ERROR_WALLET_NOT_FOUND|Found no installed wallet/i.test(msg)) {
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
async function authorize(wallet: Web3MobileWallet, signIn?: SignInInput) {
  // A sign-in is a fresh authorization: the wallet shows its sheet and signs
  // the SIWS message in the same step, so no cached token is offered.
  const cached = signIn ? null : await SecureStore.getItemAsync(MWA_TOKEN);
  try {
    const auth = await wallet.authorize({
      chain: CHAIN, identity: APP_IDENTITY, auth_token: cached ?? undefined,
      ...(signIn ? { sign_in_payload: signIn } : {}),
    });
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

/** Did this signature land without error? One status read after a short wait. */
async function landed(sig: string): Promise<boolean> {
  try {
    await new Promise((r) => setTimeout(r, 1500));
    const { value } = await connection.getSignatureStatuses([sig], { searchTransactionHistory: true });
    const st = value[0];
    return !!st && !st.err && (st.confirmationStatus === 'confirmed' || st.confirmationStatus === 'finalized');
  } catch {
    return false;
  }
}

const b64 = (u: Uint8Array) => Buffer.from(u).toString('base64');
const fromB64 = (s: string) => Uint8Array.from(Buffer.from(s, 'base64'));

function proofOf(method: SiwsProof['method'], signer: string, input: SignInInput, v: Extract<ReturnType<typeof verifySignIn>, { ok: true }>, signature: Uint8Array): SiwsProof {
  return {
    method, signer, address: v.fields.address, domain: v.fields.domain, chainId: v.fields.chainId,
    nonce: input.nonce!, issuedAt: v.fields.issuedAt!, signature: b64(signature), message: v.message,
  };
}

/**
 * One tap: authorize + Sign In With Solana in the same wallet sheet.
 *
 *  1. `authorize({ sign_in_payload })`: a wallet that supports SIWS (Seed
 *     Vault, Phantom, Solflare) returns `sign_in_result`, verified here.
 *  2. A wallet that ignores the payload still authorizes; we then ask it to
 *     sign the same SIWS text with `signMessages` (one more approval).
 *  3. If that is declined too, the player is connected without a sign-in
 *     proof; the UI says so. Nothing on-chain depends on the proof.
 * A proof that is present but does not verify is refused outright.
 */
async function connectWithSignIn(wallet: Web3MobileWallet): Promise<{ address: string; proof: SiwsProof | null }> {
  const input = buildSignInInput();
  const auth = await authorize(wallet, input);
  const first = auth.accounts[0] as { address: string; label?: string };
  const signer = looksLikeSeeker() ? 'Seed Vault' : first.label?.trim() || 'your wallet';
  const sir = auth.sign_in_result;
  if (sir) {
    const address = new PublicKey(fromB64(sir.address)).toBase58();
    const signature = fromB64(sir.signature);
    const v = verifySignIn(input, { address, signedMessage: fromB64(sir.signed_message), signature });
    if (!v.ok) throw new Error(`The wallet's sign-in did not verify (${v.reason}). Not signed in.`);
    return { address, proof: proofOf('siws', signer, input, v, signature) };
  }
  // MWA returns the address base64-encoded, not base58.
  const address = new PublicKey(fromB64(first.address)).toBase58();
  try {
    const msg = utf8(createSignInMessageText({ ...input, address }));
    const [signed] = await wallet.signMessages({ addresses: [first.address], payloads: [msg] });
    // A signed payload is the message with the signature appended; accept
    // the other order too, the verifier decides.
    for (const signature of [signed.slice(-64), signed.slice(0, 64)]) {
      const v = verifySignIn(input, { address, signedMessage: msg, signature });
      if (v.ok) return { address, proof: proofOf('signMessage', signer, input, v, signature) };
    }
  } catch { /* declined or unsupported: connected, without a sign-in proof */ }
  return { address, proof: null };
}

/** Re-check a stored proof's signature and fields (the "verify" button). */
export function recheckProof(p: SiwsProof): boolean {
  const input: SignInInput = {
    domain: p.domain, nonce: p.nonce, chainId: p.chainId,
  };
  const v = verifySignIn(input, {
    address: p.address, signedMessage: utf8(p.message), signature: fromB64(p.signature),
  }, Date.parse(p.issuedAt));
  return v.ok;
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
  /** The verified Sign In With Solana proof for this session, if any. */
  signIn: SiwsProof | null;
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
  signIn: null,

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
      const addr = get().address;
      const raw = addr ? await SecureStore.getItemAsync(SIWS_KEY) : null;
      const proof = raw ? (JSON.parse(raw) as SiwsProof) : null;
      if (proof && proof.address === addr) set({ signIn: proof });
    } catch { /* keystore unreadable: start signed out rather than crash */
    } finally {
      set({ restoring: false });
    }
    if (get().address) void get().refresh();
  },

  connectMwa: async () => {
    try {
      const { address, proof } = await mwaTransact(connectWithSignIn);
      await SecureStore.setItemAsync(MWA_ADDR, address);
      await SecureStore.setItemAsync(LAST_KIND, 'mwa');
      if (proof) await SecureStore.setItemAsync(SIWS_KEY, JSON.stringify(proof));
      else await SecureStore.deleteItemAsync(SIWS_KEY);
      set({ kind: 'mwa', address, sol: null, skr: null, signIn: proof });
      void get().refresh();
    } catch (e) {
      throw friendly(e);
    }
  },

  connectDev: async () => {
    const kp = await loadDevKeypair(true);
    await SecureStore.setItemAsync(LAST_KIND, 'dev');
    // iOS parity with the Seed Vault sign-in: the same SIWS message, signed
    // by the on-device dev key and put through the same verifier.
    const input = buildSignInInput();
    const out = signInLocally(input, kp!.secretKey);
    const v = verifySignIn(input, out);
    const proof = v.ok ? proofOf('dev-local', 'Dev wallet', input, v, out.signature) : null;
    if (proof) await SecureStore.setItemAsync(SIWS_KEY, JSON.stringify(proof));
    set({ kind: 'dev', address: kp!.publicKey.toBase58(), sol: null, skr: null, signIn: proof });
    void get().refresh();
  },

  disconnect: async () => {
    // The dev key and the MWA token are kept: disconnecting is "sign out of
    // the game", not "destroy the wallet". The wallet app owns revocation.
    await SecureStore.deleteItemAsync(LAST_KIND);
    await SecureStore.deleteItemAsync(SIWS_KEY);
    set({ kind: null, address: null, sol: null, skr: null, signIn: null });
  },

  refresh: async () => {
    const a = get().address;
    if (!a) return;
    const [sol, skr] = await Promise.all([
      getSol(a).catch(() => null),
      skrBalance(a).catch(() => null),
    ]);
    if (get().address === a) set({ sol, skr });
  },

  send: async (ixs) => {
    const { kind, address } = get();
    if (!kind || !address) throw new Error('Connect a wallet first');
    return receiptJournal.run(connection.rpcEndpoint, address, async (signature) => {
      const { value } = await connection.getSignatureStatuses([signature], { searchTransactionHistory: true });
      return value[0] ?? null;
    }, async (saveReceipt, submission) => {
      try {
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
      await saveReceipt(bs58.encode(tx.signatures[0]));
      submission.beginBroadcast();
      sig = await connection.sendRawTransaction(tx.serialize(), { minContextSlot });
    } else {
      try {
        sig = await mwaTransact(async (wallet) => {
          const auth = await authorize(wallet);
          const actualAddress = new PublicKey(Buffer.from(auth.accounts[0].address, 'base64')).toBase58();
          if (actualAddress !== address) throw new Error('The wallet switched accounts. Reconnect before signing.');
          submission.beginBroadcast();
          const [s] = await wallet.signAndSendTransactions({ transactions: [tx], minContextSlot });
          return s;
        });
      } catch (e) {
        throw friendly(e);
      }
    }
    // Persist before waiting: a timeout or app restart must not silently permit a duplicate retry.
    if (!/^[1-9A-HJ-NP-Za-km-z]{64,90}$/.test(sig)) sig = bs58.encode(Buffer.from(sig, 'base64'));
    await saveReceipt(sig);
    try {
      const res = await connection.confirmTransaction({ signature: sig, ...bh }, 'confirmed');
      if (res.value.err) throw new Error(`Transaction failed: ${JSON.stringify(res.value.err)}`);
    } catch (e) {
      // Confirmation can fail (429, timeout, block height) for a transaction
      // that landed. Ask the chain once before calling it a failure.
      if (!(await landed(sig))) throw e;
    }
    void get().refresh();
    return sig;
    } catch (error) { await submission.abortBeforeBroadcast(); throw error; }
    });
  },
}));

/** "Signed in with Seed Vault" and friends; null when there is no proof. */
export function signInLabel(p: SiwsProof | null): string | null {
  if (!p) return null;
  return p.method === 'dev-local' ? 'Signed in with Solana (dev wallet)' : `Signed in with ${p.signer}`;
}

export const walletLabel = (k: WalletKind | null) =>
  k === 'mwa' ? 'Mobile Wallet Adapter' : k === 'dev' ? 'Dev wallet (devnet only)' : 'Not connected';

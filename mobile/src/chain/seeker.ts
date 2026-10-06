import { Connection, PublicKey } from '@solana/web3.js';
import { Platform } from 'react-native';
import { SKR_MAINNET_MINT } from './skr';

/**
 * Seeker perks, read from mainnet. Read-only: nothing here signs or sends.
 *
 * The Seeker Genesis Token is minted once per Seeker into its Seed Vault
 * wallet, and exists only on mainnet. Holding one doubles the SKR a Clock-In
 * pays — a perk no other phone can have, keyed to the wallet the player
 * connected through Mobile Wallet Adapter.
 *
 * Check per docs.solanamobile.com: a Token-2022 account with a non-zero
 * balance whose mint's metadata pointer and token-group membership both name
 * the SGT group. Client-side is fine for a cosmetic-scale perk; anything of
 * real value would need a signed-in, server-side check.
 */
const MAINNET = new Connection(process.env.EXPO_PUBLIC_MAINNET_READ_RPC || 'https://api.mainnet-beta.solana.com', 'confirmed');
const TOKEN_2022 = new PublicKey('TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb');
const SGT_GROUP = 'GT22s89nU4iWFkNXj1Bw6uYhJJWDRPpShHt4Bk8f99Te';

/** Spoofable UI hint only; the token check below is the real one. */
export const looksLikeSeeker = (): boolean => {
  const c = Platform.constants as unknown as { Model?: string; Brand?: string };
  return Platform.OS === 'android' && (c.Model === 'Seeker' || /solanamobile/i.test(c.Brand ?? ''));
};

type Ext = { extension: string; state?: { metadataAddress?: string; group?: string } };

/** The owner's Seeker Genesis Token mint, or null. */
export async function findSgtMint(owner: string): Promise<string | null> {
  const { value } = await MAINNET.getParsedTokenAccountsByOwner(new PublicKey(owner), { programId: TOKEN_2022 });
  const mints = value
    .map((a) => a.account.data.parsed.info as { mint: string; tokenAmount: { amount: string; decimals: number } })
    .filter((i) => i.tokenAmount.amount !== '0' && i.tokenAmount.decimals === 0)
    .map((i) => new PublicKey(i.mint));
  for (let k = 0; k < mints.length; k += 100) {
    const infos = await MAINNET.getMultipleParsedAccounts(mints.slice(k, k + 100));
    for (let j = 0; j < infos.value.length; j++) {
      const data = infos.value[j]?.data as { parsed?: { info?: { extensions?: Ext[] } } } | undefined;
      const ext = data?.parsed?.info?.extensions ?? [];
      const mp = ext.find((e) => e.extension === 'metadataPointer')?.state?.metadataAddress;
      const gm = ext.find((e) => e.extension === 'tokenGroupMember')?.state?.group;
      if (mp === SGT_GROUP && gm === SGT_GROUP) return mints[k + j].toBase58();
    }
  }
  return null;
}

/** Real mainnet SKR held by this wallet — shown, never spent. */
export async function mainnetSkr(owner: string): Promise<number> {
  const { value } = await MAINNET.getParsedTokenAccountsByOwner(new PublicKey(owner), {
    mint: new PublicKey(SKR_MAINNET_MINT),
  });
  return value.reduce((s, a) => s + Number(a.account.data.parsed.info.tokenAmount.uiAmount ?? 0), 0);
}

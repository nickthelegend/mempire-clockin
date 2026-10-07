/**
 * Solana Actions (Blinks) in actions/: the challenge memo transaction, the
 * GET metadata + CORS headers, and that the Season Pass builder there is the
 * same instruction the app builds (mobile/src/chain/pass.ts).
 *
 *   cd app && npx vitest run tests/blink-actions.test.ts
 */
import { describe, expect, it } from 'vitest';
import { Keypair, PublicKey, VersionedTransaction } from '@solana/web3.js';
import challenge from '../../actions/api/actions/challenge';
import { ACTION_HEADERS } from '../../actions/lib/http';
import {
  BLOCKCHAIN_ID, MEMO_PROGRAM, RIVALS, buyPassIx, challengeMemoText, challengeTx, deepLink, parseAccount, rivalIndex,
} from '../../actions/lib/tx';
import { buyPassIx as appBuyPassIx } from '../../mobile/src/chain/pass';
import { RIVALS as APP_RIVALS } from '../../mobile/src/game/rules';
import { actionUrl, blinkUrl } from '../../mobile/src/game/blink';

const player = Keypair.fromSeed(new Uint8Array(32).fill(8)).publicKey;
const BH = '8TMRQiLZ2Cxc4rTYc5VdSTBv8KYSVeSfFWk7SbZUw6Ae';

function fakeRes() {
  const out: { code?: number; body?: unknown; headers: Record<string, string> } = { headers: {} };
  const res = {
    setHeader: (k: string, v: string) => { out.headers[k] = v; },
    status: (c: number) => { out.code = c; return res; },
    json: (b: unknown) => { out.body = b; },
    end: () => {},
  };
  return { res, out };
}

describe('challenge Action', () => {
  it('builds ONE memo `mempire:challenge:v1:<rival>` signed and paid by the challenger', () => {
    const tx = VersionedTransaction.deserialize(Buffer.from(challengeTx(player, 2, BH), 'base64'));
    const m = tx.message;
    expect(m.header.numRequiredSignatures).toBe(1);
    expect(m.staticAccountKeys[0].toBase58()).toBe(player.toBase58());
    expect(m.recentBlockhash).toBe(BH);
    expect(m.compiledInstructions).toHaveLength(1);
    expect(m.staticAccountKeys[m.compiledInstructions[0].programIdIndex].toBase58()).toBe(MEMO_PROGRAM.toBase58());
    expect(Buffer.from(m.compiledInstructions[0].data).toString()).toBe('mempire:challenge:v1:degen-swarm');
    expect(challengeMemoText(0)).toBe('mempire:challenge:v1:doggo-pack');
  });

  it('maps rivals by index or slug, and links into the app', () => {
    expect(rivalIndex('3')).toBe(3);
    expect(rivalIndex('blue-chips')).toBe(1);
    expect(rivalIndex(undefined)).toBe(1);
    expect(() => rivalIndex('nope')).toThrow(/unknown rival/);
    expect(deepLink(0, true)).toBe('mempire://battle?rival=0&rush=1');
    expect(() => parseAccount({})).toThrow(/required/);
    expect(() => parseAccount({ account: 'xyz' })).toThrow(/valid/);
  });

  it('GET returns spec metadata with CORS + action headers (devnet chain id)', async () => {
    const { res, out } = fakeRes();
    await challenge({ method: 'GET', query: { rival: 'whale-court' }, headers: { host: 'mempire-actions.vercel.app' } }, res);
    expect(out.code).toBe(200);
    const b = out.body as { type: string; icon: string; title: string; links: { actions: { href: string }[] } };
    expect(b.type).toBe('action');
    expect(b.icon).toBe('https://mempire-actions.vercel.app/icon.png');
    expect(b.title).toContain('Whale Court');
    expect(b.links.actions[0].href).toBe('https://mempire-actions.vercel.app/api/actions/challenge?rival=whale-court');
    expect(b.links.actions).toHaveLength(RIVALS.length);
    expect(out.headers['Access-Control-Allow-Origin']).toBe('*');
    expect(out.headers['X-Blockchain-Ids']).toBe(BLOCKCHAIN_ID);
    expect(BLOCKCHAIN_ID).toBe('solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1');
    expect(ACTION_HEADERS['Access-Control-Allow-Methods']).toContain('OPTIONS');
  });

  it('OPTIONS preflight and bad input answer with the CORS headers too', async () => {
    const a = fakeRes();
    await challenge({ method: 'OPTIONS', query: {}, headers: { host: 'x' } }, a.res);
    expect(a.out.code).toBe(200);
    expect(a.out.headers['Access-Control-Allow-Headers']).toContain('X-Accept-Action-Version');
    const b = fakeRes();
    await challenge({ method: 'POST', query: {}, body: { account: 'nope' }, headers: { host: 'x' } }, b.res);
    expect(b.out.code).toBe(400);
    expect(b.out.headers['X-Action-Version']).toBe('2.4');
  });
});

describe('app "Share as Blink"', () => {
  it('points at the deployed challenge Action with the same rival slugs, via dial.to on devnet', () => {
    expect(APP_RIVALS.map((r) => r.name.replace(' (AI)', ''))).toEqual(RIVALS.map((r) => r.name));
    RIVALS.forEach((r, i) => expect(actionUrl(i)).toBe(`https://mempire-actions.vercel.app/api/actions/challenge?rival=${r.slug}`));
    expect(blinkUrl(1)).toBe('https://dial.to/?action=solana-action%3Ahttps%3A%2F%2Fmempire-actions.vercel.app%2Fapi%2Factions%2Fchallenge%3Frival%3Dblue-chips&cluster=devnet');
  });
});

describe('Season Pass Action', () => {
  it('builds exactly the instruction the app builds', () => {
    const skrMint = Keypair.fromSeed(new Uint8Array(32).fill(11)).publicKey;
    const treasury = Keypair.fromSeed(new Uint8Array(32).fill(12)).publicKey;
    const a = buyPassIx(player, { skrMint, treasury });
    const b = appBuyPassIx(new PublicKey(player.toBase58()) as never, { skrMint, treasury, season: null, skins: {} } as never);
    const flat = (ix: { programId: { toBase58(): string }; keys: { pubkey: { toBase58(): string }; isSigner: boolean; isWritable: boolean }[]; data: Uint8Array }) =>
      ({ program: ix.programId.toBase58(), keys: ix.keys.map((k) => [k.pubkey.toBase58(), k.isSigner, k.isWritable]), data: Buffer.from(ix.data).toString('hex') });
    expect(flat(a)).toEqual(flat(b));
  });
});

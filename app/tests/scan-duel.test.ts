/**
 * Scan to duel: the Solana Pay transaction-request URL and the pure-JS QR.
 *
 *   cd app && npx vitest run tests/scan-duel.test.ts
 */
import { describe, expect, it } from 'vitest';
import { qrDataUrl } from '../../mobile/src/game/qr';
import { duelActionUrl, duelScanLink, solanaPayDuelUrl } from '../../mobile/src/game/blink';

const SIG = '4TwiYTJCzBsM3GAznq9JVWRN1WmGtbhsbP9cFZMmw68aXF2QevBTqUXuoBqvGSHx49cCWHuV73by2KqrTixZoatC';

describe('Solana Pay transaction request', () => {
  it('is solana:<url-encoded https link> to the duel Action', () => {
    const u = solanaPayDuelUrl(SIG);
    expect(u.startsWith('solana:https%3A%2F%2Fmempire-actions.vercel.app%2Fapi%2Factions%2Fduel%3Fc%3D')).toBe(true);
    // A Solana Pay wallet decodes the link part and must get the exact Action URL back.
    expect(decodeURIComponent(u.slice('solana:'.length))).toBe(duelActionUrl(SIG));
    expect(new URL(decodeURIComponent(u.slice(7))).protocol).toBe('https:');
  });
  it('the app link is short (the ghost is read from chain)', () => {
    expect(duelScanLink(SIG)).toBe(`mempire://duel?c=${SIG}`);
  });
});

describe('QR (qrcode-generator, pure JS)', () => {
  it('encodes both links at a scannable size', () => {
    for (const text of [solanaPayDuelUrl(SIG), duelScanLink(SIG)]) {
      const q = qrDataUrl(text);
      expect(q.modules).toBeLessThanOrEqual(57); // version 10 or lower
      expect(q.uri.startsWith('data:image/gif;base64,')).toBe(true);
    }
  });
});

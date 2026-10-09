import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ loadChallenge: vi.fn() }));
vi.mock('../../mobile/src/chain/duels', () => ({ loadChallenge: mocks.loadChallenge, readDuelBoard: vi.fn() }));
import { useDuels } from '../../mobile/src/state/duels';
function deferred<T>() {
  let resolve!: (value: T) => void, reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
const challenge = (sig: string) => ({ sig, challenger: sig, time: 1, payload: null, payloadB64: null });
beforeEach(() => { useDuels.getState().closeOpen(); mocks.loadChallenge.mockReset(); });
describe('Ghost Duel link navigation', () => {
  it('keeps a dismissed sheet closed when the pending chain read returns', async () => {
    const read = deferred<ReturnType<typeof challenge>>(); mocks.loadChallenge.mockReturnValue(read.promise);
    const opening = useDuels.getState().openLink('first', null);
    useDuels.getState().closeOpen(); read.resolve(challenge('first')); await opening;
    expect(useDuels.getState().open).toBeNull();
  });
  it('the latest deep link wins over a slower earlier link', async () => {
    const first = deferred<ReturnType<typeof challenge>>(), second = deferred<ReturnType<typeof challenge>>();
    mocks.loadChallenge.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const a = useDuels.getState().openLink('first', null), b = useDuels.getState().openLink('second', null);
    second.resolve(challenge('second')); await b;
    first.resolve(challenge('first')); await a;
    expect(useDuels.getState().open?.sig).toBe('second');
  });
  it('a stale failure cannot replace the latest challenge with an error', async () => {
    const first = deferred<ReturnType<typeof challenge>>();
    mocks.loadChallenge.mockReturnValueOnce(first.promise).mockResolvedValueOnce(challenge('second'));
    const a = useDuels.getState().openLink('first', null); await useDuels.getState().openLink('second', null);
    first.reject(new Error('stale RPC error')); await a;
    expect(useDuels.getState().open?.sig).toBe('second'); expect(useDuels.getState().open?.error).toBeUndefined();
  });
});

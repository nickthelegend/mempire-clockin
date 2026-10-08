import { afterEach, describe, expect, it, vi } from 'vitest';
import { countRender, perfSummary, setPerf } from '../../mobile/src/arena/perf';
afterEach(() => { setPerf(false); vi.useRealTimers(); vi.restoreAllMocks(); });
describe('arena measurement windows', () => {
  it('starts a clean counter window when toggled off and on', () => {
    vi.useFakeTimers(); vi.spyOn(console, 'log').mockImplementation(() => {});
    setPerf(true); countRender('ticks'); countRender('Scene');
    setPerf(false); setPerf(true); countRender('ticks');
    vi.advanceTimersByTime(1000);
    expect(perfSummary()).toBe('ticks=1.0');
  });
  it('bounds always-on measurements to the last five minutes', () => {
    vi.useFakeTimers(); vi.spyOn(console, 'log').mockImplementation(() => {});
    setPerf(true); countRender('ticks'); countRender('Scene'); vi.advanceTimersByTime(1000);
    for (let i = 0; i < 300; i++) { countRender('ticks'); vi.advanceTimersByTime(1000); }
    expect(perfSummary()).toBe('ticks=1.0 Scene=0.0');
  });
});

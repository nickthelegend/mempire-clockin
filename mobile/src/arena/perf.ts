/**
 * Render-rate probe for the native arena. Off unless a battle is opened with
 * `perf=1` in its deep link (mempire://battle?...&perf=1); then every second
 * it logs how many times each instrumented component rendered and how many
 * sim ticks ran, e.g.
 *   [perf] ticks/s=20 NativeArena=20 Hud=20 Tray=20 Scene=20
 * Or bundle with EXPO_PUBLIC_PERF=1 (measurement builds only) to count every match.
 * Read it with `xcrun simctl spawn <udid> log stream --predicate 'eventMessage CONTAINS "[perf]"'`.
 */
let enabled = false;
const counts: Record<string, number> = {};
let timer: ReturnType<typeof setInterval> | null = null;
const history: Record<string, number>[] = [];

export const perfEnabled = () => enabled;

export function setPerf(on: boolean): void {
  enabled = on;
  if (timer) clearInterval(timer);
  timer = null;
  history.length = 0;
  for (const k of Object.keys(counts)) delete counts[k];
  if (!on) return;
  timer = setInterval(() => {
    const snap = { ...counts };
    for (const k of Object.keys(counts)) counts[k] = 0;
    if (!snap.ticks) return; // idle (preparing, paused)
    history.push(snap);
    if (history.length > 300) history.shift(); // bounded even in always-on measurement builds
    // eslint-disable-next-line no-console
    console.log(`[perf] ${Object.entries(snap).map(([k, v]) => `${k}=${v}`).join(' ')}`);
  }, 1000);
}

/** Count one render (or one tick) of `name`. */
export function countRender(name: string): void {
  if (enabled) counts[name] = (counts[name] ?? 0) + 1;
}

/** Mean per-second counts over the recorded window (for the end-of-match summary). */
export function perfSummary(): string {
  if (!history.length) return '';
  const keys = [...new Set(history.flatMap((h) => Object.keys(h)))];
  return keys.map((k) => `${k}=${(history.reduce((s, h) => s + (h[k] ?? 0), 0) / history.length).toFixed(1)}`).join(' ');
}

// Measurement builds only (EXPO_PUBLIC_PERF=1 at bundle time): always on.
if (process.env.EXPO_PUBLIC_PERF === '1') setPerf(true);

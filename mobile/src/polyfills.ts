// Runs before anything else (first import in index.ts). Imports are hoisted,
// so the globals web3.js needs must be installed by a module of their own —
// assigning them in index.ts body would run after App and web3.js load.
import 'react-native-get-random-values';
import { Buffer } from 'buffer';

const g = globalThis as unknown as { Buffer?: typeof Buffer };
if (!g.Buffer) g.Buffer = Buffer;

// Release builds: drop known, harmless third-party chatter (three.js and
// expo-gl capability notes on every arena open). App errors still log.
declare const __DEV__: boolean;
if (typeof __DEV__ !== 'undefined' && !__DEV__) {
  const QUIET = [
    /^THREE\.Clock: This module has been deprecated/,
    /^EXGL: gl\.pixelStorei\(\) doesn't support this parameter yet/,
    /^THREE\.WebGLRenderer: EXT_color_buffer_float extension not supported/,
  ];
  for (const level of ['log', 'warn', 'info'] as const) {
    const orig = console[level].bind(console);
    console[level] = (...args: unknown[]) => {
      if (typeof args[0] === 'string' && QUIET.some((re) => re.test(args[0] as string))) return;
      orig(...args);
    };
  }
}

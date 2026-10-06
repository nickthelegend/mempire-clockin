// Runs before anything else (first import in index.ts). Imports are hoisted,
// so the globals web3.js needs must be installed by a module of their own —
// assigning them in index.ts body would run after App and web3.js load.
import 'react-native-get-random-values';
import { Buffer } from 'buffer';

const g = globalThis as unknown as { Buffer?: typeof Buffer };
if (!g.Buffer) g.Buffer = Buffer;

/**
 * Build every film in slate.json.
 *
 * One composition, ten sets of copy. HyperFrames renders the overlay once per
 * row from `--batch`, and ffmpeg lays each overlay over the footage bed that
 * row asked for and scores it.
 *
 * The two-step split is inherited from videos/day-2-devlog and its BRIEF says
 * why: a timed <video> inside a composition gets swapped for a pre-extracted
 * frame at capture, and roughly one frame in seven came back drawn at 40% scale
 * in a corner. It passed check, passed lint and reported a successful render,
 * because --best-effort defaults to true. So the composition never touches the
 * footage.
 *
 * Usage:  node build-all.mjs [idPrefix]
 *         node build-all.mjs 01      # just the one
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, mkdirSync, existsSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, 'renders');
const TMP = join(HERE, '.batch');
const DUR = 18;
const MUSIC_IN = 6;

const only = process.argv[2] ?? '';
const slate = JSON.parse(readFileSync(join(HERE, 'slate.json'), 'utf8'))
  .filter((f) => f._id.startsWith(only));

if (!slate.length) { console.error(`nothing in slate matches "${only}"`); process.exit(1); }
mkdirSync(OUT, { recursive: true });
mkdirSync(TMP, { recursive: true });

const run = (cmd, args) => execFileSync(cmd, args, { cwd: HERE, stdio: 'inherit' });

for (const [i, film] of slate.entries()) {
  const bed = join(HERE, 'beds', `${film._bed}.mp4`);
  const music = join(HERE, 'assets', film._music === 'menu' ? 'music_menu.m4a' : 'music_battle.m4a');
  if (!existsSync(bed)) { console.error(`missing bed: ${bed}`); process.exit(1); }

  // Strip the underscore-prefixed routing keys; only real variables go to the
  // renderer, and --strict-variables turns an undeclared one into an error
  // rather than a silently ignored typo.
  const vars = Object.fromEntries(Object.entries(film).filter(([k]) => !k.startsWith('_')));
  const varsFile = join(TMP, `${film._id}.json`);
  writeFileSync(varsFile, JSON.stringify(vars));

  const overlay = join(TMP, `${film._id}.mov`);
  const final = join(OUT, `mempire-${film._id}.mp4`);

  console.log(`\n[${i + 1}/${slate.length}] ${film._id} — "${film.h1}"`);
  run('npx', ['hyperframes', 'render', '--format', 'mov', '--no-best-effort',
    '--variables-file', varsFile, '--strict-variables', '-o', overlay]);

  run('ffmpeg', [
    '-v', 'error', '-stats',
    '-i', bed, '-i', overlay, '-ss', String(MUSIC_IN), '-i', music,
    '-filter_complex', [
      '[0:v][1:v]overlay=0:0:format=auto:shortest=1[v]',
      `[2:a]volume=-9dB,afade=t=in:st=0:d=0.5,afade=t=out:st=${DUR - 2}:d=2,atrim=0:${DUR},asetpts=N/SR/TB[a]`,
    ].join(';'),
    '-map', '[v]', '-map', '[a]',
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '18', '-preset', 'slow',
    '-c:a', 'aac', '-b:a', '160k', '-ar', '44100',
    '-movflags', '+faststart', '-shortest', final, '-y',
  ]);
  console.log(`  ✓ ${final}`);
}

console.log(`\n${slate.length} film(s) in ${OUT}`);

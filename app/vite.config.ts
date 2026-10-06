import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'

/**
 * `vite build --mode native` produces the bundle the Seeker / iOS app ships
 * inside its own binary (mobile/www), loaded from file:// with no server.
 *
 * Two things differ from the web build, both because of file://:
 *  - `base: './'` — every asset URL is relative to index.html, since a file://
 *    document has no origin root to resolve `/assets/...` against.
 *  - one classic script, not ES modules. WebKit and Chromium both refuse
 *    `<script type="module">` from a file:// page (a module fetch is a CORS
 *    request and file:// has origin `null`), so the whole app is emitted as a
 *    single IIFE and the module/crossorigin attributes are stripped.
 */
function classicScripts(): Plugin {
  return {
    name: 'mempire-classic-scripts',
    apply: 'build',
    enforce: 'post',
    transformIndexHtml(html) {
      return html
        .replace(/<script type="module" crossorigin/g, '<script defer')
        .replace(/<script type="module"/g, '<script defer')
        .replace(/ crossorigin/g, '')
        .replace(/<link rel="modulepreload"[^>]*>/g, '');
    },
  };
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const native = mode === 'native';
  return {
    base: native ? './' : '/',
    plugins: native ? [react(), classicScripts()] : [react()],
    server: {
      port: Number(process.env.PORT) || 5173,
      strictPort: Boolean(process.env.PORT),
    },
    build: native
      ? {
        outDir: 'dist-native',
        modulePreload: false,
        rollupOptions: {
          output: { format: 'iife', inlineDynamicImports: true },
        },
      }
      : undefined,
  };
});

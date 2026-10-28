/**
 * Builds the live demo page: the sample-data app with the demo script beside it as a presenter guide, in one
 * self-contained HTML file. Open it from disk, put it on any web host, or share it as a page.
 *
 *   npm run build:live                 writes dist-live/live-demo.html
 *   npm run build:live -- --fragment   also writes dist-live/live-demo.fragment.html: the same page without its
 *                                      html, head and body tags, for hosts that wrap a page in their own document
 *
 * The page needs no URL parameters: the guide switches people and screens itself, and its Setup tab rebrands the
 * demo for the audience. The only outside request is for the guide's fonts, which fall back to system fonts.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';
import react from '@vitejs/plugin-react';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(root, 'dist-live');
const withFragment = process.argv.includes('--fragment');

const FONTS = 'https://fonts.googleapis.com/css2?family=Atkinson+Hyperlegible+Mono:wght@400;500&family=Atkinson+Hyperlegible+Next:wght@400;600;700&family=Barlow+Semi+Condensed:wght@600;700&display=swap';

/** In the live page the app sits in a column beside the guide, so its width breakpoints follow that column. */
const containerQueries = {
  name: 'live-container-queries',
  enforce: 'pre',
  transform(code, id) {
    if (!id.replace(/\\/g, '/').endsWith('/src/styles.css')) return null;
    let converted = 0;
    const out = code.replace(/@media\s*\(\s*max-width:\s*(\d+)px\s*\)/g, (_, px) => {
      converted++;
      return `@container (max-width: ${px}px)`;
    });
    if (!converted) this.error('src/styles.css has no max-width media queries to convert. Update scripts/build-live.mjs.');
    return { code: out, map: null };
  },
};

const result = await build({
  configFile: false,
  root,
  base: './',
  mode: 'production',
  logLevel: 'warn',
  publicDir: false,
  plugins: [react(), containerQueries],
  build: {
    write: false,
    outDir,
    cssCodeSplit: false,
    modulePreload: false,
    assetsInlineLimit: 100_000_000,
    chunkSizeWarningLimit: 4096,
    rollupOptions: {
      input: path.join(root, 'live/main.tsx'),
      output: { inlineDynamicImports: true },
    },
  },
});

const files = (Array.isArray(result) ? result : [result]).flatMap((r) => r.output);
const chunks = files.filter((f) => f.type === 'chunk');
const styles = files.filter((f) => f.type === 'asset' && f.fileName.endsWith('.css'));
const other = files.filter((f) => f.type === 'asset' && !f.fileName.endsWith('.css'));
if (chunks.length !== 1) throw new Error(`Expected one script, got ${chunks.map((c) => c.fileName).join(', ')}`);
if (other.length) throw new Error(`Assets would not be inlined: ${other.map((a) => a.fileName).join(', ')}`);

let js = chunks[0].code;
if (js.includes('<!--')) throw new Error('The script contains "<!--", which an inline script cannot hold safely.');
js = js.replace(/<\/(script)/gi, '<\\/$1');
const css = styles.map((s) => String(s.source)).join('\n').replace(/<\/(style)/gi, '<\\/$1');

const appName = /appName:\s*'([^']+)'/.exec(fs.readFileSync(path.join(root, 'src/brand.ts'), 'utf8'))?.[1] ?? 'PPM';
const escape = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');

const head = [
  `<title>${escape(appName)} Live Demo</title>`,
  `<meta name="description" content="${escape(`The ${appName} demo with sample data, and the demo script beside it as a presenter guide.`)}">`,
  '<meta name="theme-color" content="#0B2E32">',
  '<link rel="preconnect" href="https://fonts.googleapis.com">',
  '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>',
  `<link rel="stylesheet" href="${FONTS}">`,
  `<style>\n${css}\n</style>`,
].join('\n');

const body = [
  '<div class="lv-layout" id="lv-layout">',
  `<div class="lv-app" role="region" aria-label="${escape(appName)}"><div id="root"></div></div>`,
  '<aside class="lv-guide" id="lv-guide" aria-label="Demo guide"></aside>',
  '</div>',
  `<script type="module">\n${js}\n</script>`,
].join('\n');

const page = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
${head}
</head>
<body>
${body}
</body>
</html>
`;

fs.mkdirSync(outDir, { recursive: true });
const written = [['live-demo.html', page]];
if (withFragment) written.push(['live-demo.fragment.html', `${head}\n${body}\n`]);
for (const [name, html] of written) {
  fs.writeFileSync(path.join(outDir, name), html);
  console.log(`  ✓ ${path.relative(root, path.join(outDir, name))}  ${(Buffer.byteLength(html) / 1024).toFixed(0)} KB`);
}

import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { Plugin } from 'vite';
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';

/* Yig'ilgan bitta HTML faylni loyiha papkasiga «jarayon-svodi.html» nomi bilan qo'yadi, Vercel sayti uchun sayt/index.html,
   tarmoqdagi umumiy papka (SVOD_SHARE, odatda C:\svod) bo'lsa — unga ham, va Claude'dagi
   havolali sahifa uchun dist/artifact.html nusxasini yozadi. */
const HERE = import.meta.dirname;
const OUT = resolve(HERE, '..', 'jarayon-svodi.html');
const SHARE = process.env.SVOD_SHARE ?? 'C:\\svod';
const SITE = resolve(HERE, '..', 'sayt');

/** Claude sahifasi uchun: <!doctype>/<html>/<head>/<body> qobig'isiz (qobiqni platforma o'zi qo'yadi) */
function artifactPage(html: string) {
  const head = html.match(/^<!doctype html>\s*<html[^>]*>\s*<head>\s*(?:<meta[^>]*>\s*)*/i);
  if (!head) throw new Error('artifact.html: kutilmagan bosh qism');
  const rest = html.slice(head[0].length);
  const end = rest.lastIndexOf('</head>'), open = rest.indexOf('<body>', end), close = rest.lastIndexOf('</body>');
  if (end < 0 || open < 0 || close < open) throw new Error('artifact.html: kutilmagan tuzilma');
  return rest.slice(0, end) + rest.slice(open + '<body>'.length, close).trim() + '\n';
}

function publishPage(): Plugin {
  return {
    name: 'publish-page',
    apply: 'build',
    closeBundle() {
      const built = resolve(HERE, 'dist', 'index.html');
      copyFileSync(built, OUT);
      console.log(`\n  Tayyor: ${OUT}`);
      mkdirSync(SITE, { recursive: true });
      copyFileSync(built, join(SITE, 'index.html'));             // Vercel'dagi sayt: npm run deploy
      if (existsSync(SHARE)) {
        copyFileSync(built, join(SHARE, 'jarayon-svodi.html'));
        console.log(`  Tarmoqqa: ${join(SHARE, 'jarayon-svodi.html')}`);
      }
      writeFileSync(resolve(HERE, 'dist', 'artifact.html'), artifactPage(readFileSync(built, 'utf8')));
      console.log('  Claude sahifasi uchun: dist/artifact.html\n');
    },
  };
}

export default defineConfig({
  base: './',
  plugins: [react(), viteSingleFile({ removeViteModuleLoader: true }), publishPage()],
  // Klassik (iife) Worker: file:// da ochilgan sahifa "null" origin bo'ladi va Chrome blob'dan
  // module Worker'ni ochmaydi — klassik Worker esa ochiladi.
  worker: { format: 'iife' },
  build: {
    target: 'es2020',
    outDir: 'dist',
    emptyOutDir: true,
    assetsInlineLimit: Number.MAX_SAFE_INTEGER,
    chunkSizeWarningLimit: 2000,
    reportCompressedSize: false,
  },
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
    testTimeout: 60000,
  },
});

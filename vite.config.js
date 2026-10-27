import { defineConfig } from 'vite';
import { resolve } from 'path';
import { copyFileSync, existsSync, cpSync, mkdirSync } from 'fs';

const rootDir = import.meta.dirname;

export default defineConfig({
  root: 'app',
  base: './',
  build: {
    outDir: '../dist',
    emptyOutDir: true,
    target: 'esnext',
    rollupOptions: {
      input: {
        main: resolve(rootDir, 'app/index.html'),
        privacy: resolve(rootDir, 'app/privacy.html'),
        cookies: resolve(rootDir, 'app/cookies.html'),
      },
    },
  },
  plugins: [
    {
      name: 'copy-pwa-assets',
      closeBundle() {
        for (const file of ['sw.js', 'manifest.webmanifest', 'config.js']) {
          const src = resolve(rootDir, 'app', file);
          const dest = resolve(rootDir, 'dist', file);
          if (existsSync(src)) copyFileSync(src, dest);
        }
        // Ensure theme-boot is copied for index.html non-module script tag
        mkdirSync(resolve(rootDir, 'dist/js'), { recursive: true });
        const tbSrc = resolve(rootDir, 'app/js/theme-boot.js');
        const tbDest = resolve(rootDir, 'dist/js/theme-boot.js');
        if (existsSync(tbSrc)) copyFileSync(tbSrc, tbDest);

        for (const dir of ['sounds', 'icons', 'fonts', 'mochi', 'cookie']) {
          const src = resolve(rootDir, 'app', dir);
          const dest = resolve(rootDir, 'dist', dir);
          if (existsSync(src)) cpSync(src, dest, { recursive: true });
        }
      },
    },
  ],
});

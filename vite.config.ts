import fs from 'node:fs';
import { defineConfig, type PluginOption } from 'vite';
import react from '@vitejs/plugin-react';
import { powerApps } from '@microsoft/power-apps-vite';

// The Power Apps plugin needs power.config.json (created by `pac code init`); local mock previews run without it.
const hasPowerConfig = fs.existsSync(new URL('./power.config.json', import.meta.url));

export default defineConfig({
  plugins: [react(), ...(hasPowerConfig ? [powerApps() as PluginOption] : [])],
  base: './',
  server: { port: 3000 },
  build: { outDir: 'dist', chunkSizeWarningLimit: 1500 },
});

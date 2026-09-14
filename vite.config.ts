import { defineConfig } from 'vite';
export default defineConfig({ build: { target: 'es2022', rollupOptions: { input: ['index.html', 'settings.html', 'counter.html', 'preview.html'] } } });

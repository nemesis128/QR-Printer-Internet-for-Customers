import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PROD_CSP = `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'`;

const DEV_CSP = `default-src 'self' http://localhost:5173 ws://localhost:5173; script-src 'self' http://localhost:5173 'unsafe-inline' 'unsafe-eval'; style-src 'self' http://localhost:5173 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self' http://localhost:5173 ws://localhost:5173`;

export default defineConfig(({ mode }) => ({
  plugins: [
    react(),
    {
      name: 'csp-swap',
      transformIndexHtml(html: string) {
        const csp = mode === 'development' ? DEV_CSP : PROD_CSP;
        return html.replace(/__CSP__/, csp);
      },
    },
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src/renderer'),
      '@shared': path.resolve(__dirname, 'src/shared'),
    },
  },
  server: { port: 5173, strictPort: true },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: true,
  },
  optimizeDeps: { exclude: ['electron'] },
}));

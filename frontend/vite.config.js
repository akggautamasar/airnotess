import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],

  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      }
    }
  },

  // Tell Vite to treat the pdf.js worker as a URL asset
  assetsInclude: ['**/*.mjs'],

  optimizeDeps: {
    // Exclude pdfjs from pre-bundling — it handles its own worker
    exclude: ['pdfjs-dist'],
  },

  build: {
    rollupOptions: {
      output: {
        // Keep the worker in a separate chunk
        manualChunks: {
          pdfjs: ['pdfjs-dist'],
        }
      }
    }
  }
});

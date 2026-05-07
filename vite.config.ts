import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  root: 'client',
  plugins: [react()],
  resolve: {
    alias: { '@': path.resolve(__dirname, 'client/src') },
  },
  build: {
    outDir: '../dist/client',
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    proxy: {
      '/api': { target: 'http://localhost:3847', changeOrigin: true },
      '/ws': { target: 'ws://localhost:3847', ws: true },
    },
  },
})

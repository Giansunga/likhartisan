import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'

export default defineConfig(({ mode }) => ({
  plugins: [react(), tailwindcss()],
  server: {
    host: true,
    allowedHosts: true as any,
    proxy: {
      '/media/': {
        target: loadEnv(mode, process.cwd(), '').ASSET_GATEWAY_ORIGIN || 'https://likhartisan-assets.likhartisan-assets.workers.dev',
        changeOrigin: true,
        rewrite: value => value.replace(/^\/media/, ''),
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    chunkSizeWarningLimit: 1000,
    rollupOptions: {
      output: {
        manualChunks: (id) => {
          if (id.includes('node_modules')) {
            if (id.includes('three')) return 'vendor-three';
            if (id.includes('framer-motion')) return 'vendor-framer';
            if (id.includes('react') || id.includes('react-dom') || id.includes('react-router-dom')) return 'vendor-react';
            if (id.includes('@supabase/supabase-js')) return 'vendor-supabase';
            return 'vendor';
          }
        },
      },
    },
  },
}))

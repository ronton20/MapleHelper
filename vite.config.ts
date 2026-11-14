import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// base './' so the build works from GitHub Pages sub-paths or file://
export default defineConfig({
  base: './',
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.png', 'apple-touch-icon.png', 'icons/**/*'],
      manifest: {
        name: 'Maple Helper',
        short_name: 'Maple',
        description: 'MapleStory gear & HEXA tracker',
        theme_color: '#0c0d10',
        background_color: '#0c0d10',
        display: 'standalone',
        orientation: 'any',
        start_url: './',
        scope: './',
        icons: [
          { src: 'pwa-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'pwa-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // app shell + OCR engine are precached; the language file is large, cache it on first use instead
        globPatterns: ['**/*.{js,css,html,png,svg,wasm}'],
        globIgnores: ['tessdata/**', 'tess/**'],
        maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
        runtimeCaching: [
          { urlPattern: /\/tess(data)?\//, handler: 'CacheFirst', options: { cacheName: 'ocr-engine', expiration: { maxEntries: 12 } } },
          { urlPattern: /^https:\/\/maplestory\.io\/api\/.*\/icon/, handler: 'CacheFirst', options: { cacheName: 'item-icons', expiration: { maxEntries: 2000, maxAgeSeconds: 60 * 60 * 24 * 90 } } },
          { urlPattern: /^https:\/\/msavatar\d*\.nexon\.net\//, handler: 'StaleWhileRevalidate', options: { cacheName: 'avatars', expiration: { maxEntries: 50 } } },
        ],
      },
    }),
  ],
})

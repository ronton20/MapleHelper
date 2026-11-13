import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'

// base './' so the build works from GitHub Pages sub-paths or file://
export default defineConfig({
  base: './',
  plugins: [react(), tailwindcss()],
})

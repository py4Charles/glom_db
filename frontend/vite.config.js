import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// The API is proxied rather than called cross-origin so the browser sees a
// single origin: no CORS preflight, and cookies or auth headers stay same-site.
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
})

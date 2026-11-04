/// <reference types="vitest" />
import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// The app page. `npm run build` then builds the service worker with
// vite.sw.config.js into the same dist/ (that build does not empty it).
// Test builds (npm run package -- --test, or any *-test-* zip) set TOOLKIT_TEST_BUILD=1:
// they get the To Test page. Store builds compile it out (__TEST_BUILD__ is false).
const TEST_BUILD = process.env.TOOLKIT_TEST_BUILD === '1'

export default defineConfig({
  plugins: [vue()],
  define: {
    __TEST_BUILD__: JSON.stringify(TEST_BUILD),
    __TEST_COMMIT__: JSON.stringify(TEST_BUILD ? process.env.TOOLKIT_TEST_COMMIT || '' : ''),
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: { input: { app: fileURLToPath(new URL('./app.html', import.meta.url)) } },
  },
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  test: {
    environment: 'jsdom',
    globals: true,
    exclude: ['**/node_modules/**', 'legacy/**'],
  },
})

import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { createRequire } from 'node:module'
const { dispatcherRelease } = createRequire(import.meta.url)('../scripts/dispatcherRelease.cjs')
const release: string = dispatcherRelease()

// https://vite.dev/config/
export default defineConfig({
  define: { __DISPATCHER_RELEASE__: JSON.stringify(release) },
  plugins: [react(), {
    name: 'dispatcher-release',
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'dispatcher-version.json', source: JSON.stringify({ release }) })
    },
  }],
  preview: {
    host: '0.0.0.0',
    port: 10000,
    allowedHosts: ['speedy-dispatcher.onrender.com']
  }
})
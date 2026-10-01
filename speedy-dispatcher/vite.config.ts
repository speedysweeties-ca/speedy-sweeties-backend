import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  base: process.env.VITE_ISOLATED_STAGING === "true" ? "/staging-dispatcher/" : "/",
  plugins: [react(), ...(process.env.VITE_ISOLATED_STAGING === "true" ? [{name:"staging-no-external-maps",transformIndexHtml(html: string){return html.replace(/<script\s+src="https:\/\/maps\.googleapis\.com[\s\S]*?<\/script>/g, "");}}] : [])],
  preview: {
    host: '0.0.0.0',
    port: 10000,
    allowedHosts: ['speedy-dispatcher.onrender.com']
  }
})

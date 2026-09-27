import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'

/**
 * Production builds get a Content-Security-Policy that only allows the app's
 * own origin, so no code path (ours or a dependency's) can reach a server.
 * 'unsafe-inline' stays allowed because Capacitor injects its native bridge
 * as an inline script. Not applied in dev, where Vite needs its HMR socket.
 */
const offlineCsp = (): Plugin => ({
  name: 'offline-csp',
  apply: 'build',
  transformIndexHtml: (html) =>
    html.replace(
      '<meta charset="UTF-8" />',
      `<meta charset="UTF-8" />\n    <meta http-equiv="Content-Security-Policy" content="default-src 'self' 'unsafe-inline' data: blob:; base-uri 'none'; form-action 'none'; object-src 'none'" />`,
    ),
})

export default defineConfig({
  plugins: [react(), offlineCsp()],
})

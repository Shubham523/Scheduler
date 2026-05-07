import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import fs from 'fs'
import path from 'path'

/**
 * Reads src/firebase-messaging-sw.js, replaces __VITE_*__ placeholders
 * with real env values, and writes the result to public/firebase-messaging-sw.js.
 * Runs at dev-server start and at build time — the generated file is gitignored.
 */
function firebaseSwPlugin(env) {
  // Strip template-only header comments (lines starting with // ⚠️ or // The Vite plugin)
  const TEMPLATE_HEADER_RE = /^\/\/ ⚠️.*\n(\/\/.*\n)*/m

  const processSw = () => {
    const dir = import.meta.dirname
    const templatePath = path.resolve(dir, 'src/firebase-messaging-sw.js')
    let template = fs.readFileSync(templatePath, 'utf-8')

    // Remove the template-only warning comments so they don't appear in the output
    template = template.replace(TEMPLATE_HEADER_RE, '')

    // Replace every __VITE_*__ placeholder with the matching env var
    template = template.replace(/__VITE_([A-Z0-9_]+)__/g, (_, key) => {
      const value = env[`VITE_${key}`]
      if (!value) console.warn(`[firebase-sw] Missing env var: VITE_${key}`)
      return value || ''
    })

    return template
  }

  return {
    name: 'firebase-sw-inject',
    // Runs at dev-server start — writes processed SW to public/ for the dev server to serve
    configResolved() {
      const dir = import.meta.dirname
      const outputPath = path.resolve(dir, 'public/firebase-messaging-sw.js')
      fs.writeFileSync(outputPath, processSw(), 'utf-8')
      console.log('[firebase-sw] Generated public/firebase-messaging-sw.js ✓')
    },
    // Runs at build time — emits processed SW directly into dist/
    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: 'firebase-messaging-sw.js',
        source: processSw(),
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  // Load all env vars (no prefix filter) so the plugin can access VITE_* vars
  const env = loadEnv(mode, process.cwd(), '')

  return {
    plugins: [react(), firebaseSwPlugin(env)],
  }
})

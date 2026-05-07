import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import fs from 'fs'
import path from 'path'

/**
 * Reads src/firebase-messaging-sw.js, replaces __VITE_*__ placeholders
 * with real env values, and writes the result to public/firebase-messaging-sw.js.
 * Runs at dev-server start and at build time — the generated file is gitignored.
 */
function firebaseSwPlugin() {
  const injectSw = (env) => {
    const templatePath = path.resolve(__dirname, 'src/firebase-messaging-sw.js')
    const outputPath = path.resolve(__dirname, 'public/firebase-messaging-sw.js')

    let template = fs.readFileSync(templatePath, 'utf-8')

    // Replace every __VITE_*__ placeholder with the matching env var
    template = template.replace(/__VITE_([A-Z0-9_]+)__/g, (_, key) => {
      const value = env[`VITE_${key}`]
      if (!value) console.warn(`[firebase-sw] Missing env var: VITE_${key}`)
      return value || ''
    })

    fs.writeFileSync(outputPath, template, 'utf-8')
    console.log('[firebase-sw] Generated public/firebase-messaging-sw.js ✓')
  }

  return {
    name: 'firebase-sw-inject',
    // Called when the dev server starts
    configResolved(config) {
      injectSw(config.env)
    },
    // Also emit the processed SW as a build asset
    generateBundle(_, bundle) {
      const templatePath = path.resolve(__dirname, 'src/firebase-messaging-sw.js')
      let template = fs.readFileSync(templatePath, 'utf-8')

      template = template.replace(/__VITE_([A-Z0-9_]+)__/g, (_, key) => {
        return process.env[`VITE_${key}`] || ''
      })

      this.emitFile({
        type: 'asset',
        fileName: 'firebase-messaging-sw.js',
        source: template,
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  // Expose VITE_* vars to the plugin via process.env for build step
  Object.entries(env).forEach(([k, v]) => {
    if (k.startsWith('VITE_')) process.env[k] = v
  })

  return {
    plugins: [react(), firebaseSwPlugin()],
  }
})

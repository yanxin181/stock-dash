import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'
export default defineConfig(({ mode }) => {
  const port = process.env.PORT || loadEnv(mode, process.cwd(), '').PORT || '4174'
  return { plugins: [vue()], server: { proxy: { '/api': `http://127.0.0.1:${port}` } } }
})

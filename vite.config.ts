import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'
import { localPortfolioInsightsPlugin } from './server/portfolioInsights.ts'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  return {
    plugins: [
      react(),
      localPortfolioInsightsPlugin({
        host: process.env.OLLAMA_HOST ?? env.OLLAMA_HOST ?? 'http://127.0.0.1:11434',
        model: process.env.OLLAMA_MODEL ?? env.OLLAMA_MODEL ?? 'beam:cloud',
      }),
    ],
    server: {
      port: 3000,
      strictPort: true,
    },
  }
})

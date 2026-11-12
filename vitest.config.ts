import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    // 前端测试用 jsdom；API/后端测试用 node（execution-engine 依赖 node:vm / sharp / playwright）
    environment: 'node',
    environmentMatchGlobs: [
      ['src/**', 'jsdom'],
    ],
    exclude: ['**/node_modules/**', '**/dist/**', '**/.git/**'],
    setupFiles: [],
    globals: true,
  },
})

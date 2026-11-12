import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tsconfigPaths from "vite-tsconfig-paths";

// https://vite.dev/config/
export default defineConfig(({ command }) => ({
  build: {
    sourcemap: 'hidden',
    rollupOptions: {
      output: {
        // 手动分包：框架代码与图表库独立成 chunk，页面组件随路由懒加载按需加载
        manualChunks: {
          'vendor-react': ['react', 'react-dom', 'react-router-dom', 'zustand'],
          'vendor-charts': ['recharts'],
        },
      },
    },
  },
  plugins: [
    react({
      babel: {
        // react-dev-locator 只在 dev(serve) 时注入 JSX 定位信息，避免生产包体积膨胀
        plugins: command === 'serve' ? ['react-dev-locator'] : [],
      },
    }),
    tsconfigPaths()
  ],
  server: {
    host: '0.0.0.0',
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:3001',
        changeOrigin: true,
      },
    },
  },
  preview: {
    host: '0.0.0.0',
    port: 4173,
  },
}))

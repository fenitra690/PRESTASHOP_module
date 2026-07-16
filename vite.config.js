import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueDevTools from 'vite-plugin-vue-devtools'

export default defineConfig({
  plugins: [vue(), vueDevTools()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    proxy: {
      // Le tunnel : quand tu appelles '/api', Vite redirige vers ton PrestaShop local
      '/api': {
        target: 'http://localhost/Pestashop1',
        changeOrigin: true,
        secure: false,
      },
      // Tunnel pour les modules frontaux PrestaShop
      '/index.php': {
        target: 'http://localhost/Pestashop1',
        changeOrigin: true,
        secure: false,
      },
    },
  },
})

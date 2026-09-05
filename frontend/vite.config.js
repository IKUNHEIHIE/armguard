import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import path from 'path';
// https://vitejs.dev/config/
export default defineConfig({
    plugins: [vue()],
    resolve: {
        alias: {
            '@': path.resolve(__dirname, './src')
        }
    },
    server: {
        port: 3000,
        host: '0.0.0.0',
        proxy: {
            '/api': {
                target: 'http://127.0.0.1:8888',
                changeOrigin: true
            },
            '/terminal/ws': {
                target: 'ws://127.0.0.1:8888',
                ws: true
            },
            '/system/monitor/ws': {
                target: 'ws://127.0.0.1:8888',
                ws: true
            }
        }
    },
    build: {
        outDir: 'dist',
        assetsDir: 'assets',
        chunkSizeWarningLimit: 2000,
        cssCodeSplit: false, // Single consolidated CSS for 0ms style rendering
        rollupOptions: {
            output: {
                manualChunks: {
                    'vendor-core': ['vue', 'vue-router', 'pinia', 'axios'],
                    'vendor-icons': ['lucide-vue-next'],
                    'vendor-terminal': ['@xterm/xterm', '@xterm/addon-fit']
                }
            }
        }
    }
});

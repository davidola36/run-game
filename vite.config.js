import { defineConfig } from 'vite';

export default defineConfig({
    root: '.',
    base: './',
    server: {
        host: true,
        allowedHosts: true,
        port: 3000,
        proxy: {
            '/ws': {
                target: 'ws://localhost:3001',
                ws: true,
                changeOrigin: true,
                rewrite: (path) => path.replace(/^\/ws/, '')
            }
        }
    },
    optimizeDeps: {
        include: [
            'three',
            'three/examples/jsm/loaders/GLTFLoader',
            'three/examples/jsm/loaders/DRACOLoader',
            'three/examples/jsm/loaders/KTX2Loader',
            '@tensorflow/tfjs',
            '@tensorflow/tfjs-backend-webgl',
            '@tensorflow-models/pose-detection',
            'dat.gui'
        ],
        exclude: []
    },
    build: {
        commonjsOptions: {
            include: [/node_modules/]
        }
    }
}); 
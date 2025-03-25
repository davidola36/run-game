import { defineConfig } from 'vite';

export default defineConfig({
    root: '.',
    base: './',
    server: {
        host: true,
        port: 3000,
        // strictPort: true,
        // hmr: {
        //     host: 'localhost',
        //     clientPort: 443
        // },
        // cors: true,
        allowedHosts: true
    },
    preview: {
        host: true,
        port: 3000,
        strictPort: true
    },
    optimizeDeps: {
        include: [
            '@tensorflow/tfjs-core',
            '@tensorflow/tfjs-backend-webgl',
            '@tensorflow-models/posenet'
        ]
    },
    build: {
        commonjsOptions: {
            include: [/node_modules/]
        }
    }
}); 
import { defineConfig } from 'vite'

export default defineConfig({
  base: './',
  server: {
    allowedHosts: ['.ngrok-free.dev'],
  },
  build: {
    rollupOptions: {
      input: {
        main: 'index.html',     // printed marker cube (8th Wall image targets)
        block: 'block.html',    // white block with red corner dots
        pen: 'pen.html',        // any pen with two neon stickers
        stool: 'stool.html',    // SONGMICS ottoman, 8 seat stickers
      },
    },
  },
});

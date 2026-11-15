import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// The browser imports only the data-free types module of the engine – never its index (which bundles the answers).
const typesAlias = { find: /^@arena\/types$/, replacement: fileURLToPath(new URL('../../packages/engine/src/types.ts', import.meta.url)) };
// Game 1 public types and display content (no true preferences: those stay in market/model.ts on the server).
const marketAlias = { find: /^@arena\/market$/, replacement: fileURLToPath(new URL('../../packages/engine/src/market/types.ts', import.meta.url)) };

// Game 3 public types (no hidden committees: those stay in abm/model.ts on the server).
const abmAlias = { find: /^@arena\/abm$/, replacement: fileURLToPath(new URL('../../packages/engine/src/abm/types.ts', import.meta.url)) };

// Khung phòng nhiều vòng: chỉ hình dạng phòng công khai (rs/room.ts và rs/registry.ts ở lại máy chủ).
const rsAlias = { find: /^@arena\/rs$/, replacement: fileURLToPath(new URL('../../packages/engine/src/rs/types.ts', import.meta.url)) };
// Game 4 phần công khai (chuyển dịch nào thật, chất lượng tín hiệu ở lại sg/game.ts).
const sgAlias = { find: /^@arena\/sg$/, replacement: fileURLToPath(new URL('../../packages/engine/src/sg/types.ts', import.meta.url)) };
// Game 5 phần công khai (trọng số giai đoạn và lượt rút sự cố ở lại jt/game.ts).
const jtAlias = { find: /^@arena\/jt$/, replacement: fileURLToPath(new URL('../../packages/engine/src/jt/types.ts', import.meta.url)) };

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { alias: [typesAlias, marketAlias, abmAlias, rsAlias, sgAlias, jtAlias] },
  server: {
    port: 5173,
    strictPort: true,
    proxy: { '/api': { target: 'http://127.0.0.1:8080', changeOrigin: false } },
  },
  preview: {
    port: 4173,
    proxy: { '/api': { target: 'http://127.0.0.1:8080', changeOrigin: false } },
  },
  build: {
    target: 'es2022',
    sourcemap: false,
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      output: {
        manualChunks: {
          firebase: ['firebase/app', 'firebase/firestore'],
          react: ['react', 'react-dom', 'react-router-dom'],
        },
      },
    },
  },
});

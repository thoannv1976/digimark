// Bundles the API and the workspace engine (question bank included) into dist/server.js for Cloud Run.
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

await build({
  entryPoints: ['src/server.ts'],
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'esm',
  outfile: 'dist/server.js',
  sourcemap: true,
  packages: 'external',
  plugins: [
    {
      name: 'bundle-engine',
      setup(b) {
        b.onResolve({ filter: /^@arena\/engine$/ }, () => ({ path: fileURLToPath(new URL('../../packages/engine/src/index.ts', import.meta.url)) }));
      },
    },
  ],
  banner: { js: "import { createRequire } from 'module'; const require = createRequire(import.meta.url);" },
});
console.log('API built → dist/server.js');

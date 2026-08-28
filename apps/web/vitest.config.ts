import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@planner/contracts': path.resolve(root, '../../packages/contracts/src/index.ts'),
      '@planner/shared': path.resolve(root, '../../packages/shared/src/index.ts'),
      '@planner/ui/styles.css': path.resolve(root, '../../packages/ui/src/styles.css'),
      '@planner/ui': path.resolve(root, '../../packages/ui/src/index.ts'),
      '@': path.resolve(root, 'src'),
    },
  },
  test: { globals: true, environment: 'jsdom', setupFiles: ['./src/test/setup.ts'], css: false },
});

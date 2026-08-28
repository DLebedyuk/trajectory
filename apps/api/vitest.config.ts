import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['test/**/*.test.ts'],
    // тесты делят одну базу и чистят её в beforeAll — файлы идут строго по очереди
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});

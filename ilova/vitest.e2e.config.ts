import { defineConfig } from 'vitest/config';

/* Brauzer testi: yig'ilgan ../jarayon-svodi.html ni haqiqiy Chrome/Edge'da ochadi (npm run build dan keyin). */
export default defineConfig({
  test: {
    include: ['tests/e2e/**/*.e2e.ts'],
    environment: 'node',
    testTimeout: 240000,
    hookTimeout: 60000,
    fileParallelism: false,
  },
});

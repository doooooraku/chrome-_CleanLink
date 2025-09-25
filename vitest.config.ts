import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    include: ['tests/unit/**/*.test.ts'],
    environment: 'jsdom',
    globals: true,
    setupFiles: ['tests/unit/setup.vitest.ts'],
    exclude: ['tests/e2e/**']
  }
});

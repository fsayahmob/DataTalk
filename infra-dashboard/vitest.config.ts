import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.{test,spec}.{js,ts,tsx}'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/**/*.{ts,tsx}'],
      exclude: [
        'src/**/*.test.{ts,tsx}',
        'src/**/*.spec.{ts,tsx}',
        'src/test/**',
        'src/main.tsx',
        'src/vite-env.d.ts',
        // Exclude React components and server code from coverage thresholds for now
        // These require more complex integration testing
        'src/components/**',
        'src/hooks/**',
        'src/server/**',
        'src/services/**',
        'src/App.tsx',
      ],
      thresholds: {
        // Core utils and theme must have high coverage
        'src/utils/compareArchitecture.ts': {
          statements: 90,
          branches: 75,
          functions: 90,
          lines: 90,
        },
        'src/theme/colors.ts': {
          statements: 90,
          branches: 80,
          functions: 90,
          lines: 90,
        },
      },
    },
  },
});

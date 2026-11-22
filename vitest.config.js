// vitest.config.js - Vitest configuration for CommonJS project
const { defineConfig } = require('vitest/config');

module.exports = defineConfig({
  test: {
    globals: true,
    coverage: {
      provider: 'v8',
      reporter: ['text'],
      include: ['validation.js', 'logger.js', 'tracing.js'],
    },
  },
});

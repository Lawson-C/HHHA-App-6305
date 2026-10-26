// Contract tests against a live backend: `npm run test:contract` (see docs/development.md).
const base = require('./package.json').jest;

module.exports = {
  ...base,
  testEnvironment: '<rootDir>/test/contract-env.js',
  setupFiles: ['<rootDir>/test/contract-setup.ts', ...base.setupFiles],
  testMatch: ['<rootDir>/src/__integration__/**/*-test.ts'],
  testPathIgnorePatterns: ['/node_modules/', '/studio/', '/supabase/'],
};

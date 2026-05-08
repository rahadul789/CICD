export default {
  clearMocks: true,
  collectCoverageFrom: ['src/**/*.js', '!src/server.js'],
  coverageDirectory: 'coverage',
  setupFiles: ['<rootDir>/tests/setup-env.js'],
  testEnvironment: 'node',
  testMatch: ['<rootDir>/tests/**/*.test.js'],
  verbose: true
};

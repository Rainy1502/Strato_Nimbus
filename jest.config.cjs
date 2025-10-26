module.exports = {
  testEnvironment: 'node',
  // Only run .test.cjs files to avoid ESM parsing issues for this repo setup
  testMatch: ['**/tests/**/*.test.cjs'],
};

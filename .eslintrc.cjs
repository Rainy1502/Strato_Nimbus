module.exports = {
  root: true,
  env: {
    node: true,
    es2021: true,
    jest: true
  },
  rules: {
    'no-empty': ['error', { 'allowEmptyCatch': true }],
    // small, practical rules to keep code clear
    'no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
    'no-console': 'off'
  },
  overrides: [
    {
      files: ['public/js/**'],
      env: { browser: true }
    }
  ],
  parserOptions: {
    ecmaVersion: 2021,
    sourceType: 'module'
  },
  extends: ['eslint:recommended']
};

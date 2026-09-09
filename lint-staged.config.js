const sourceChecks = ['eslint --fix --max-warnings 0', 'prettier --write'];
export default {
  '{src,tests,examples,scripts}/**/*.{ts,js,mjs}': sourceChecks,
  '*.config.{ts,js}': sourceChecks,
  '*.{json,md,yml,yaml}': 'prettier --write',
};

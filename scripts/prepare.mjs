if (
  !process.env.CI &&
  process.env.HUSKY !== '0' &&
  process.env.NODE_ENV !== 'production'
) {
  const { default: husky } = await import('husky');
  husky();
}

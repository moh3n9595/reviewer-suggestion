const version = process.argv[2];

if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(version ?? '')) {
  throw new Error('A valid semantic version is required.');
}

const major = version.split('.')[0];

process.stdout.write(`
### GitHub Action · Code review

This release also publishes the bundled GitHub Action from the immutable \`v${version}\` tag. Workflows that follow compatible updates can use \`moh3n9595/reviewer-suggestion@v${major}\`; the moving major tag advances only after npm provenance and GitHub Release synchronization pass.
`);

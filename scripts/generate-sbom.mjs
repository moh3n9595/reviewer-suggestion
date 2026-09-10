import { readFileSync, writeFileSync } from 'node:fs';

const version = process.argv[2];
const out = process.argv[3];

if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(version ?? '')) {
  throw new Error('A valid semantic version is required.');
}

const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
if (Object.keys(pkg.dependencies ?? {}).length > 0) {
  throw new Error(
    'The SBOM generator assumes zero runtime dependencies; extend it before adding any.',
  );
}

const packageId = 'SPDXRef-Package-reviewer-suggestion';
const document = {
  spdxVersion: 'SPDX-2.3',
  dataLicense: 'CC0-1.0',
  SPDXID: 'SPDXRef-DOCUMENT',
  name: `${pkg.name}-${version}`,
  documentNamespace: `https://github.com/moh3n9595/reviewer-suggestion/releases/download/v${version}/sbom.spdx.json`,
  creationInfo: {
    created: new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'),
    creators: ['Tool: reviewer-suggestion-release-scripts'],
  },
  packages: [
    {
      SPDXID: packageId,
      name: pkg.name,
      versionInfo: version,
      supplier: `Person: ${pkg.author}`,
      downloadLocation: `https://registry.npmjs.org/${pkg.name}/-/${pkg.name}-${version}.tgz`,
      filesAnalyzed: false,
      licenseConcluded: pkg.license,
      licenseDeclared: pkg.license,
      copyrightText: `Copyright ${pkg.author}`,
      externalRefs: [
        {
          referenceCategory: 'PACKAGE-MANAGER',
          referenceType: 'purl',
          referenceLocator: `pkg:npm/${pkg.name}@${version}`,
        },
      ],
    },
  ],
  relationships: [
    {
      spdxElementId: 'SPDXRef-DOCUMENT',
      relatedSpdxElement: packageId,
      relationshipType: 'DESCRIBES',
    },
  ],
};

const serialized = `${JSON.stringify(document, null, 2)}\n`;
if (out) {
  writeFileSync(out, serialized);
  process.stderr.write(`Wrote ${out} for ${pkg.name}@${version}.\n`);
} else process.stdout.write(serialized);

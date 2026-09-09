import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import prettier from 'prettier';
const navigationFile = 'docs/api/navigation.json';
const groups = JSON.parse(readFileSync(navigationFile, 'utf8'));
rmSync(navigationFile);
const list = (entries) =>
  entries.map(([title, path]) => `- [${title}](${path})`).join('\n');
const summary = [
  '# Table of contents',
  list([
    ['Introduction', 'README.md'],
    ['API overview', 'api/README.md'],
  ]),
  ...groups.map((group) =>
    [
      `## ${group.title}`,
      list(
        (group.children ?? []).map((page) => [page.title, `api/${page.path}`]),
      ),
    ].join('\n\n'),
  ),
].join('\n\n');
writeFileSync(
  'docs/SUMMARY.md',
  await prettier.format(summary, { filepath: 'docs/SUMMARY.md' }),
);
const pages = groups.reduce(
  (total, group) => total + (group.children?.length ?? 0),
  0,
);
console.log(
  `Wrote docs/SUMMARY.md: ${pages} API pages in ${groups.length} groups.`,
);

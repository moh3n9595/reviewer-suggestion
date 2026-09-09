import { describe, expect, it } from 'vitest';
import { parseCodeOwners, resolveCodeOwners } from '../src/index.js';
const resolve = (
  path: string,
  content: string,
  platform: 'github' | 'gitlab' = 'github',
): string[] => resolveCodeOwners(path, parseCodeOwners(content, platform));
describe('CODEOWNERS', () => {
  it('uses last matching rule and ownerless clearing', () => {
    expect(
      resolve('src/a.ts', '* @default\nsrc/ @team\nsrc/*.ts @alice @bob'),
    ).toEqual(['alice', 'bob']);
    expect(resolve('src/a.ts', '* @default\nsrc/')).toEqual([]);
    expect(resolve('a', '')).toEqual([]);
  });
  it.each([
    ['*.ts', 'deep/a.ts', true],
    ['*.ts', 'a.js', false],
    ['/a.ts', 'deep/a.ts', false],
    ['/a.ts', 'a.ts', true],
    ['**/a.ts', 'a.ts', true],
    ['**/a.ts', 'x/y/a.ts', true],
    ['src/**/a.ts', 'src/a.ts', true],
    ['src/*.ts', 'src/x/a.ts', false],
    ['src/**', 'src/x/a.ts', true],
    ['docs/', 'x/docs/a.md', true],
    ['/docs/', 'x/docs/a.md', false],
    ['a?.ts', 'ab.ts', true],
    ['file.json', 'fileXjson', false],
    ['x+y', 'x+y', true],
    ['a*', 'a', true],
  ])('matches %s against %s', (pattern, path, matches) => {
    expect(resolve(path, `${pattern} @alice`)).toEqual(
      matches ? ['alice'] : [],
    );
  });
  it('skips comments, GitHub unsupported patterns, and normalizes references', () => {
    expect(
      resolve(
        'a.ts',
        '\n# comment\r\n*.ts @Alice # trailing\n!a.ts @bad\n[a] @bad\n\\a @bad',
      ),
    ).toEqual(['alice']);
  });
  it('combines GitLab sections, section defaults, and duplicate sections', () => {
    const text =
      '* @global\n[Docs][2] @docs\ndocs/\n^[Tests] @test\ndocs/\n[DOCS]\ndocs/a @special';
    expect(resolve('docs/a', text, 'gitlab')).toEqual([
      'global',
      'special',
      'test',
    ]);
    expect(resolve('docs/b', text, 'gitlab')).toEqual([
      'docs',
      'global',
      'test',
    ]);
  });
  it('keeps exclusions section-local and irreversible', () => {
    const text =
      '* @global\n!pom.xml\n[Code] @dev\n*\n!generated/**\ngenerated/** @no\n[Docs]\ngenerated/** @docs';
    expect(resolve('pom.xml', text, 'gitlab')).toEqual(['dev']);
    expect(resolve('generated/a', text, 'gitlab')).toEqual(['docs', 'global']);
  });
  it('preserves role owners, emails and nested groups', () => {
    expect(
      resolve('a', '* @@developer @org/team a@example.com', 'gitlab'),
    ).toEqual(['@@developer', 'a@example.com', 'org/team']);
  });
});

it('follows GitLab inline-comment semantics without treating prose as owners', () => {
  expect(resolve('a', '* @alice # prose @bob', 'gitlab')).toEqual([
    'alice',
    'bob',
  ]);
  expect(resolve('a', '* @alice # prose @bob', 'github')).toEqual(['alice']);
});

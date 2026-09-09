import { string } from './http.js';
import type { Platform } from './types.js';

/** Parsed rule with section-specific exclusion and precedence semantics. */
export interface OwnerRule {
  pattern: string;
  owners: string[];
  section: string;
  exclude: boolean;
}

/**
 * Parse CODEOWNERS using provider-specific sections and exclusions.
 * @param content UTF-8 CODEOWNERS text.
 * @param platform GitHub or GitLab syntax.
 * @returns Rules in source order; invalid GitHub negations/classes are skipped.
 */
export function parseCodeOwners(
  content: string,
  platform: Platform,
): OwnerRule[] {
  const rules: OwnerRule[] = [];
  let section = '';
  let defaults: string[] = [];
  for (const raw of content.split(/\r?\n/)) {
    const line = (
      platform === 'github' ? raw.replace(/\s+#.*$/, '') : raw
    ).trim();
    if (!line || line.startsWith('#')) continue;
    const heading = /^\^?\[([^\]]+)\](?:\[\d+\])?(?:\s+(.*))?$/.exec(line);
    if (platform === 'gitlab' && heading) {
      section = string(heading[1]).toLowerCase();
      defaults = (heading[2] ?? '').split(/\s+/).filter(Boolean);
      continue;
    }
    const [pattern, ...owners] = line.split(/\s+/);
    if (!pattern || (platform === 'github' && /[![\]\\]/.test(pattern)))
      continue;
    rules.push({
      pattern: pattern.replace(/^!/, ''),
      owners: (owners.length ? owners : defaults)
        .filter((owner) => owner.includes('@'))
        .map((owner) => owner.replace(/^@(?!@)/, '').toLowerCase()),
      section,
      exclude: platform === 'gitlab' && pattern.startsWith('!'),
    });
  }
  return rules;
}

function matches(pattern: string, path: string): boolean {
  const anchored = pattern.startsWith('/');
  let value = pattern.replace(/^\//, '');
  const directory = value.endsWith('/');
  if (directory) value = value.slice(0, -1);
  let source = '';
  for (let i = 0; i < value.length; i++) {
    const char = value.charAt(i);
    if (char === '*' && value[i + 1] === '*') {
      if (value[i + 2] === '/') {
        source += '(?:.*/)?';
        i += 2;
      } else {
        source += '.*';
        i++;
      }
    } else if (char === '*') source += '[^/]*';
    else if (char === '?') source += '[^/]';
    else source += char.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
  const prefix = anchored || value.includes('/') ? '^' : '(?:^|/)';
  return new RegExp(
    `${prefix}${source}${directory ? '/.*' : '(?:/.*)?'}$`,
  ).test(path);
}

/**
 * Resolve ownership, using the last matching rule within each section.
 * GitLab exclusions permanently exclude matching paths within that section.
 * @param path Repository-relative, case-sensitive file path.
 * @param rules Parsed CODEOWNERS rules.
 * @returns Deduplicated owner references; groups are resolved by the provider.
 */
export function resolveCodeOwners(path: string, rules: OwnerRule[]): string[] {
  const sections = new Map<string, string[]>();
  const excluded = new Set<string>();
  for (const rule of rules) {
    if (!matches(rule.pattern, path)) continue;
    if (rule.exclude) {
      excluded.add(rule.section);
      sections.delete(rule.section);
    } else if (!excluded.has(rule.section))
      sections.set(rule.section, rule.owners);
  }
  return [...new Set([...sections.values()].flat())].sort();
}

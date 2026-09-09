import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { DEFAULT_WEIGHTS, rankReviewers } from '../src/index.js';
import { resolveOptions } from '../src/ranking.js';
import type { RankingOptions } from '../src/types.js';
import { context, member, snapshot } from './fixtures.js';
const now = '2026-01-01';
describe('ranking', () => {
  it('uses the exact five-signal formula', () => {
    const result = rankReviewers(snapshot(), { now });
    expect(result.selected[0]!.score).toBeCloseTo(
      (Math.log1p(1) / Math.log1p(30)) * 0.45 + 0.25 + 0.15 + 0.06 + 0.05,
    );
    expect(result.selected[0]!.breakdown).toMatchObject({
      ownership: 1,
      recency: 1,
      access: 0.6,
      availability: 1,
    });
    expect(Object.values(DEFAULT_WEIGHTS).reduce((a, b) => a + b)).toBe(1);
    expect(result.partial).toBe(false);
    expect(resolveOptions({}).now).toBeTruthy();
    expect(rankReviewers(snapshot()).selected).toHaveLength(1);
  });
  it('aggregates aliases, ignores conflicting emails and never guesses names', () => {
    const input = snapshot({
      members: [
        member('alice', { emails: ['shared', 'a'] }),
        member('bob', { emails: ['shared'] }),
      ],
    });
    input.files[0]!.contributions = [
      { sha: '1', email: 'shared', date: now },
      { sha: '2', email: 'A', date: now },
      { sha: '3', email: 'other', date: now },
      { sha: '4', date: now },
      { sha: '2', email: 'a', date: now },
    ];
    expect(rankReviewers(input, { now }).selected).toHaveLength(1);
    expect(
      rankReviewers(input, { now, aliases: { OTHER: 'ALICE' } }).selected[0]!
        .breakdown.expertise,
    ).toBeCloseTo(Math.log1p(2) / Math.log1p(30));
    expect(
      rankReviewers(input, { now, aliases: { shared: 'bob' } }).selected,
    ).toHaveLength(2);
  });
  it('filters author, existing reviewers, bots, inactive, readers, and explicit exclusions', () => {
    const input = snapshot({
      members: [
        member('author'),
        member('existing'),
        member('bot', { bot: true }),
        member('inactive', { active: false }),
        member('reader', { access: 0.3 }),
        member('alice'),
      ],
      context: context({ existingReviewers: [member('existing')] }),
    });
    expect(
      rankReviewers(input, { exclude: ['ALICE'], fallback: true }).selected,
    ).toEqual([]);
  });
  it('requires evidence and handles thresholds, empty files, and zero limit', () => {
    const input = snapshot({ members: [member(), member('unrelated')] });
    expect(
      rankReviewers(input, { now }).selected.map((r) => r.username),
    ).toEqual(['alice']);
    const result = rankReviewers(input, { now, minScore: 1 });
    expect(result.selected).toEqual([]);
    expect(result.belowThreshold).toHaveLength(1);
    expect(rankReviewers(input, { now, limit: 0 }).selected).toEqual([]);
    expect(
      rankReviewers(snapshot({ files: [] }), { fallback: true }).selected,
    ).toEqual([]);
  });
  it('labels ordered fallback tiers only when explicitly enabled', () => {
    const input = snapshot({
      members: [
        member('writer'),
        member('maintainer', { access: 0.9 }),
        member(),
      ],
      files: [
        { path: 'a', owners: ['alice'], contributions: [], historySource: 'a' },
      ],
    });
    const result = rankReviewers(input, {
      minScore: 1,
      fallback: true,
      limit: 3,
    });
    expect(result.selected.map((r) => r.reason)).toEqual([
      'owner-fallback',
      'maintainer-fallback',
      'member-fallback',
    ]);
    expect(rankReviewers(input, { minScore: 1 }).selected).toEqual([]);
  });
  it('handles invalid, stale, boundary and future dates, and missing/invalid load', () => {
    for (const date of [
      'invalid',
      '2020-01-01',
      '2027-01-01',
      '2025-07-05',
      '2025-12-02',
    ]) {
      const input = snapshot();
      input.files[0]!.contributions[0]!.date = date;
      const score = rankReviewers(input, { now }).selected[0]!.breakdown
        .recency;
      expect(score).toBe(
        date === '2027-01-01'
          ? 1
          : date === '2025-12-02'
            ? 0.5
            : date === '2025-07-05'
              ? 2 ** (-180 / 30)
              : 0,
      );
    }
    for (const load of [undefined, NaN, -1, 20]) {
      const input = snapshot({
        loads: load === undefined ? {} : { alice: load },
      });
      expect(
        rankReviewers(input, { now }).selected[0]!.breakdown.availability,
      ).toBe(0);
    }
    expect(
      rankReviewers(
        snapshot({ members: [member('alice', { access: Infinity })] }),
        { now },
      ).selected[0]!.breakdown.access,
    ).toBe(0);
  });
  it('deduplicates files/commits and caps historical contribution counts', () => {
    const input = snapshot();
    input.files.push(input.files[0]!);
    input.members.push(input.members[0]!);
    expect(rankReviewers(input, { now })).toEqual(
      rankReviewers(snapshot(), { now }),
    );
    expect(
      rankReviewers(input, { now, historyLimit: 1 }).selected[0]!.breakdown
        .expertise,
    ).toBe(1);
  });
  it('is invariant to candidate and evidence order', () => {
    fc.assert(
      fc.property(
        fc.uniqueArray(fc.stringMatching(/^[a-z]{1,8}$/), {
          minLength: 1,
          maxLength: 30,
        }),
        (names) => {
          const input = snapshot({
            members: names.map((name) => member(name)),
            files: [
              {
                path: 'a',
                owners: names,
                contributions: [],
                historySource: 'a',
              },
            ],
          });
          const expected = rankReviewers(input, { now, limit: 50 });
          expect(
            rankReviewers(
              { ...input, members: [...input.members].reverse() },
              { now, limit: 50 },
            ),
          ).toEqual(expected);
          expect(
            expected.selected.every((c) => c.score >= 0 && c.score <= 1),
          ).toBe(true);
        },
      ),
    );
  });
  it.each([
    { limit: -1 },
    { limit: 1.2 },
    { historyLimit: 0 },
    { maxReviewLoad: 0 },
    { minScore: -1 },
    { minScore: 2 },
    { halfLifeDays: 0 },
    { horizonDays: NaN },
    { now: 'bad' },
    { weights: { expertise: 2 } },
    { weights: { expertise: -1 } },
  ] satisfies RankingOptions[])('rejects invalid policy %j', (options) => {
    expect(() => rankReviewers(snapshot(), options)).toThrow();
  });
  it('surfaces warnings and caps below-threshold diagnostics', () => {
    const names = ['a', 'b', 'c', 'd'];
    const result = rankReviewers(
      snapshot({
        members: names.map((n) => member(n)),
        files: [
          { path: 'a', owners: names, contributions: [], historySource: 'a' },
        ],
        warnings: [{ code: 'TEST', message: 'partial' }],
      }),
      { minScore: 1 },
    );
    expect(result.belowThreshold).toHaveLength(3);
    expect(result.partial).toBe(true);
  });
});

it('orders equal normalized usernames by ID, and equal fallback scores by name', () => {
  const same = snapshot({
    members: [member('alice', { id: '2' }), member('Alice', { id: '1' })],
  });
  expect(rankReviewers(same, { now }).selected.map((r) => r.id)).toEqual([
    '1',
    '2',
  ]);
  const input = snapshot({
    members: [member('zoe'), member('amy'), member('bob', { access: 0.9 })],
    files: [{ path: 'a', historySource: 'a', contributions: [], owners: [] }],
  });
  expect(
    rankReviewers(input, { now, fallback: true, limit: 3 }).selected.map(
      (r) => r.username,
    ),
  ).toEqual(['bob', 'amy', 'zoe']);
});

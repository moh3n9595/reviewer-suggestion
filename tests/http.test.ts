import { afterEach, describe, expect, it, vi } from 'vitest';
import { array, HttpClient, id, number, object, string } from '../src/http.js';
import { fetchMock, json } from './fixtures.js';
import type { ProviderOptions } from '../src/types.js';
const client = (
  fetcher: typeof fetch,
  options: Partial<ProviderOptions> = {},
) =>
  new HttpClient(
    'https://example.com/api',
    { token: 'token', fetch: fetcher, ...options },
    { Authorization: 'Bearer token' },
  );
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
describe('HTTP boundary', () => {
  it('validates response primitives', () => {
    expect(object({ a: 1 })).toEqual({ a: 1 });
    expect(array([])).toEqual([]);
    expect(string('a')).toBe('a');
    expect(id(2)).toBe('2');
    expect(id('3')).toBe('3');
    expect(number(4)).toBe(4);
    for (const value of [null, [], 'x']) expect(() => object(value)).toThrow();
    expect(() => array({})).toThrow();
    expect(() => string(1)).toThrow();
    expect(() => number(NaN)).toThrow();
    expect(() => number('2')).toThrow();
    for (const value of [undefined, {}, 1.2]) expect(() => id(value)).toThrow();
  });
  it.each([
    'oops',
    'http://host',
    'https://user:pass@host',
    'https://host/?a=1',
    'https://host/#a',
  ])('rejects unsafe URL %s', (url) => {
    expect(() => new HttpClient(url, { token: 'x' }, {})).toThrow();
  });
  it('validates policy and uses native fetch by default', async () => {
    expect(() => new HttpClient('https://host/', { token: ' ' }, {})).toThrow();
    for (const options of [
      { concurrency: 0 },
      { retries: -1 },
      { timeoutMs: 0 },
      { maxPages: 0 },
    ])
      expect(() =>
        client(
          fetchMock(() => json([])),
          options,
        ),
      ).toThrow();
    const fetcher = fetchMock(() => json({}));
    vi.stubGlobal('fetch', fetcher);
    await new HttpClient('https://host/', { token: 'x' }, {}).request('a');
    expect(fetcher).toHaveBeenCalled();
  });
  it('scopes URL paths, encodes queries, and sends optional JSON bodies', async () => {
    const fetcher = fetchMock((url, init) => {
      expect(url.searchParams.get('path')).toBe('a b');
      expect(init?.body).toBe('{"a":1}');
      expect(init?.redirect).toBe('error');
      return json({}, 200);
    });
    const http = client(fetcher);
    await http.request('path', { path: 'a b' }, 'POST', { a: 1 });
    await expect(http.request('https://other/path')).rejects.toThrow();
    await expect(http.request('../escape')).rejects.toThrow();
  });
  it('handles 204, optional 404, malformed JSON and HTTP errors safely', async () => {
    expect(
      await client(fetchMock(() => json(null, 204))).request('x'),
    ).toMatchObject({ data: null });
    expect(
      await client(fetchMock(() => json({}, 404))).request(
        'x',
        {},
        'GET',
        undefined,
        true,
      ),
    ).toBeNull();
    await expect(
      client(fetchMock(() => new Response('{broken'))).request('x'),
    ).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
    await expect(
      client(fetchMock(() => json({ secret: 'hidden' }, 403))).request('x'),
    ).rejects.toMatchObject({ code: 'HTTP_403' });
  });
  it('bounds retryable failures and does not retry writes', async () => {
    vi.useFakeTimers();
    for (const headers of [
      { 'retry-after': '0' },
      { 'retry-after': 'invalid' },
      { 'retry-after': new Date().toUTCString() },
      { 'x-ratelimit-reset': '0' },
      {},
    ]) {
      const fetcher = vi
        .fn<typeof fetch>()
        .mockResolvedValueOnce(json({}, 429, headers))
        .mockResolvedValueOnce(json({ ok: true }));
      const promise = client(fetcher).request('x');
      await vi.runAllTimersAsync();
      expect((await promise).data).toEqual({ ok: true });
    }
    const fetcher = fetchMock(() => json({}, 500));
    const promise = client(fetcher, { retries: 1 }).request('x');
    const assertion = expect(promise).rejects.toMatchObject({
      code: 'HTTP_500',
    });
    await vi.runAllTimersAsync();
    await assertion;
    expect(fetcher).toHaveBeenCalledTimes(2);
    await expect(
      client(fetcher).request('x', {}, 'POST'),
    ).rejects.toMatchObject({ code: 'HTTP_500' });
    await expect(
      client(fetchMock(() => json({}, 429, { 'retry-after': '60' }))).request(
        'x',
      ),
    ).rejects.toMatchObject({ code: 'RATE_LIMIT' });
    await expect(
      client(
        fetchMock(() => json({}, 403, { 'x-ratelimit-remaining': '0' })),
        { retries: 0 },
      ).request('x'),
    ).rejects.toMatchObject({ code: 'RATE_LIMIT' });
    await expect(
      client(
        fetchMock(() => json({}, 403, { 'retry-after': '0' })),
        { retries: 0 },
      ).request('x'),
    ).rejects.toMatchObject({ code: 'RATE_LIMIT' });
  });
  it('reports network failures and cancellation without response details', async () => {
    await expect(
      client(vi.fn().mockRejectedValue(new Error('token'))).request('x'),
    ).rejects.toMatchObject({ code: 'NETWORK_ERROR' });
    const controller = new AbortController();
    const http = client(
      fetchMock(() => {
        controller.abort();
        throw new Error('secret');
      }),
      { signal: controller.signal },
    );
    await expect(http.request('x')).rejects.toMatchObject({
      code: 'CANCELLED',
    });
    await expect(http.request('x')).rejects.toThrow();
  });
  it('limits concurrent requests', async () => {
    let active = 0;
    let max = 0;
    const http = client(
      fetchMock(async () => {
        active++;
        max = Math.max(max, active);
        await Promise.resolve();
        active--;
        return json([]);
      }),
      { concurrency: 1 },
    );
    await Promise.all([
      http.request('a'),
      http.request('b'),
      http.request('c'),
    ]);
    expect(max).toBe(1);
  });
  it('paginates using GitHub links, GitLab headers, and page sizes', async () => {
    const http = client(
      fetchMock((url) =>
        Number(url.searchParams.get('page')) === 1
          ? json([1], 200, { link: '<https://host/page2>; rel="next"' })
          : json([2], 200, { link: '<https://host/page1>; rel="prev"' }),
      ),
    );
    expect(await http.pages('x')).toEqual([1, 2]);
    expect(
      await client(fetchMock(() => json([1, 2, 3]))).pages('x', {}, 2),
    ).toEqual([1, 2]);
    expect(
      await client(fetchMock(() => json([], 200, { 'x-next-page': '' }))).pages(
        'x',
      ),
    ).toEqual([]);
    await expect(
      client(
        fetchMock(() => json([1], 200, { 'x-next-page': '2' })),
        { maxPages: 1 },
      ).pages('x'),
    ).rejects.toMatchObject({ code: 'TRUNCATED' });
    expect(await client(fetchMock(() => json([]))).pages('x')).toEqual([]);
  });
});

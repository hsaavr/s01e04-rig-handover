import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import type { DigestRow } from '../src/digest/types.js';

let runsDir: string;

function writeNight(night: string, lines: string[]) {
  writeFileSync(join(runsDir, `${night}.jsonl`), lines.join('\n'));
}

function event(at: string, job: string, status: string, owner: string | null, error?: string) {
  return JSON.stringify({ at, job, status, owner, ...(error === undefined ? {} : { error }) });
}

function app() {
  return createApp({ adapter: 'shim', installed: '2026-10-29T14:06:00+01:00', beatEverySeconds: 60, runsDir });
}

function tableRows(html: string): string[][] {
  const body = /<tbody\b[^>]*>(.*?)<\/tbody>/s.exec(html)?.[1] ?? '';
  return [...body.matchAll(/<tr\b[^>]*>(.*?)<\/tr>/gs)].map(([, row]) =>
    [...row.matchAll(/<(?:th|td)\b[^>]*>(.*?)<\/(?:th|td)>/gs)].map(([, cell]) =>
      cell.replace(/<[^>]*>/g, '').replace(/&mdash;/g, '—').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'"),
    ),
  );
}

beforeEach(() => {
  runsDir = mkdtempSync(join(tmpdir(), 'rig-digest-routes-'));
});

afterEach(() => {
  rmSync(runsDir, { recursive: true, force: true });
});

describe('digest routes', () => {
  it('returns matching sorted jobs and values in HTML and JSON, including retry and failure warnings', async () => {
    const night = '2026-10-27';
    const first = '2026-10-27T23:58:00-07:00';
    const latest = '2026-10-28T01:03:00-07:00';
    const lines = [
      event(first, 'zeta', 'retry', null),
      event('2026-10-27T23:59:00-07:00', 'amber', 'fail', 'owner <ops>', 'bad <state> & "quoted"'),
      event('2026-10-27T23:59:30-07:00', 'zeta', 'retry', 'worker'),
      event('2026-10-27T23:59:45-07:00', 'zeta', 'retry', 'worker'),
      event('2026-10-28T00:00:00-07:00', 'zeta', 'fail', 'worker', 'transient'),
      event(latest, 'zeta', 'ok', 'worker'),
      event('2026-10-28T10:04:00+02:00', 'amber', 'ok', null),
      event('not json', 'bad', 'ok', 'nobody'),
      '',
    ];
    writeNight(night, lines);

    const [apiResponse, pageResponse] = await Promise.all([
      app().request(`/api/digest/${night}`),
      app().request(`/digest/${night}`),
    ]);
    const data = await apiResponse.json() as {
      kind: string;
      rows: DigestRow[];
      malformedLines: number;
      counts: { ok: number; retry: number; fail: number };
    };
    const html = await pageResponse.text();

    expect(apiResponse.status).toBe(200);
    expect(pageResponse.status).toBe(200);
    expect(data.kind).toBe('found');
    expect(data.malformedLines).toBe(1);
    expect(data.counts).toEqual({ ok: 2, retry: 3, fail: 2 });
    expect(data.rows.map(({ job }) => job)).toEqual(['amber', 'zeta']);
    expect(data.rows).toEqual([
      {
        job: 'amber', owner: null, runs: 2, retries: 0, lastStatus: 'ok',
        lastError: 'bad <state> & "quoted"', hasFailure: true,
        firstAt: '2026-10-27T23:59:00-07:00', lastAt: '2026-10-28T10:04:00+02:00',
      },
      {
        job: 'zeta', owner: 'worker', runs: 5, retries: 3, lastStatus: 'ok',
        lastError: 'transient', hasFailure: true, firstAt: first, lastAt: latest,
      },
    ]);

    const rows = tableRows(html);
    expect(rows).toEqual([
      ['amber', '—', '2', '0', 'ok', 'bad <state> & "quoted"', '2026-10-27T23:59:00-07:00', '2026-10-28T10:04:00+02:00', 'failed at least once'],
      ['zeta', 'worker', '5', '3', 'ok', 'transient', first, latest, '3 retries; failed at least once'],
    ]);
    expect(html).toContain('2026-10-27T23:59:00-07:00');
    expect(html).toContain('2026-10-28T10:04:00+02:00');
    expect(html).toContain('2026-10-27T23:58:00-07:00');
    expect(html).toContain('2026-10-28T01:03:00-07:00');
    expect(html).toContain('bad &lt;state&gt; &amp; &quot;quoted&quot;');
    expect(html).not.toContain('<state>');
  });

  it('returns 404 for a missing night from both endpoints', async () => {
    const [apiResponse, pageResponse] = await Promise.all([
      app().request('/api/digest/2026-10-29'),
      app().request('/digest/2026-10-29'),
    ]);

    expect(apiResponse.status).toBe(404);
    expect(await apiResponse.json()).toEqual({ kind: 'missing' });
    expect(pageResponse.status).toBe(404);
  });

  it('renders an empty existing night as 200 and says nothing ran', async () => {
    const night = '2026-10-26';
    writeNight(night, []);

    const [apiResponse, pageResponse] = await Promise.all([
      app().request(`/api/digest/${night}`),
      app().request(`/digest/${night}`),
    ]);

    expect(apiResponse.status).toBe(200);
    expect(await apiResponse.json()).toEqual({ kind: 'found', rows: [], malformedLines: 0, counts: { ok: 0, retry: 0, fail: 0 } });
    expect(pageResponse.status).toBe(200);
    expect(await pageResponse.text()).toContain('nothing ran');
  });

  it('counts a malformed-only night and still returns 200 from both endpoints', async () => {
    const night = '2026-10-25';
    writeNight(night, ['{broken json']);

    const [apiResponse, pageResponse] = await Promise.all([
      app().request(`/api/digest/${night}`),
      app().request(`/digest/${night}`),
    ]);

    expect(apiResponse.status).toBe(200);
    expect(await apiResponse.json()).toEqual({ kind: 'found', rows: [], malformedLines: 1, counts: { ok: 0, retry: 0, fail: 0 } });
    expect(pageResponse.status).toBe(200);
    expect(await pageResponse.text()).toContain('1');
  });
});

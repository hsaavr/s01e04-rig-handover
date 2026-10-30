import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { readNight } from '../src/digest/read.js'

const directories: string[] = []
const night = '2026-10-28'

function temporaryDir(): string {
  const directory = mkdtempSync(join(tmpdir(), 'rig-digest-reader-'))
  directories.push(directory)
  return directory
}

function readLines(lines: unknown[]) {
  const directory = temporaryDir()
  writeFileSync(join(directory, `${night}.jsonl`), lines.map(line => JSON.stringify(line)).join('\n'))
  return readNight(directory, night)
}

function event(overrides: Record<string, unknown> = {}) {
  return { at: '2026-10-28T23:00:00+01:00', job: 'job', status: 'ok', owner: 'rook', ...overrides }
}

afterEach(() => {
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true })
})

describe('readNight', () => {
  it('reads the real night with five sorted jobs, raw event counts, and one bad line', () => {
    const result = readNight('runs', night)
    expect(result.kind).toBe('found')
    if (result.kind !== 'found') throw new Error('Fixture is missing')
    expect(result.malformedLines).toBe(1)
    expect(result.counts).toEqual({ ok: 10, retry: 4, fail: 1 })
    expect(result.rows.map(({ job, runs, retries }) => ({ job, runs, retries }))).toEqual([
      { job: 'digest/render', runs: 1, retries: 0 },
      { job: 'fixtures/refresh', runs: 4, retries: 3 },
      { job: 'lane/sync', runs: 8, retries: 1 },
      { job: 'notes/backup', runs: 1, retries: 0 },
      { job: 'rig/rotate-logs', runs: 1, retries: 0 },
    ])
    expect(result.rows[0].owner).toBeNull()
    expect(result.rows[3]).toMatchObject({ lastStatus: 'fail', lastError: 'quota exceeded', hasFailure: true })
    expect(result.rows[2]).toMatchObject({ firstAt: '2026-10-28T23:00:06+01:00', lastAt: '2026-10-29T05:00:04+01:00' })
  })

  it('distinguishes missing files from empty and whitespace-only files', () => {
    const directory = temporaryDir()
    expect(readNight(directory, night)).toEqual({ kind: 'missing' })
    for (const content of ['', '\n  \r\n\t\n']) {
      writeFileSync(join(directory, `${night}.jsonl`), content)
      expect(readNight(directory, night)).toEqual({
        kind: 'found', rows: [], malformedLines: 0, counts: { ok: 0, retry: 0, fail: 0 },
      })
    }
  })

  it('rejects invalid calendar nights and traversal before touching the filesystem', () => {
    const directory = temporaryDir()
    const nonDirectory = join(directory, 'not-a-directory')
    writeFileSync(nonDirectory, '')
    for (const invalid of ['../2026-10-28', '/2026-10-28', '2026-10-28/..', '2026-02-29', '1900-02-29', '2026-04-31', '2026-00-01', '2026-01-00', '2026-13-01', '2026-1-01', '2026-10-28\n', '']) {
      expect(readNight(nonDirectory, invalid)).toEqual({ kind: 'missing' })
    }
    for (const valid of ['2024-02-29', '2000-02-29']) {
      writeFileSync(join(directory, `${valid}.jsonl`), '')
      expect(readNight(directory, valid).kind).toBe('found')
    }
  })

  it('propagates other filesystem errors', () => {
    const directory = temporaryDir()
    mkdirSync(join(directory, `${night}.jsonl`))
    expect(() => readNight(directory, night)).toThrow()
  })

  it('counts corrupted lines and continues through CRLF and blank lines', () => {
    const directory = temporaryDir()
    writeFileSync(join(directory, `${night}.jsonl`), `broken\r\n\r\n${JSON.stringify(event())}\r\n{"at":\r\n  \r\n`)
    const result = readNight(directory, night)
    expect(result).toMatchObject({ kind: 'found', malformedLines: 2, counts: { ok: 1, retry: 0, fail: 0 } })
    if (result.kind === 'found') expect(result.rows).toHaveLength(1)
  })

  it('counts every schema-invalid record once and excludes it from rows and counts', () => {
    const invalid = [
      null, [], 'text', 5, {},
      event({ at: null }), event({ at: '2026-02-29T00:00:00Z' }),
      event({ at: '1900-02-29T00:00:00Z' }), event({ at: '2026-04-31T00:00:00Z' }),
      event({ at: '2026-10-28T24:00:00Z' }), event({ at: '2026-10-28T23:60:00Z' }),
      event({ at: '2026-10-28T23:59:60Z' }), event({ at: '2026-10-28T00:00:00+24:00' }),
      event({ at: '2026-10-28T00:00:00+01:60' }), event({ at: '2026-10-28T00:00:00' }),
      event({ at: '2026-10-28 00:00:00Z' }), event({ at: '2026-10-28T00:00Z' }),
      event({ at: '2026-10-28T00:00:00.Z' }), event({ at: '2026-10-28T00:00:00Z\n' }),
      event({ job: '' }), event({ job: ' \t' }), event({ job: 7 }),
      event({ owner: undefined }), event({ owner: 7 }), event({ status: 'done' }),
      event({ status: ['ok'] }), event({ status: { toString: null } }),
      event({ error: false }), event({ error: {} }),
    ]
    expect(readLines(invalid)).toEqual({
      kind: 'found', rows: [], malformedLines: invalid.length, counts: { ok: 0, retry: 0, fail: 0 },
    })
  })

  it('orders by UTC instant while retaining offsets, latest owner, and the latest failure after recovery', () => {
    const result = readLines([
      event({ at: '2026-10-29T02:00:00+02:00', status: 'ok', owner: null }),
      event({ at: '2026-10-28T22:30:00Z', status: 'fail', error: 'latest failure' }),
      event({ at: '2026-10-28T22:00:00+02:00', status: 'retry', error: 'retry detail' }),
      event({ at: '2026-10-28T17:00:00-04:00', status: 'fail', error: 'older failure' }),
    ])
    expect(result).toEqual({
      kind: 'found', malformedLines: 0, counts: { ok: 1, retry: 1, fail: 2 },
      rows: [{ job: 'job', owner: null, runs: 4, retries: 1, lastStatus: 'ok',
        lastError: 'latest failure', hasFailure: true,
        firstAt: '2026-10-28T22:00:00+02:00', lastAt: '2026-10-29T02:00:00+02:00' }],
    })
  })

  it('orders fractional seconds beyond milliseconds and resolves equal instants by later source line', () => {
    const result = readLines([
      event({ at: '2026-10-28T23:00:00.123456789+01:00', status: 'fail', error: 'precise' }),
      event({ at: '2026-10-28T22:00:00.123456788Z', status: 'ok' }),
      event({ at: '2026-10-28t22:00:00.1234567890z', status: 'retry', owner: '' }),
    ])
    expect(result).toMatchObject({ kind: 'found', rows: [{ runs: 3, retries: 1,
      firstAt: '2026-10-28T22:00:00.123456788Z', lastAt: '2026-10-28t22:00:00.1234567890z',
      owner: '', lastStatus: 'retry', lastError: 'precise', hasFailure: true }] })
  })

  it.each([undefined, null, ''])('replaces the previous failure error with the latest failure error %s', error => {
    const result = readLines([
      event({ status: 'fail', error: 'first failure' }),
      event({ status: 'fail', error }),
      event({ status: 'ok', error: 'unrelated successful event' }),
    ])
    expect(result).toMatchObject({ kind: 'found', rows: [{ lastStatus: 'ok', hasFailure: true, lastError: error ?? null }] })
  })

  it('preserves job keys, ignores extra fields, and uses case-sensitive code-unit sorting', () => {
    const result = readLines(['a', 'Z', ' job ', '__proto__', 'job', 'ä'].map(job => event({ job, extra: { allowed: true } })))
    expect(result.kind).toBe('found')
    if (result.kind !== 'found') throw new Error('Temporary fixture is missing')
    expect(result.rows.map(row => row.job)).toEqual([' job ', 'Z', '__proto__', 'a', 'job', 'ä'])
    for (const row of result.rows) expect(row).toMatchObject({ runs: 1, retries: 0, lastError: null, hasFailure: false })
  })
})

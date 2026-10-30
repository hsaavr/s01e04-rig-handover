import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { DigestRow, DigestStatus, ReadNight } from './types.js'

interface Event {
  at: string
  job: string
  status: DigestStatus
  owner: string | null
  error: string | null
  second: number
  fraction: string
  line: number
}

function validDate(date: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date)
  if (!match) return false
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0)
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
  return month >= 1 && month <= 12 && day >= 1 && day <= days[month - 1]
}

function parseEvent(source: string, line: number): Event | null {
  let value: unknown
  try {
    value = JSON.parse(source)
  } catch {
    return null
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null
  if (!('at' in value) || typeof value.at !== 'string') return null
  if (!('job' in value) || typeof value.job !== 'string' || !value.job.trim()) return null
  if (!('status' in value)) return null
  const status = value.status
  if (status !== 'ok' && status !== 'retry' && status !== 'fail') return null
  if (!('owner' in value) || (value.owner !== null && typeof value.owner !== 'string')) return null
  if ('error' in value && value.error !== null && typeof value.error !== 'string') return null

  const time = /^(\d{4}-\d{2}-\d{2})[Tt](\d{2}):(\d{2}):(\d{2})(?:\.(\d+))?([Zz]|[+-]\d{2}:\d{2})$/.exec(value.at)
  if (!time || !validDate(time[1])) return null
  if (Number(time[2]) > 23 || Number(time[3]) > 59 || Number(time[4]) > 59) return null
  const offset = time[6].toUpperCase()
  if (offset !== 'Z' && (Number(offset.slice(1, 3)) > 23 || Number(offset.slice(4)) > 59)) return null
  const second = Date.parse(`${time[1]}T${time[2]}:${time[3]}:${time[4]}${offset}`)
  if (!Number.isFinite(second)) return null

  return {
    at: value.at,
    job: value.job,
    status,
    owner: value.owner,
    error: 'error' in value && typeof value.error === 'string' ? value.error : null,
    second,
    // Removing trailing zeroes makes equal decimal fractions compare equally.
    fraction: (time[5] ?? '').replace(/0+$/, ''),
    line,
  }
}

function compareText(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0
}

export const readNight: ReadNight = (runsDir, night) => {
  if (!validDate(night)) return { kind: 'missing' }
  let content: string
  try {
    content = readFileSync(join(runsDir, `${night}.jsonl`), 'utf8')
  } catch (error: unknown) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return { kind: 'missing' }
    throw error
  }

  let malformedLines = 0
  const events: Event[] = []
  for (const [line, source] of content.split('\n').entries()) {
    if (!source.trim()) continue
    const event = parseEvent(source, line)
    if (event) events.push(event)
    else malformedLines += 1
  }
  events.sort((a, b) => a.second - b.second || compareText(a.fraction, b.fraction) || a.line - b.line)

  const rows = new Map<string, DigestRow>()
  const counts = { ok: 0, retry: 0, fail: 0 }
  for (const event of events) {
    counts[event.status] += 1
    let row = rows.get(event.job)
    if (!row) {
      row = {
        job: event.job, owner: event.owner, runs: 0, retries: 0,
        lastStatus: event.status, lastError: null, hasFailure: false,
        firstAt: event.at, lastAt: event.at,
      }
      rows.set(event.job, row)
    }
    row.runs += 1
    if (event.status === 'retry') row.retries += 1
    if (event.status === 'fail') {
      row.hasFailure = true
      row.lastError = event.error
    }
    row.owner = event.owner
    row.lastStatus = event.status
    row.lastAt = event.at
  }
  return {
    kind: 'found',
    rows: [...rows.values()].sort((a, b) => compareText(a.job, b.job)),
    malformedLines,
    counts,
  }
}

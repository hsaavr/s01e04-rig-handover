/** Valid statuses in a run-log event. */
export type DigestStatus = 'ok' | 'retry' | 'fail'

/** Counts of valid events, not counts of jobs or their final statuses. */
export interface DigestEventCounts {
  ok: number
  retry: number
  fail: number
}

/** One job's events, ordered by instant; later source lines break timestamp ties. */
export interface DigestRow {
  job: string
  /** Owner of the latest event, including an explicit null. */
  owner: string | null
  /** All valid events for this job, including retry and fail events. */
  runs: number
  /** Number of valid retry events for this job. */
  retries: number
  lastStatus: DigestStatus
  /** Error on the latest fail event, or null if absent; retained after recovery. */
  lastError: string | null
  /** True if any valid event failed, even if the final status is ok. */
  hasFailure: boolean
  /** Original timestamp strings, preserving each source offset and precision. */
  firstAt: string
  lastAt: string
}

export type ReadNightResult =
  | { kind: 'missing' }
  | {
      kind: 'found'
      /** Ascending, case-sensitive JavaScript string comparison by job. */
      rows: DigestRow[]
      /** Nonblank lines with invalid JSON or invalid event fields. */
      malformedLines: number
      counts: DigestEventCounts
    }

/**
 * Synchronous reader contract. Implement as `readNight` in `src/digest/read.ts`.
 *
 * Read `<runsDir>/<night>.jsonl`; night must be a real YYYY-MM-DD calendar date.
 * An invalid night or absent file returns { kind: 'missing' }. Other I/O errors
 * propagate. An existing empty file returns kind 'found', no rows, and zero
 * counts. A malformed-only file is also 'found', with malformedLines > 0.
 *
 * Ignore blank/whitespace-only lines. A valid event is a JSON object with:
 * - at: a real RFC 3339 date-time (four-digit year, seconds, optional fractional
 *   seconds, and explicit Z or +/-HH:MM offset; no leap seconds);
 * - job: a nonblank string, preserved exactly and used as the grouping key;
 * - status: one of DigestStatus;
 * - owner: a string or null (required; an empty string is allowed);
 * - error: an optional string or null.
 * Additional fields are ignored. Every other nonblank line adds exactly one to
 * malformedLines and contributes to neither rows nor event counts.
 *
 * Aggregate by job. runs counts every valid event; retries counts retry events.
 * counts totals each status across all valid events. Order events by their UTC
 * instant, using source line order for ties, without rewriting timestamps.
 * firstAt/lastAt come from the earliest/latest event; lastStatus and owner come
 * from the latest event. lastError comes from the latest fail event: missing or
 * null error becomes null, and an empty error string is preserved. With no fail
 * event lastError is null. hasFailure records any fail, including a later
 * recovered job, so the page can mark every job that failed during the night.
 * Sort returned rows by job using `<`/`>` string comparison, not locale order.
 */
export type ReadNight = (runsDir: string, night: string) => ReadNightResult

import type { DigestRow, ReadNightResult } from '../digest/types.js';

function display(value: string | null) {
  return value === null ? '—' : value;
}

function Warnings({ row }: { row: DigestRow }) {
  const warnings = [
    ...(row.retries >= 3 ? [`${row.retries} retries`] : []),
    ...(row.hasFailure ? ['failed at least once'] : []),
  ];

  return warnings.length === 0 ? (
    <span class="mute">—</span>
  ) : (
    <span class="warn">{warnings.join('; ')}</span>
  );
}

function JobRows({ rows }: { rows: DigestRow[] }) {
  return rows.map((row) => (
    <tr>
      <th scope="row">{row.job}</th>
      <td>{display(row.owner)}</td>
      <td>{row.runs}</td>
      <td>{row.retries}</td>
      <td>{row.lastStatus}</td>
      <td>{display(row.lastError)}</td>
      <td>{row.firstAt}</td>
      <td>{row.lastAt}</td>
      <td><Warnings row={row} /></td>
    </tr>
  ));
}

export function DigestPage({ night, result }: { night: string; result: Extract<ReadNightResult, { kind: 'found' }> }) {
  const { rows, malformedLines } = result;

  return (
    <>
      <h1>digest · {night}</h1>
      {malformedLines > 0 && (
        <p class="warn" role="status">
          {malformedLines} malformed {malformedLines === 1 ? 'line' : 'lines'}; the digest may be incomplete.
        </p>
      )}
      {rows.length === 0 ? (
        <p class="mute">nothing ran</p>
      ) : (
        <table>
          <caption class="mute">Jobs for {night}, sorted by job</caption>
          <thead>
            <tr>
              <th scope="col">job</th>
              <th scope="col">owner</th>
              <th scope="col">runs</th>
              <th scope="col">retries</th>
              <th scope="col">last status</th>
              <th scope="col">last error</th>
              <th scope="col">first time</th>
              <th scope="col">last time</th>
              <th scope="col">warnings</th>
            </tr>
          </thead>
          <tbody><JobRows rows={rows} /></tbody>
        </table>
      )}
    </>
  );
}

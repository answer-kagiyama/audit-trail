/**
 * Phase 1 の技術PoC画面。
 *
 * 目的は「ブラウザで SQLite WASM が動き、静的 .sqlite を読んで SELECT できる」
 * ことの実証だけ。見た目・レイアウト・デザイントークンは Phase 2（Issue #9）で作る。
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { WorkerSqlEngine, browserWorkerFactory } from './engine/workerEngine.ts';
import type { QueryResult, SqlEngine } from './engine/types.ts';
import { isSqlExecutionError } from './engine/types.ts';

const FIXTURE_URL = `${import.meta.env.BASE_URL}fixtures/demo.sqlite`;

/**
 * 意図せず書いてしまう事故クエリの再現。タイムアウトが働くことを手で確かめる用。
 *
 * 巨大な CROSS JOIN でもよいが、CASE DB は小さいので確実に長時間走る
 * 再帰CTEを使う。PRAGMA query_only では止まらない（読み取りだけなので）点も、
 * タイムアウトが唯一の防御線であることを示している。
 */
const RUNAWAY_SQL = `WITH RECURSIVE runaway(n) AS (
  SELECT 1
  UNION ALL
  SELECT n + 1 FROM runaway WHERE n < 1000000000
)
SELECT COUNT(*) FROM runaway`;

type Status = 'booting' | 'ready' | 'running' | 'failed';

export function App() {
  const engineRef = useRef<SqlEngine | null>(null);
  const [status, setStatus] = useState<Status>('booting');
  const [sql, setSql] = useState('SELECT id, name, department FROM employees ORDER BY id');
  const [result, setResult] = useState<QueryResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const engine = new WorkerSqlEngine(browserWorkerFactory);
    engineRef.current = engine;
    let cancelled = false;

    void (async () => {
      try {
        await engine.init();
        const response = await fetch(FIXTURE_URL);
        if (!response.ok) throw new Error(`fixture fetch failed: ${response.status}`);
        await engine.loadDatabase(await response.arrayBuffer());
        if (!cancelled) setStatus('ready');
      } catch (e) {
        if (cancelled) return;
        setStatus('failed');
        setError(e instanceof Error ? e.message : String(e));
      }
    })();

    return () => {
      cancelled = true;
      void engine.dispose();
    };
  }, []);

  const run = useCallback(async (query: string) => {
    const engine = engineRef.current;
    if (!engine) return;
    setStatus('running');
    setError(null);
    setResult(null);
    try {
      setResult(await engine.execute(query));
    } catch (e) {
      setError(isSqlExecutionError(e) ? `[${e.kind}] ${e.rawMessage}` : String(e));
    } finally {
      setStatus('ready');
    }
  }, []);

  return (
    <main style={{ fontFamily: 'monospace', padding: '1.5rem', maxWidth: 900 }}>
      <h1>Audit Trail — Phase 1 PoC</h1>
      <p>status: {status}</p>

      <textarea
        value={sql}
        onChange={(e) => setSql(e.target.value)}
        rows={6}
        spellCheck={false}
        style={{ width: '100%', fontFamily: 'inherit' }}
        aria-label="SQL"
      />

      <p>
        <button onClick={() => void run(sql)} disabled={status !== 'ready'}>
          実行
        </button>{' '}
        <button onClick={() => void run(RUNAWAY_SQL)} disabled={status !== 'ready'}>
          暴走クエリでタイムアウトを試す
        </button>
      </p>

      {error !== null && <pre style={{ color: 'crimson', whiteSpace: 'pre-wrap' }}>{error}</pre>}
      {result && (
        <>
          <p>
            {result.rowCount} 行 / {result.elapsedMs.toFixed(1)} ms
            {result.truncated ? '（表示は先頭のみ）' : ''}
          </p>
          <pre style={{ whiteSpace: 'pre-wrap' }}>
            {JSON.stringify({ columns: result.columns, rows: result.rows }, null, 2)}
          </pre>
        </>
      )}
    </main>
  );
}

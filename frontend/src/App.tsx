/**
 * Phase 2 のアプリ本体。
 *
 * ゲーム進行（Objective / 証拠 / 判定）はまだ無い。
 * ダミーCASEデータに対して自由にSQLを書き、結果とエラーを確認できる状態までを作る。
 * 進行と判定は Phase 4（Issue #22〜#28）で載せる。
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { WorkerSqlEngine, browserWorkerFactory } from './engine/workerEngine.ts';
import type { SqlEngine } from './engine/types.ts';
import { isSqlExecutionError } from './engine/types.ts';
import type { SchemaDoc } from './game/caseTypes.ts';
import { buildSchemaHints, toFriendlyError } from './game/errorMap.ts';
import type { SchemaHints } from './game/errorMap.ts';
import { AppShell } from './ui/AppShell/AppShell.tsx';
import { BootScreen } from './ui/BootScreen/BootScreen.tsx';
import { DatabasePanel } from './ui/DatabasePanel/DatabasePanel.tsx';
import { ResultPanel } from './ui/ResultTable/ResultTable.tsx';
import type { ResultState } from './ui/ResultTable/ResultTable.tsx';
import { SqlEditor } from './ui/SqlEditor/SqlEditor.tsx';
import { StoryPlaceholder } from './ui/StoryPanel/StoryPlaceholder.tsx';

const DB_URL = `${import.meta.env.BASE_URL}fixtures/demo.sqlite`;
const SCHEMA_URL = `${import.meta.env.BASE_URL}fixtures/demo-schema.json`;

interface Loaded {
  schema: SchemaDoc;
  hints: SchemaHints;
}

export function App() {
  const engineRef = useRef<SqlEngine | null>(null);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [bootError, setBootError] = useState<string | undefined>(undefined);
  const [result, setResult] = useState<ResultState>({ kind: 'idle' });
  const [history, setHistory] = useState<string[]>([]);

  useEffect(() => {
    const engine = new WorkerSqlEngine(browserWorkerFactory);
    engineRef.current = engine;
    let cancelled = false;

    void (async () => {
      try {
        const [schemaResponse, dbResponse] = await Promise.all([
          fetch(SCHEMA_URL),
          fetch(DB_URL),
          engine.init(),
        ]);
        if (!schemaResponse.ok) throw new Error(`schema: HTTP ${String(schemaResponse.status)}`);
        if (!dbResponse.ok) throw new Error(`database: HTTP ${String(dbResponse.status)}`);

        // Phase 4 の Issue #22 でスキーマ検証を入れるまでは信頼して読む。
        const schema = (await schemaResponse.json()) as SchemaDoc;
        await engine.loadDatabase(await dbResponse.arrayBuffer());

        if (!cancelled) setLoaded({ schema, hints: buildSchemaHints(schema.tables) });
      } catch (e) {
        if (!cancelled) setBootError(e instanceof Error ? e.message : String(e));
      }
    })();

    return () => {
      cancelled = true;
      void engine.dispose();
    };
  }, []);

  const run = useCallback(
    async (sql: string) => {
      const engine = engineRef.current;
      if (!engine || !loaded) return;

      setResult({ kind: 'running' });
      try {
        const queryResult = await engine.execute(sql);
        setResult({ kind: 'result', result: queryResult });
        // 成功したクエリだけを履歴に残す。連続した重複は積まない。
        setHistory((previous) =>
          previous[previous.length - 1] === sql ? previous : [...previous, sql],
        );
      } catch (e) {
        if (!isSqlExecutionError(e)) throw e;
        setResult({ kind: 'error', error: toFriendlyError(e, loaded.hints) });
      }
    },
    [loaded],
  );

  if (bootError !== undefined) return <BootScreen error={bootError} />;
  if (!loaded) return <BootScreen />;

  return (
    <AppShell
      story={<StoryPlaceholder />}
      database={<DatabasePanel schema={loaded.schema} />}
      editor={
        <SqlEditor
          history={history}
          disabled={result.kind === 'running'}
          onRun={(sql) => void run(sql)}
        />
      }
      result={<ResultPanel state={result} />}
    />
  );
}

/**
 * アプリ本体。CASE を読み込み、進行・判定・UI を繋ぐ。
 *
 * ゲームのルールはすべて game/ の純関数にある。ここがやるのは
 * 「エンジンを回して、返ってきた状態を描き、保存する」ことだけ。
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { WorkerSqlEngine, browserWorkerFactory } from './engine/workerEngine.ts';
import type { SqlEngine } from './engine/types.ts';
import { isSqlExecutionError } from './engine/types.ts';
import { loadCaseData } from './game/caseLoader.ts';
import type { CaseData } from './game/caseTypes.ts';
import { buildSchemaHints, toFriendlyError } from './game/errorMap.ts';
import type { SchemaHints } from './game/errorMap.ts';
import {
  applyQueryResult,
  initialProgress,
  revealHint,
  submitFinalAnswer,
} from './game/progression.ts';
import type { ProgressState } from './game/progression.ts';
import { clearProgress, loadProgress, saveProgress } from './game/save.ts';
import { AppShell } from './ui/AppShell/AppShell.tsx';
import { BootScreen } from './ui/BootScreen/BootScreen.tsx';
import { DatabasePanel } from './ui/DatabasePanel/DatabasePanel.tsx';
import { FinalAnswerDialog } from './ui/FinalAnswer/FinalAnswer.tsx';
import { ResultPanel } from './ui/ResultTable/ResultTable.tsx';
import type { ResultState } from './ui/ResultTable/ResultTable.tsx';
import { SqlEditor } from './ui/SqlEditor/SqlEditor.tsx';
import { StoryPanel } from './ui/StoryPanel/StoryPanel.tsx';

/** MVP は1CASEのみ。CASE選択画面は非範囲（docs/vision.md §5）。 */
const CASE_ID = 'case-001';

const DISCARD_NOTICE: Record<string, string> = {
  'case-updated':
    '事件データが更新されたため、進捗をリセットしました。お手数ですが最初から調査してください。',
  corrupt: '保存された進捗が読めなかったため、リセットしました。',
  'format-changed': 'セーブ形式が変わったため、進捗をリセットしました。',
};

interface Loaded {
  caseData: CaseData;
  hints: SchemaHints;
}

export function App() {
  const engineRef = useRef<SqlEngine | null>(null);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [bootError, setBootError] = useState<string | undefined>(undefined);
  const [progress, setProgress] = useState<ProgressState | null>(null);
  const [notice, setNotice] = useState<string | undefined>(undefined);
  const [result, setResult] = useState<ResultState>({ kind: 'idle' });
  const [history, setHistory] = useState<string[]>([]);
  const [justEarned, setJustEarned] = useState<readonly string[]>([]);
  const [finalOpen, setFinalOpen] = useState(false);

  useEffect(() => {
    const engine = new WorkerSqlEngine(browserWorkerFactory);
    engineRef.current = engine;
    let cancelled = false;

    void (async () => {
      try {
        const [caseData] = await Promise.all([
          loadCaseData({ baseUrl: import.meta.env.BASE_URL, caseId: CASE_ID }),
          engine.init(),
        ]);
        await engine.loadDatabase(caseData.database);
        if (cancelled) return;

        const restored = loadProgress(CASE_ID, caseData.metadata.version);
        if (restored.kind === 'discarded') setNotice(DISCARD_NOTICE[restored.reason]);
        setProgress(restored.kind === 'loaded' ? restored.progress : initialProgress(Date.now()));
        setLoaded({ caseData, hints: buildSchemaHints(caseData.schema.tables) });
      } catch (e) {
        if (!cancelled) setBootError(e instanceof Error ? e.message : String(e));
      }
    })();

    return () => {
      cancelled = true;
      void engine.dispose();
    };
  }, []);

  /** 進捗が変わるたびに保存する。書き込みに失敗してもゲームは止めない。 */
  const commit = useCallback(
    (next: ProgressState) => {
      setProgress(next);
      if (loaded) saveProgress(CASE_ID, loaded.caseData.metadata.version, next);
    },
    [loaded],
  );

  const run = useCallback(
    async (sql: string) => {
      const engine = engineRef.current;
      if (!engine || !loaded || !progress) return;

      setResult({ kind: 'running' });
      setJustEarned([]);
      try {
        const queryResult = await engine.execute(sql);
        setResult({ kind: 'result', result: queryResult });
        setHistory((previous) =>
          previous[previous.length - 1] === sql ? previous : [...previous, sql],
        );

        // 成功したクエリだけが進行に影響する。
        const outcome = applyQueryResult(loaded.caseData, progress, queryResult);
        commit(outcome.state);
        setJustEarned(outcome.newEvidence);
      } catch (e) {
        if (!isSqlExecutionError(e)) throw e;
        setResult({ kind: 'error', error: toFriendlyError(e, loaded.hints) });
      }
    },
    [loaded, progress, commit],
  );

  const onReset = useCallback(() => {
    if (!loaded) return;
    if (!window.confirm('進捗をすべて消して最初からやり直しますか？')) return;
    clearProgress(CASE_ID);
    setProgress(initialProgress(Date.now()));
    setHistory([]);
    setJustEarned([]);
    setNotice(undefined);
    setResult({ kind: 'idle' });
  }, [loaded]);

  const onSubmitFinalAnswer = useCallback(
    (answers: Record<string, string>): boolean => {
      if (!loaded || !progress) return false;
      const outcome = submitFinalAnswer(loaded.caseData, progress, answers, Date.now());
      commit(outcome.state);
      return outcome.correct;
    },
    [loaded, progress, commit],
  );

  if (bootError !== undefined) return <BootScreen error={bootError} />;
  if (!loaded || !progress) return <BootScreen />;

  return (
    <>
      <AppShell
        story={
          <StoryPanel
            caseData={loaded.caseData}
            progress={progress}
            justEarnedEvidence={justEarned}
            notice={notice}
            onRevealHint={(objectiveId) => {
              commit(revealHint(loaded.caseData, progress, objectiveId));
            }}
            onOpenFinalAnswer={() => setFinalOpen(true)}
            onReset={onReset}
          />
        }
        database={<DatabasePanel schema={loaded.caseData.schema} />}
        editor={
          <SqlEditor
            history={history}
            disabled={result.kind === 'running'}
            onRun={(sql) => void run(sql)}
          />
        }
        result={<ResultPanel state={result} />}
      />

      <FinalAnswerDialog
        caseData={loaded.caseData}
        progress={progress}
        open={finalOpen}
        onOpenChange={setFinalOpen}
        onSubmit={onSubmitFinalAnswer}
      />
    </>
  );
}

/**
 * CASE 1本のプレイ画面。
 *
 * 旧 App.tsx の中身をそのまま持ってきたもの。App は経路の振り分けに専念し、
 * ここが「CASEを読み込み、進行・判定・UI を繋ぐ」役を担う。
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { WorkerSqlEngine, browserWorkerFactory } from '../engine/workerEngine.ts';
import type { SqlEngine } from '../engine/types.ts';
import { isSqlExecutionError } from '../engine/types.ts';
import { CaseDataError, loadCaseData } from '../game/caseLoader.ts';
import type { CaseData } from '../game/caseTypes.ts';
import { findEvidence, findStoryBeat } from '../game/caseTypes.ts';
import { buildSchemaHints, toFriendlyError } from '../game/errorMap.ts';
import type { SchemaHints } from '../game/errorMap.ts';
import {
  activeObjectives,
  allObjectivesCompleted,
  applyQueryResult,
  initialProgress,
  revealAnswer,
  revealHint,
  submitFinalAnswer,
} from '../game/progression.ts';
import type { ProgressState } from '../game/progression.ts';
import { clearProgress, loadProgress, saveProgress } from '../game/save.ts';
import { AppShell } from './AppShell/AppShell.tsx';
import { BootScreen } from './BootScreen/BootScreen.tsx';
import { DatabasePanel } from './DatabasePanel/DatabasePanel.tsx';
import { FinalAnswerDialog } from './FinalAnswer/FinalAnswer.tsx';
import { ObjectiveCleared } from './ObjectiveCleared/ObjectiveCleared.tsx';
import type { ClearedAnnouncement } from './ObjectiveCleared/ObjectiveCleared.tsx';
import { ResultPanel } from './ResultTable/ResultTable.tsx';
import type { ResultState } from './ResultTable/ResultTable.tsx';
import { SqlEditor } from './SqlEditor/SqlEditor.tsx';
import { useWorkspace } from './SqlEditor/useWorkspace.ts';
import { useLayoutPreference } from './hooks/useLayoutPreference.ts';
import {
  activeTab,
  addTab,
  closeTab,
  pushHistory,
  renameTab,
  selectTab,
  setSql,
} from './SqlEditor/workspace.ts';
import { StoryPanel } from './StoryPanel/StoryPanel.tsx';
import type { ThemePreference } from './ThemeToggle/theme.ts';

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

/**
 * 起動失敗の切り分け。
 *
 * 「読み込めませんでした」だけでは、ネットワークの問題なのか、
 * CASEデータが壊れているのか、ブラウザが対応していないのかが分からない。
 * 直せる人が直せる形で出す（docs/mvp-issues.md #29）。
 */
function describeBootFailure(error: unknown): string {
  if (error instanceof CaseDataError) {
    return `事件データが不正です。\n\n場所: ${error.path}\n${error.message}`;
  }
  const message = error instanceof Error ? error.message : String(error);
  if (/WebAssembly|wasm/i.test(message)) {
    return `SQL実行エンジンを起動できませんでした。\nこのブラウザが WebAssembly に対応していない可能性があります。\n\n${message}`;
  }
  if (/HTTP|fetch|NetworkError|Failed to fetch/i.test(message)) {
    return `事件データを取得できませんでした。\n通信状況を確認して再読み込みしてください。\n\n${message}`;
  }
  return message;
}

export interface CaseSessionProps {
  caseId: string;
  theme: ThemePreference;
  onThemeChange: (next: ThemePreference) => void;
  onBackToIndex: () => void;
  onOpenHowToPlay: () => void;
  /** クリア後に案内する次の事件。全部解決済みなら undefined。 */
  nextCase?: { id: string; title: string } | undefined;
  onOpenCase: (caseId: string) => void;
}

export function CaseSession({
  caseId,
  theme,
  onThemeChange,
  onBackToIndex,
  onOpenHowToPlay,
  nextCase,
  onOpenCase,
}: CaseSessionProps) {
  const engineRef = useRef<SqlEngine | null>(null);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [bootError, setBootError] = useState<string | undefined>(undefined);
  const [progress, setProgress] = useState<ProgressState | null>(null);
  const [notice, setNotice] = useState<string | undefined>(undefined);
  const [result, setResult] = useState<ResultState>({ kind: 'idle' });
  // タブと実行履歴。進捗とは別のキーに保存する（useWorkspace の説明を参照）。
  const { workspace, update: updateWorkspace, reset: resetWorkspace } = useWorkspace(caseId);
  const layout = useLayoutPreference();
  const [justEarned, setJustEarned] = useState<readonly string[]>([]);
  const [finalOpen, setFinalOpen] = useState(false);
  const [cleared, setCleared] = useState<ClearedAnnouncement | null>(null);
  const resultRef = useRef<HTMLElement | null>(null);

  /*
   * 実行したら結果を画面内に入れる。
   *
   * 縦に狭い画面では右カラムがスクロールする（AppShell.module.css）。
   * Database を見上げたまま実行すると結果が画面外に出るので、そこだけ戻す。
   * `block: 'nearest'` なので、すでに見えているときは何も起きない。
   */
  useEffect(() => {
    if (result.kind !== 'result' && result.kind !== 'error') return;
    resultRef.current?.scrollIntoView({ block: 'nearest' });
  }, [result]);

  useEffect(() => {
    const engine = new WorkerSqlEngine(browserWorkerFactory);
    engineRef.current = engine;
    let cancelled = false;

    void (async () => {
      try {
        const [caseData] = await Promise.all([
          loadCaseData({ baseUrl: import.meta.env.BASE_URL, caseId }),
          engine.init(),
        ]);
        await engine.loadDatabase(caseData.database);
        if (cancelled) return;

        const restored = loadProgress(caseId, caseData.metadata.version);
        if (restored.kind === 'discarded') setNotice(DISCARD_NOTICE[restored.reason]);
        setProgress(restored.kind === 'loaded' ? restored.progress : initialProgress(Date.now()));
        setLoaded({ caseData, hints: buildSchemaHints(caseData.schema.tables) });
      } catch (e) {
        if (!cancelled) setBootError(describeBootFailure(e));
      }
    })();

    return () => {
      cancelled = true;
      void engine.dispose();
    };
  }, [caseId]);

  /** 進捗が変わるたびに保存する。書き込みに失敗してもゲームは止めない。 */
  const commit = useCallback(
    (next: ProgressState) => {
      setProgress(next);
      if (loaded) saveProgress(caseId, loaded.caseData.metadata.version, next);
    },
    [caseId, loaded],
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
        updateWorkspace((previous) => pushHistory(previous, sql));

        // 成功したクエリだけが進行に影響する。
        const outcome = applyQueryResult(loaded.caseData, progress, queryResult);
        commit(outcome.state);
        setJustEarned(outcome.newEvidence);

        const first = outcome.completedObjectives[0];
        if (first) {
          const story = loaded.caseData.story;
          const next = activeObjectives(loaded.caseData, outcome.state)[0];
          setCleared({
            // 同じ状態で二重に出さないよう、達成した Objective の並びを鍵にする。
            id: outcome.completedObjectives.map((o) => o.id).join('+'),
            objectiveTitle:
              outcome.completedObjectives.length === 1
                ? first.title
                : `${first.title} ほか${String(outcome.completedObjectives.length - 1)}件`,
            evidenceTitles: outcome.newEvidence.flatMap((id) => {
              const item = findEvidence(story, id);
              return item ? [item.title] : [];
            }),
            beats: outcome.newStoryBeats.flatMap((id) => {
              const item = findStoryBeat(story, id);
              return item ? [item.body] : [];
            }),
            nextObjectiveTitle: next?.title,
            allCleared: allObjectivesCompleted(loaded.caseData, outcome.state),
          });
        }
      } catch (e) {
        if (!isSqlExecutionError(e)) throw e;
        setResult({ kind: 'error', error: toFriendlyError(e, loaded.hints) });
      }
    },
    [loaded, progress, commit, updateWorkspace],
  );

  const onReset = useCallback(() => {
    if (!loaded) return;
    if (!window.confirm('進捗をすべて消して最初からやり直しますか？')) return;
    clearProgress(caseId);
    setProgress(initialProgress(Date.now()));
    resetWorkspace();
    setJustEarned([]);
    setNotice(undefined);
    setResult({ kind: 'idle' });
    setCleared(null);
  }, [caseId, loaded, resetWorkspace]);

  /**
   * 答えを見る。SQLは**エディタに入れるだけで実行はしない**。
   *
   * 自動で達成にしてしまうと、答えを読まずに次へ進めてしまう。
   * 自分で実行して結果を見るところまでを残すことで、
   * 「なぜこれで分かるのか」を確かめる余地が残る。
   */
  const onRevealAnswer = useCallback(
    (objectiveId: string) => {
      if (!loaded || !progress) return;
      const sql = loaded.caseData.solution.exampleSql[objectiveId];
      if (sql === undefined) return;

      commit(revealAnswer(progress, objectiveId));
      updateWorkspace((previous) => setSql(previous, activeTab(previous).id, sql));
    },
    [loaded, progress, commit, updateWorkspace],
  );

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
        caseTitle={loaded.caseData.metadata.title}
        theme={theme}
        onThemeChange={onThemeChange}
        onBackToIndex={onBackToIndex}
        onOpenHowToPlay={onOpenHowToPlay}
        layout={layout}
        story={
          <StoryPanel
            caseData={loaded.caseData}
            progress={progress}
            justEarnedEvidence={justEarned}
            notice={notice}
            onRevealHint={(objectiveId) => {
              commit(revealHint(loaded.caseData, progress, objectiveId));
            }}
            onRevealAnswer={onRevealAnswer}
            onOpenFinalAnswer={() => setFinalOpen(true)}
            onReset={onReset}
            onCollapse={layout.toggleStory}
          />
        }
        database={
          <DatabasePanel schema={loaded.caseData.schema} onCollapse={layout.toggleDatabase} />
        }
        editor={
          <SqlEditor
            workspace={workspace}
            disabled={result.kind === 'running'}
            onRun={(sql) => void run(sql)}
            onChangeSql={(tabId, sql) => {
              updateWorkspace((previous) => setSql(previous, tabId, sql));
            }}
            onSelectTab={(tabId) => {
              updateWorkspace((previous) => selectTab(previous, tabId));
            }}
            onAddTab={() => {
              updateWorkspace(addTab);
            }}
            onCloseTab={(tabId) => {
              updateWorkspace((previous) => closeTab(previous, tabId));
            }}
            onRenameTab={(tabId, name) => {
              updateWorkspace((previous) => renameTab(previous, tabId, name));
            }}
          />
        }
        result={<ResultPanel state={result} panelRef={resultRef} />}
      />

      <ObjectiveCleared
        announcement={cleared}
        onDismiss={() => {
          setCleared(null);
        }}
      />

      <FinalAnswerDialog
        caseData={loaded.caseData}
        progress={progress}
        open={finalOpen}
        onOpenChange={setFinalOpen}
        onSubmit={onSubmitFinalAnswer}
        nextCase={nextCase}
        onOpenNextCase={onOpenCase}
        onBackToIndex={onBackToIndex}
      />
    </>
  );
}

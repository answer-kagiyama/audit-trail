/**
 * アプリ本体。経路を見て、事件簿かゲーム画面のどちらかを出す。
 *
 * ゲームのルールはすべて game/ の純関数にある。ここがやるのは
 * 「エンジンを回して、返ってきた状態を描き、保存する」ことだけ。
 */
import { useCallback, useEffect, useState } from 'react';
import { CaseDataError } from './game/caseLoader.ts';
import { loadCaseIndex } from './game/caseIndex.ts';
import type { CaseSummary } from './game/caseIndex.ts';
import { BootScreen } from './ui/BootScreen/BootScreen.tsx';
import { CaseIndexScreen } from './ui/CaseIndex/CaseIndexScreen.tsx';
import { CaseSession } from './ui/CaseSession.tsx';
import { HowToPlay } from './ui/HowToPlay/HowToPlay.tsx';
import { useRoute } from './ui/hooks/useRoute.ts';
import { useTheme } from './ui/ThemeToggle/useTheme.ts';

/** 遊び方を一度でも閉じたか。初回だけ自動で開く。 */
const SEEN_KEY = 'audit-trail:how-to-play-seen';

function hasSeenHowToPlay(): boolean {
  try {
    return localStorage.getItem(SEEN_KEY) === '1';
  } catch {
    return false;
  }
}

function markHowToPlaySeen(): void {
  try {
    localStorage.setItem(SEEN_KEY, '1');
  } catch {
    // 保存できなくても、そのセッション中は再表示しない。
  }
}

export function App() {
  const { route, navigate } = useRoute();
  const { preference: theme, setPreference: setTheme } = useTheme();

  const [cases, setCases] = useState<CaseSummary[] | null>(null);
  const [indexError, setIndexError] = useState<string | undefined>(undefined);
  // 初回訪問なら開けた状態で始める。ダイアログ自体は索引が読めるまで
  // 描かれない（下で BootScreen に抜ける）ので、真っ白な画面には重ならない。
  const [howToPlayOpen, setHowToPlayOpen] = useState(() => !hasSeenHowToPlay());

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const loaded = await loadCaseIndex(import.meta.env.BASE_URL);
        if (!cancelled) setCases(loaded);
      } catch (e) {
        if (!cancelled) {
          setIndexError(
            e instanceof CaseDataError
              ? e.message
              : `事件簿を読み込めませんでした。\n\n${e instanceof Error ? e.message : String(e)}`,
          );
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const closeHowToPlay = useCallback((open: boolean) => {
    setHowToPlayOpen(open);
    if (!open) markHowToPlaySeen();
  }, []);

  const howToPlay = <HowToPlay open={howToPlayOpen} onOpenChange={closeHowToPlay} />;

  if (indexError !== undefined) return <BootScreen error={indexError} />;
  if (!cases) return <BootScreen />;

  if (route.kind === 'case') {
    const summary = cases.find((item) => item.id === route.caseId);
    // 知らない CASE ID を直で開かれたら事件簿に戻す。
    if (!summary) {
      return (
        <>
          <CaseIndexScreen
            cases={cases}
            theme={theme}
            onThemeChange={setTheme}
            onOpenCase={(caseId) => {
              navigate({ kind: 'case', caseId });
            }}
            onOpenHowToPlay={() => setHowToPlayOpen(true)}
          />
          {howToPlay}
        </>
      );
    }

    return (
      <>
        <CaseSession
          // CASE を切り替えたら状態を作り直す。
          key={summary.id}
          caseId={summary.id}
          theme={theme}
          onThemeChange={setTheme}
          onBackToIndex={() => {
            navigate({ kind: 'index' });
          }}
          onOpenHowToPlay={() => setHowToPlayOpen(true)}
        />
        {howToPlay}
      </>
    );
  }

  return (
    <>
      <CaseIndexScreen
        cases={cases}
        theme={theme}
        onThemeChange={setTheme}
        onOpenCase={(caseId) => {
          navigate({ kind: 'case', caseId });
        }}
        onOpenHowToPlay={() => setHowToPlayOpen(true)}
      />
      {howToPlay}
    </>
  );
}

/**
 * 画面の骨格。
 *
 * デスクトップは3カラム、モバイルはタブ。タブは表示するパネルを
 * 1つに絞る＝DOM構造そのものが変わるので、CSS だけでは切り替えられない。
 * useMediaQuery で描き分ける。
 *
 * 3カラムなのは、**縦の取り合いを横に移す**ため。Database / Editor / Result を
 * 縦に積むと、13インチでは3面で 539px しかなく、どう配分しても ER図
 * （852x441 の横長）が読める大きさにならなかった。Database を独立した
 * カラムにすると縛りが横幅だけになり、横幅は余っている次元なので払える。
 *
 * 幅はプレイヤーが掴み手で決める。どこにどれだけ要るかは、
 * その人が何を調べているかで変わる——こちらで決め切らないほうがよい。
 *
 * @see docs/ui-layout.md
 */
import { Tabs } from '@base-ui/react/tabs';
import { useRef } from 'react';
import type { ReactNode } from 'react';
import { useElementWidth } from '../hooks/useElementWidth.ts';
import { useMediaQuery } from '../hooks/useMediaQuery.ts';
import { ThemeToggle } from '../ThemeToggle/ThemeToggle.tsx';
import type { ThemePreference } from '../ThemeToggle/theme.ts';
import { CollapsedRail, ColumnHandle } from './ColumnHandle.tsx';
import {
  DATABASE_MAX,
  DATABASE_MIN,
  STORY_MAX,
  STORY_MIN,
  clampColumns,
  defaultColumns,
  gridTemplate,
} from './columns.ts';
import styles from './AppShell.module.css';

export interface AppShellProps {
  story: ReactNode;
  database: ReactNode;
  editor: ReactNode;
  result: ReactNode;
  /** ヘッダに出す、いま調査中の事件名。 */
  caseTitle: string;
  theme: ThemePreference;
  onThemeChange: (next: ThemePreference) => void;
  onBackToIndex: () => void;
  onOpenHowToPlay: () => void;
  /** カラムの幅と折り畳み（useLayoutPreference）。 */
  layout: {
    storyWidth?: number | undefined;
    databaseWidth?: number | undefined;
    storyCollapsed: boolean;
    databaseCollapsed: boolean;
    setStoryWidth: (width: number) => void;
    setDatabaseWidth: (width: number) => void;
    resetStoryWidth: () => void;
    resetDatabaseWidth: () => void;
    toggleStory: () => void;
    toggleDatabase: () => void;
  };
}

/** tokens.css の --breakpoint-wide と揃えること。 */
const WIDE_QUERY = '(min-width: 900px)';

export function AppShell({
  story,
  database,
  editor,
  result,
  caseTitle,
  theme,
  onThemeChange,
  onBackToIndex,
  onOpenHowToPlay,
  layout,
}: AppShellProps) {
  const isWide = useMediaQuery(WIDE_QUERY);
  const wideRef = useRef<HTMLDivElement | null>(null);

  // `.wide` の内側の幅。余白やスクロールバーを含めずに測る。
  const available = useElementWidth(
    wideRef,
    (typeof window === 'undefined' ? 1440 : window.innerWidth) - 24,
  );

  const context = {
    available,
    storyCollapsed: layout.storyCollapsed,
    databaseCollapsed: layout.databaseCollapsed,
  };
  const fallback = defaultColumns(available);
  const widths = clampColumns(
    {
      story: layout.storyWidth ?? fallback.story,
      database: layout.databaseWidth ?? fallback.database,
    },
    context,
  );

  return (
    <div className={styles.shell}>
      <header className={styles.header}>
        <button type="button" className={styles.title} onClick={onBackToIndex} title="事件簿へ戻る">
          WHERE
        </button>
        <span className={styles.caseTitle}>{caseTitle}</span>
        <div className={styles.headerActions}>
          <button type="button" className={styles.headerButton} onClick={onOpenHowToPlay}>
            遊び方
          </button>
          <button type="button" className={styles.headerButton} onClick={onBackToIndex}>
            事件簿
          </button>
          <ThemeToggle preference={theme} onChange={onThemeChange} />
        </div>
      </header>

      {isWide ? (
        <div
          className={styles.wide}
          ref={wideRef}
          style={{ gridTemplateColumns: gridTemplate(widths, context) }}
        >
          {layout.storyCollapsed ? (
            <CollapsedRail label="Story" onOpen={layout.toggleStory} />
          ) : (
            story
          )}

          {layout.storyCollapsed ? (
            <span />
          ) : (
            <ColumnHandle
              label="Story の幅"
              value={widths.story}
              min={STORY_MIN}
              max={STORY_MAX}
              direction={1}
              onResize={layout.setStoryWidth}
              onReset={layout.resetStoryWidth}
            />
          )}

          <div className={styles.workbench}>
            {editor}
            {result}
          </div>

          {layout.databaseCollapsed ? (
            <span />
          ) : (
            <ColumnHandle
              label="Database の幅"
              value={widths.database}
              min={DATABASE_MIN}
              max={DATABASE_MAX}
              direction={-1}
              onResize={layout.setDatabaseWidth}
              onReset={layout.resetDatabaseWidth}
            />
          )}

          {layout.databaseCollapsed ? (
            <CollapsedRail label="Database" onOpen={layout.toggleDatabase} />
          ) : (
            database
          )}
        </div>
      ) : (
        <Tabs.Root defaultValue="story" className={styles.narrow}>
          <Tabs.List className={styles.tabList}>
            <Tabs.Tab value="story" className={styles.tab}>
              Story
            </Tabs.Tab>
            <Tabs.Tab value="database" className={styles.tab}>
              Database
            </Tabs.Tab>
            <Tabs.Tab value="sql" className={styles.tab}>
              SQL
            </Tabs.Tab>
          </Tabs.List>

          <Tabs.Panel value="story" className={styles.tabPanel}>
            {story}
          </Tabs.Panel>
          <Tabs.Panel value="database" className={styles.tabPanel}>
            {database}
          </Tabs.Panel>
          {/* エディタは結果とセットで見たいので同じタブに置く。 */}
          <Tabs.Panel value="sql" className={styles.sqlPanel} keepMounted>
            {editor}
            {result}
          </Tabs.Panel>
        </Tabs.Root>
      )}
    </div>
  );
}

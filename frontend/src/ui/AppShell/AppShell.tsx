/**
 * 画面の骨格。
 *
 * デスクトップは2カラム、モバイルはタブ。タブは表示するパネルを
 * 1つに絞る＝DOM構造そのものが変わるので、CSS だけでは切り替えられない。
 * useMediaQuery で描き分ける。
 *
 * @see docs/game-design.md#4-画面と情報設計
 */
import { Tabs } from '@base-ui/react/tabs';
import type { ReactNode } from 'react';
import { useMediaQuery } from '../hooks/useMediaQuery.ts';
import { ThemeToggle } from '../ThemeToggle/ThemeToggle.tsx';
import type { ThemePreference } from '../ThemeToggle/theme.ts';
import styles from './AppShell.module.css';

export interface AppShellProps {
  story: ReactNode;
  database: ReactNode;
  editor: ReactNode;
  result: ReactNode;
  theme: ThemePreference;
  onThemeChange: (next: ThemePreference) => void;
}

/** tokens.css の --breakpoint-wide と揃えること。 */
const WIDE_QUERY = '(min-width: 900px)';

export function AppShell({ story, database, editor, result, theme, onThemeChange }: AppShellProps) {
  const isWide = useMediaQuery(WIDE_QUERY);

  return (
    <div className={styles.shell}>
      <header className={styles.header}>
        <h1 className={styles.title}>Audit Trail</h1>
        <span className={styles.subtitle}>記録は、誰が何をしたかを覚えている。</span>
        <div className={styles.headerActions}>
          <ThemeToggle preference={theme} onChange={onThemeChange} />
        </div>
      </header>

      {isWide ? (
        <div className={styles.wide}>
          {story}
          <div className={styles.workbench}>
            {database}
            {editor}
            {result}
          </div>
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

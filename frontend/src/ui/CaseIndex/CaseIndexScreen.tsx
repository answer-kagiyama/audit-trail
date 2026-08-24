/**
 * 事件簿（タイトル画面）。
 *
 * 起動して最初に見る画面。ここで「何のゲームか」が伝わらないと、
 * SQL を書く前に離脱する。名前・タグライン・一行説明・遊び方への導線を置く。
 */
import type { CaseSummary } from '../../game/caseIndex.ts';
import { caseStatus } from '../../game/caseIndex.ts';
import { ThemeToggle } from '../ThemeToggle/ThemeToggle.tsx';
import type { ThemePreference } from '../ThemeToggle/theme.ts';
import styles from './CaseIndex.module.css';

export interface CaseIndexScreenProps {
  cases: readonly CaseSummary[];
  theme: ThemePreference;
  onThemeChange: (next: ThemePreference) => void;
  onOpenCase: (caseId: string) => void;
  onOpenHowToPlay: () => void;
}

export function CaseIndexScreen({
  cases,
  theme,
  onThemeChange,
  onOpenCase,
  onOpenHowToPlay,
}: CaseIndexScreenProps) {
  return (
    <div className={styles.screen}>
      <header className={styles.masthead}>
        <h1 className={styles.title}>WHERE</h1>
        <p className={styles.tagline}>真実はどこにある？</p>
      </header>

      <p className={styles.lede}>
        SQLを書いて、事件のデータベースを自分で調べる推理ゲームです。
        取引記録、ログイン記録、入退室記録——
        バラバラに残された監査証跡を突き合わせたとき、辻褄の合わない一点が見えてきます。
      </p>

      <div className={styles.actions}>
        <button type="button" className={styles.ghost} onClick={onOpenHowToPlay}>
          遊び方を見る
        </button>
      </div>

      <section className={styles.list}>
        <h2 className={styles.listTitle}>事件簿</h2>

        {cases.length === 0 ? (
          <p className={styles.empty}>まだ事件がありません。</p>
        ) : (
          cases.map((summary) => (
            <CaseCard
              key={summary.id}
              summary={summary}
              onOpen={() => {
                onOpenCase(summary.id);
              }}
            />
          ))
        )}
      </section>

      <footer className={styles.footer}>
        <ThemeToggle preference={theme} onChange={onThemeChange} />
        <span>ブラウザ内で完結します。データは送信されません。</span>
      </footer>
    </div>
  );
}

function CaseCard({ summary, onOpen }: { summary: CaseSummary; onOpen: () => void }) {
  const status = caseStatus(summary);
  const [min, max] = summary.estimatedMinutes;

  return (
    <button type="button" className={styles.card} onClick={onOpen}>
      <div className={styles.cardHead}>
        <span className={styles.caseId}>{summary.id.toUpperCase()}</span>
        <span className={styles.caseTitle}>{summary.title}</span>
        <StatusBadge status={status} total={summary.objectiveCount} />
      </div>

      <div className={styles.caseSubtitle}>{summary.subtitle}</div>

      <div className={styles.meta}>
        <span>難易度 {'★'.repeat(summary.difficulty)}</span>
        <span>
          目安 {min}〜{max} 分
        </span>
        <span>調査目的 {summary.objectiveCount} 件</span>
      </div>

      <div className={styles.concepts}>
        {summary.sqlConcepts.map((concept) => (
          <span key={concept} className={styles.concept}>
            {concept}
          </span>
        ))}
      </div>
    </button>
  );
}

function StatusBadge({ status, total }: { status: ReturnType<typeof caseStatus>; total: number }) {
  switch (status.kind) {
    case 'solved':
      return <span className={`${styles.badge} ${styles.badgeSolved}`}>解決済み</span>;
    case 'in-progress':
      return (
        <span className={`${styles.badge} ${styles.badgeProgress}`}>
          調査中 {status.completed} / {total}
        </span>
      );
    case 'untouched':
      return <span className={`${styles.badge} ${styles.badgeUntouched}`}>未着手</span>;
  }
}

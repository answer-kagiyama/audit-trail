import type { ReactNode } from 'react';
import styles from './Panel.module.css';

interface PanelProps {
  title: string;
  /** 見出し右端の補助情報（行数、件数など）。 */
  aside?: ReactNode;
  /** 本文に余白を付けるか。表やエディタは自前で持つので false。 */
  padded?: boolean;
  className?: string;
  children: ReactNode;
}

/** 見出し付きの面。Story / Database / Result が共通で使う。 */
export function Panel({ title, aside, padded = true, className, children }: PanelProps) {
  return (
    <section className={[styles.panel, className].filter(Boolean).join(' ')}>
      <header className={styles.header}>
        <h2 className={styles.title}>{title}</h2>
        {aside !== undefined && <div className={styles.aside}>{aside}</div>}
      </header>
      <div className={[styles.body, padded ? styles.padded : ''].filter(Boolean).join(' ')}>
        {children}
      </div>
    </section>
  );
}

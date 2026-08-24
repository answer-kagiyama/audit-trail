import type { ReactNode } from 'react';
import styles from './Panel.module.css';

interface PanelProps {
  title: string;
  /** 見出し右端の補助情報（行数、件数など）。 */
  aside?: ReactNode;
  /**
   * 折りたたみ。畳むと本文を描かず、見出しだけになる。
   * 縦に狭い画面で、使っていない面に場所を取られないようにするためのもの。
   */
  collapsed?: boolean;
  onToggleCollapsed?: () => void;
  /** 本文に余白を付けるか。表やエディタは自前で持つので false。 */
  padded?: boolean;
  className?: string;
  children: ReactNode;
}

/** 見出し付きの面。Story / Database / Result が共通で使う。 */
export function Panel({
  title,
  aside,
  collapsed = false,
  onToggleCollapsed,
  padded = true,
  className,
  children,
}: PanelProps) {
  return (
    <section className={[styles.panel, className].filter(Boolean).join(' ')}>
      <header className={styles.header}>
        <h2 className={styles.title}>{title}</h2>
        {aside !== undefined && <div className={styles.aside}>{aside}</div>}
        {onToggleCollapsed !== undefined && (
          <button
            type="button"
            className={styles.collapse}
            aria-expanded={!collapsed}
            onClick={onToggleCollapsed}
          >
            {collapsed ? '開く' : '畳む'}
          </button>
        )}
      </header>
      {/* 畳んだときは中身を描かない。DOM に残すと ER図の再レイアウトが走り続ける。 */}
      {!collapsed && (
        <div className={[styles.body, padded ? styles.padded : ''].filter(Boolean).join(' ')}>
          {children}
        </div>
      )}
    </section>
  );
}

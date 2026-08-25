import type { ReactNode, Ref } from 'react';
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
  /**
   * 別画面で大きく開く。渡すと見出しに「拡大」が出る。
   * 縦の取り合いでは足りない面（ER図）のための逃げ道。
   */
  onExpand?: (() => void) | undefined;
  /** 本文に余白を付けるか。表やエディタは自前で持つので false。 */
  padded?: boolean;
  className?: string;
  /** 面そのものへの参照。画面内に入っているかを外から測るために使う。 */
  panelRef?: Ref<HTMLElement> | undefined;
  children: ReactNode;
}

/** 見出し付きの面。Story / Database / Result が共通で使う。 */
export function Panel({
  title,
  aside,
  collapsed = false,
  onToggleCollapsed,
  onExpand,
  padded = true,
  className,
  panelRef,
  children,
}: PanelProps) {
  return (
    <section ref={panelRef} className={[styles.panel, className].filter(Boolean).join(' ')}>
      <header className={styles.header}>
        <h2 className={styles.title}>{title}</h2>
        {aside !== undefined && <div className={styles.aside}>{aside}</div>}
        {onExpand !== undefined && (
          <button type="button" className={styles.collapse} onClick={onExpand}>
            拡大
          </button>
        )}
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

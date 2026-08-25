import type { ReactNode, Ref } from 'react';
import styles from './Panel.module.css';

interface PanelProps {
  title: string;
  /** 見出し右端の補助情報（行数、件数など）。 */
  aside?: ReactNode;
  /**
   * 畳む。渡すと見出しに「畳む」が出る。
   * 畳むのは**カラムごと**で、開き直すのは AppShell が出すレールの役目
   * （docs/ui-layout.md §5）。だからここは「畳む」しか持たない。
   */
  onCollapse?: (() => void) | undefined;
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
  onCollapse,
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
        {onCollapse !== undefined && (
          <button type="button" className={styles.collapse} onClick={onCollapse}>
            畳む
          </button>
        )}
      </header>
      <div className={[styles.body, padded ? styles.padded : ''].filter(Boolean).join(' ')}>
        {children}
      </div>
    </section>
  );
}

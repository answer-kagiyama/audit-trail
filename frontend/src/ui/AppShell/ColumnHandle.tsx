/**
 * カラムの境界を掴んで幅を変える。
 *
 * マウスだけの機能にしない。`role="separator"` + `tabIndex` で焦点を当てられ、
 * 矢印キーでも動かせるようにしてある——スプリッタをポインタ専用にすると、
 * キーボードだけで遊んでいる人はカラム幅を一生変えられない。
 *
 * ダブルクリック（キーボードなら Home）で既定へ戻す。
 * 動かしすぎて戻せなくなるのがスプリッタで一番よくある詰まり方なので。
 */
import { useRef } from 'react';
import styles from './AppShell.module.css';

/** 矢印キー1回で動く量。Shift を押すと 4倍。 */
const STEP = 16;

export interface ColumnHandleProps {
  label: string;
  /** いまの幅。 */
  value: number;
  min: number;
  max: number;
  /**
   * 掴み手の右側にあるカラムを広げる向きなら -1。
   * Story（左カラム）は +1、Database（右カラム）は -1。
   */
  direction: 1 | -1;
  onResize: (width: number) => void;
  onReset: () => void;
}

export function ColumnHandle({
  label,
  value,
  min,
  max,
  direction,
  onResize,
  onReset,
}: ColumnHandleProps) {
  const drag = useRef<{ x: number; width: number } | null>(null);

  return (
    <div
      className={styles.handle}
      role="separator"
      aria-orientation="vertical"
      aria-label={label}
      aria-valuenow={Math.round(value)}
      aria-valuemin={min}
      aria-valuemax={max}
      tabIndex={0}
      title={`${label}（ドラッグ / 矢印キー、ダブルクリックで既定に戻す）`}
      onPointerDown={(e) => {
        // 副ボタンやペン以外のはじきを拾わない。
        if (e.button !== 0) return;
        drag.current = { x: e.clientX, width: value };
        e.currentTarget.setPointerCapture(e.pointerId);
      }}
      onPointerMove={(e) => {
        const started = drag.current;
        if (!started) return;
        e.preventDefault();
        onResize(started.width + (e.clientX - started.x) * direction);
      }}
      onPointerUp={(e) => {
        drag.current = null;
        e.currentTarget.releasePointerCapture(e.pointerId);
      }}
      onPointerCancel={() => {
        drag.current = null;
      }}
      onDoubleClick={onReset}
      onKeyDown={(e) => {
        const step = e.shiftKey ? STEP * 4 : STEP;
        if (e.key === 'ArrowLeft') {
          e.preventDefault();
          onResize(value - step * direction);
        } else if (e.key === 'ArrowRight') {
          e.preventDefault();
          onResize(value + step * direction);
        } else if (e.key === 'Home') {
          e.preventDefault();
          onReset();
        }
      }}
    />
  );
}

/** 畳んだカラムの代わりに出す細い帯。押すと開く。 */
export function CollapsedRail({ label, onOpen }: { label: string; onOpen: () => void }) {
  return (
    <button
      type="button"
      className={styles.rail}
      onClick={onOpen}
      aria-label={`${label} を開く`}
      title={`${label} を開く`}
    >
      <span className={styles.railLabel} aria-hidden="true">
        {label}
      </span>
    </button>
  );
}

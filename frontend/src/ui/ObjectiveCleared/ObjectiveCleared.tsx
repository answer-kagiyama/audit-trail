/**
 * 調査目的を達成した瞬間の演出。
 *
 * 主役は**ストーリー断片**。証拠が増えたことより「その事実が何を意味するか」の
 * 一行がプレイヤーを次の疑問へ押し出す。獲得した証拠と、次に何を調べるのかも
 * ここでまとめて見せて、Story パネルを探しに行かなくても流れが繋がるようにする。
 *
 * 捜査を止めないよう、モーダルにはしない。背後はクリックでき、
 * 一定時間で自動的に消える。
 */
import { useCallback, useEffect, useState } from 'react';
import styles from './ObjectiveCleared.module.css';

/** 表示し続ける時間。ストーリー断片を読み切れる長さにする。 */
const DWELL_MS = 7000;

export interface ClearedAnnouncement {
  /** 同じ達成を二重に出さないための鍵。 */
  id: string;
  objectiveTitle: string;
  evidenceTitles: string[];
  beats: string[];
  /** 次に active になる調査目的。無ければ最終回答へ。 */
  nextObjectiveTitle: string | undefined;
  allCleared: boolean;
}

export function ObjectiveCleared({
  announcement,
  onDismiss,
}: {
  announcement: ClearedAnnouncement | null;
  onDismiss: () => void;
}) {
  const [paused, setPaused] = useState(false);
  const id = announcement?.id;

  const dismiss = useCallback(() => {
    onDismiss();
  }, [onDismiss]);

  // 一定時間で自動的に消す。ポインタが乗っている間は止める
  // （読んでいる最中に消えるのが一番いらだたしい）。
  useEffect(() => {
    if (id === undefined || paused) return;
    const timer = setTimeout(dismiss, DWELL_MS);
    return () => {
      clearTimeout(timer);
    };
  }, [id, paused, dismiss]);

  // Esc で閉じられるようにする。モーダルではないのでフォーカスは奪わない。
  useEffect(() => {
    if (id === undefined) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') dismiss();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [id, dismiss]);

  if (!announcement) return null;

  return (
    <div className={styles.layer}>
      {/*
        role="status" + aria-live="polite" で読み上げに乗せる。
        alert にしないのは、操作を中断させる性質の通知ではないため。
      */}
      <div
        className={styles.card}
        role="status"
        aria-live="polite"
        onClick={dismiss}
        onPointerEnter={() => {
          setPaused(true);
        }}
        onPointerLeave={() => {
          setPaused(false);
        }}
      >
        <div className={styles.header}>
          <span className={styles.badge}>調査目的 達成</span>
          <span className={styles.objectiveTitle}>{announcement.objectiveTitle}</span>
        </div>

        <div className={styles.body}>
          {announcement.evidenceTitles.length > 0 && (
            <div>
              <div className={styles.evidenceLabel}>証拠を獲得</div>
              <ul className={styles.evidenceList}>
                {announcement.evidenceTitles.map((title) => (
                  <li key={title} className={styles.evidenceItem}>
                    {title}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {announcement.beats.map((beat) => (
            <p key={beat} className={styles.beat}>
              {beat}
            </p>
          ))}

          <div className={styles.footer}>
            <span className={styles.next}>
              {announcement.allCleared ? (
                <>
                  証跡は揃った。<span className={styles.nextTitle}>事件を解決できます。</span>
                </>
              ) : announcement.nextObjectiveTitle === undefined ? (
                <>次の調査へ</>
              ) : (
                <>
                  次の調査:{' '}
                  <span className={styles.nextTitle}>{announcement.nextObjectiveTitle}</span>
                </>
              )}
            </span>
            <span className={styles.dismiss}>クリック / Esc で閉じる</span>
          </div>
        </div>

        <div
          className={styles.timer}
          style={
            {
              '--dwell': `${String(DWELL_MS)}ms`,
              animationPlayState: paused ? 'paused' : 'running',
            } as React.CSSProperties
          }
        />
      </div>
    </div>
  );
}

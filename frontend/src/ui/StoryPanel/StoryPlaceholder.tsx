/**
 * Story パネルの仮置き。
 *
 * 中身（事件概要 / 調査目的 / 獲得証拠 / ヒント）は Phase 4 の Issue #26 で作る。
 * Phase 2 では枠と、いま何ができるのかの案内だけを出す。
 */
import { Panel } from '../Panel/Panel.tsx';
import styles from './StoryPlaceholder.module.css';

export function StoryPlaceholder() {
  return (
    <Panel title="Story">
      <div className={styles.body}>
        <p className={styles.lead}>
          ここに事件の概要、いま調べること、見つけた証拠が表示されます。
        </p>
        <p className={styles.note}>
          Phase 2 の時点では、Database 画面で構造を確かめながら 自由に SQL を書いて試せます。
        </p>
        <ul className={styles.tips}>
          <li>ER図でテーブルの繋がりを確認する</li>
          <li>箱をクリックすると列とサンプル行が見られる</li>
          <li>Ctrl / ⌘ + Enter でクエリを実行</li>
          <li>Alt + ↑ / ↓ で実行履歴を辿る</li>
        </ul>
      </div>
    </Panel>
  );
}

/**
 * 遊び方。初回に自動で開き、以降はヘッダ / 事件簿から開ける。
 *
 * 説明することは3つだけに絞る。
 *   1. 何をするゲームか（コアループ）
 *   2. どの画面が何のためにあるか
 *   3. 実行の仕方
 *
 * SQL の書き方は説明しない。それはヒントと Database 画面の役目で、
 * ここで教えると「調べる」というゲームの中身を先に食ってしまう。
 */
import { Dialog } from '@base-ui/react/dialog';
import { useRef } from 'react';
import styles from './HowToPlay.module.css';

const LOOP: { title: string; body: string }[] = [
  {
    title: '調査目的を読む',
    body: '左の Story に「いま何を調べるか」が出ます。それが今回の問いです。',
  },
  {
    title: 'どこに答えがありそうかを考える',
    body: 'Database でテーブルの構造とER図を見ます。必要な情報が2つのテーブルに分かれていることもあります。',
  },
  {
    title: 'SQLを書いて実行する',
    body: '思いついた調べ方をそのままクエリにします。何度でも試せます。間違えても減点はありません。',
  },
  {
    title: '結果が目的を満たすと、証拠を獲得する',
    body: '正解のSQLは1つではありません。同じ結果に辿り着けば、書き方は自由です。',
  },
  {
    title: '全部そろったら、事件を解決する',
    body: '調査目的をすべて達成すると、犯人と手口を回答できるようになります。',
  },
];

/**
 * 見取り図に並べる4つの面。**この並び順が画面の並び順**（左→右、上→下）。
 * 調査画面は Story ｜ SQL Editor + Result ｜ Database の3カラム
 * （docs/ui-layout.md）。
 */
const ZONES: { name: string; role: string; className?: string | undefined }[] = [
  {
    name: 'Story',
    role: '事件のあらまし、いま調べること、見つけた証拠、ヒント。困ったらここに戻る。',
    className: styles.zoneStory,
  },
  { name: 'SQL Editor', role: 'クエリを書いて実行する。タブで何本か並行して書ける。' },
  { name: 'Result', role: '実行結果の表。エラーは日本語で理由を出す。' },
  {
    name: 'Database',
    role: 'どんなテーブルがあるか。ER図と、列の意味とサンプル行。',
    className: styles.zoneDatabase,
  },
];

export function HowToPlay({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  // 既定では最初のタブ可能要素（末尾の「調査をはじめる」）に焦点が移り、
  // 縦に長いこのダイアログが下までスクロールした状態で開いてしまう。
  // 冒頭から読ませたいので、焦点はダイアログ自身に置く。
  const popupRef = useRef<HTMLDivElement>(null);

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Backdrop className={styles.backdrop} />
        <Dialog.Popup ref={popupRef} className={styles.popup} initialFocus={popupRef}>
          <Dialog.Title className={styles.title}>遊び方</Dialog.Title>

          <p className={styles.lead}>
            SQLを書いて、事件のデータベースを自分で調べる推理ゲームです。
            SQLは「勉強するもの」ではなく「捜査の道具」として使います。
          </p>

          <section>
            <h3 className={styles.sectionTitle}>調査の流れ</h3>
            <ol className={styles.loop}>
              {LOOP.map((step, index) => (
                <li key={step.title} className={styles.loopStep}>
                  <span className={styles.loopNumber}>{index + 1}</span>
                  <span>
                    <strong>{step.title}</strong>
                    <br />
                    {step.body}
                  </span>
                </li>
              ))}
            </ol>
          </section>

          <section>
            <h3 className={styles.sectionTitle}>画面の見取り図</h3>
            <div className={styles.mapWrap}>
              <div className={styles.map}>
                {ZONES.map((zone) => (
                  <div key={zone.name} className={`${styles.zone} ${zone.className ?? ''}`}>
                    <span className={styles.zoneName}>{zone.name}</span>
                    <span className={styles.zoneRole}>{zone.role}</span>
                  </div>
                ))}
              </div>
            </div>
            {/* 掴み手も「畳む」も、言われないと気づかない。ここで一度だけ伝える。 */}
            <p className={styles.mapNote}>
              左右の境目を<strong>ドラッグすると幅を変えられます</strong>。 ER図を大きく見たいときは
              Database を広げてください。
              見出しの「畳む」で左右を閉じれば、書く場所を最大にできます。
              画面が狭いときは、この4つがタブに切り替わります。
            </p>
          </section>

          <section>
            <h3 className={styles.sectionTitle}>操作</h3>
            <table className={styles.keys}>
              <tbody>
                <tr>
                  <td>
                    <kbd>Ctrl</kbd> / <kbd>⌘</kbd> + <kbd>Enter</kbd>
                  </td>
                  <td>SQLを実行する</td>
                </tr>
                <tr>
                  <td>
                    <kbd>Alt</kbd> + <kbd>↑</kbd> / <kbd>↓</kbd>
                  </td>
                  <td>過去に実行したSQLを辿る</td>
                </tr>
                <tr>
                  <td>
                    <kbd>Esc</kbd> → <kbd>Tab</kbd>
                  </td>
                  <td>
                    エディタの外へ移動する（<kbd>Tab</kbd> 単体は字下げ）
                  </td>
                </tr>
                <tr>
                  <td>ヒントを見る</td>
                  <td>3段階で開きます。使ってもペナルティはありません</td>
                </tr>
              </tbody>
            </table>
          </section>

          <p className={styles.note}>
            <strong>行き詰まっても大丈夫です。</strong>
            実行回数にも時間にも制限はありません。0件という結果も
            「そこには無い」という立派な捜査結果です。
          </p>

          <div className={styles.actions}>
            <button
              type="button"
              className={styles.start}
              onClick={() => {
                onOpenChange(false);
              }}
            >
              調査をはじめる
            </button>
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

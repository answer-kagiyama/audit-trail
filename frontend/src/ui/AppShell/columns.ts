/**
 * 3カラムの幅の計算。
 *
 * ここは純粋な関数だけ。React も DOM も知らないので、
 * 「両端を広げすぎたら真ん中が潰れる」といった規則をそのままテストできる。
 *
 * 縦の取り合いを横に移した、というのがこの設計の要点
 * （docs/ui-layout.md §5）。ER図は 852x441 の横長で、
 * 縦積みだと高さで縛られて 0.21倍にしかならないが、
 * 独立したカラムにすると**縛りが横幅だけ**になる。横幅は余っている次元なので、
 * そちらで払うほうが安い。
 */

/** Story の下限。日本語で1行 33文字。これ以下だと調査目的が読めない。 */
export const STORY_MIN = 256;
/** Story の上限。1行 64文字を超えると、かえって読みにくい。 */
export const STORY_MAX = 512;

/** Database の下限。ER図が 0.27倍——「箱がいくつあるか」は分かる大きさ。 */
export const DATABASE_MIN = 288;
/**
 * Database の上限。
 *
 * 図の実サイズ 852px ＋ 枠の余白 28px ＝ 880px で**等倍**になる。
 * それ以上広げても図は大きくならず、真ん中を削るだけなので止める。
 */
export const DATABASE_MAX = 880;

/** 真ん中（Editor + Result）に確保したい幅。SQL を1行 60文字ほど書ける。 */
export const CENTER_MIN = 448;

/** 掴み手の幅。 */
export const HANDLE = 6;
/** 畳んだカラムのレール幅。 */
export const RAIL = 28;

export interface ColumnWidths {
  story: number;
  database: number;
}

export interface ColumnContext {
  /** 左右の余白を除いた、カラムに使える幅。 */
  available: number;
  storyCollapsed: boolean;
  databaseCollapsed: boolean;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/** カラム以外に必ず要る幅（掴み手、または畳んだレール）。 */
function fixedWidth(context: ColumnContext): number {
  return (context.storyCollapsed ? RAIL : HANDLE) + (context.databaseCollapsed ? RAIL : HANDLE);
}

/**
 * 初回の幅。
 *
 * Database は「Story を除いた残りの 45%」。ただし等倍（880px）で頭打ちにする。
 * 45% にしているのは、既定で ER図が読める大きさに寄せつつ、
 * 真ん中を窮屈にしないため——FHD で 0.78倍、WQHD で等倍になる。
 * 気に入らなければ掴み手で動かせるので、ここは「悪くない出発点」でよい。
 *
 * 最後に `clampColumns` を通すのは、**既定そのものが収まらない画面がある**ため。
 * Story 352 + Database 288 + 真ん中 448 + 掴み手 = 1100px 要るので、
 * それ未満の画面（1124px 未満）では既定のほうを詰める。
 * ここで詰めておかないと「初回描画で勝手に幅が動く」ことになる。
 */
export function defaultColumns(available: number): ColumnWidths {
  const story = 352;
  const rest = available - story - HANDLE * 2;
  const database = clamp(Math.round(rest * 0.45), DATABASE_MIN, DATABASE_MAX);
  return clampColumns(
    { story, database },
    { available, storyCollapsed: false, databaseCollapsed: false },
  );
}

/**
 * 望んだ幅を、画面に収まる形へ寄せる。
 *
 * 真ん中が `CENTER_MIN` を割りそうなら、**Database から先に削る**。
 * Story は「いま何を調べているか」を出す面で、消えると現在地を見失う。
 * それでも足りなければ両方を下限まで詰め、最後は真ん中に譲る
 * （画面が本当に狭いときは、畳んでもらうしかない）。
 */
export function clampColumns(want: ColumnWidths, context: ColumnContext): ColumnWidths {
  let story = context.storyCollapsed ? 0 : clamp(want.story, STORY_MIN, STORY_MAX);
  let database = context.databaseCollapsed ? 0 : clamp(want.database, DATABASE_MIN, DATABASE_MAX);

  let over = story + database + fixedWidth(context) + CENTER_MIN - context.available;

  if (over > 0 && !context.databaseCollapsed) {
    const cut = Math.min(over, database - DATABASE_MIN);
    database -= cut;
    over -= cut;
  }
  if (over > 0 && !context.storyCollapsed) {
    story -= Math.min(over, story - STORY_MIN);
  }

  return { story, database };
}

/** 真ん中に残る幅。負にはしない。 */
export function centerWidth(widths: ColumnWidths, context: ColumnContext): number {
  return Math.max(0, context.available - widths.story - widths.database - fixedWidth(context));
}

/** `grid-template-columns` の値を組み立てる。 */
export function gridTemplate(widths: ColumnWidths, context: ColumnContext): string {
  const left = context.storyCollapsed
    ? `${String(RAIL)}px 0px`
    : `${String(widths.story)}px ${String(HANDLE)}px`;
  const right = context.databaseCollapsed
    ? `0px ${String(RAIL)}px`
    : `${String(HANDLE)}px ${String(widths.database)}px`;
  return `${left} minmax(0, 1fr) ${right}`;
}

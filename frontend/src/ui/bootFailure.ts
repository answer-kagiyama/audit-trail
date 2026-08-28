/**
 * 起動まわりで player に見せる文言。
 *
 * 「読み込めませんでした」だけでは、通信の問題なのか、CASEデータが壊れて
 * いるのか、ブラウザが対応していないのかが分からない。直せる人が直せる形で
 * 出す（docs/mvp-issues.md #29）。
 *
 * 画面（CaseSession）から切り離してあるのは、**分岐が増えるたびに壊れうる
 * のは文言の側だから**。ここだけならブラウザを立ち上げずにテストできる。
 */
import { CaseDataError } from '../game/caseLoader.ts';
import type { DiscardReason } from '../game/save.ts';

/**
 * セーブを捨てたときの言い訳。
 *
 * `Record<DiscardReason, string>` なので、`save.ts` に理由を足すと
 * ここを書くまでビルドが通らない。以前は `Record<string, string>` で、
 * 書き忘れると黙って何も出なかった。
 */
export const DISCARD_NOTICE: Record<DiscardReason, string> = {
  'case-updated':
    '事件データが更新されたため、進捗をリセットしました。お手数ですが最初から調査してください。',
  corrupt: '保存された進捗が読めなかったため、リセットしました。',
  'format-changed': 'セーブ形式が変わったため、進捗をリセットしました。',
};

/** 起動失敗の切り分け。原因の見当がつく形にしてから返す。 */
export function describeBootFailure(error: unknown): string {
  if (error instanceof CaseDataError) {
    return `事件データが不正です。\n\n場所: ${error.path}\n${error.message}`;
  }
  const message = error instanceof Error ? error.message : String(error);
  if (/WebAssembly|wasm/i.test(message)) {
    return `SQL実行エンジンを起動できませんでした。\nこのブラウザが WebAssembly に対応していない可能性があります。\n\n${message}`;
  }
  if (/HTTP|fetch|NetworkError|Failed to fetch/i.test(message)) {
    return `事件データを取得できませんでした。\n通信状況を確認して再読み込みしてください。\n\n${message}`;
  }
  return message;
}

import { useSyncExternalStore } from 'react';

/**
 * メディアクエリの一致状態を購読する。
 *
 * デスクトップの2カラムとモバイルのタブ切替は、DOM 構造そのものが変わる
 * （タブはパネルを1つずつしか出さない）。CSS だけでは切り替えられないので、
 * ここで判定して描き分ける。
 */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const list = window.matchMedia(query);
      list.addEventListener('change', onChange);
      return () => list.removeEventListener('change', onChange);
    },
    () => window.matchMedia(query).matches,
    // SSR はしないが、テスト等で window が無い場合の既定値。
    () => false,
  );
}

/**
 * テーマの選択と永続化。
 *
 * **既定はダーク。OS 設定には追従しない。**
 * ダークは好みの問題ではなく、このゲームのアートディレクションそのもの
 * （監査ログ端末の画面）なので、初回の見え方は固定する。
 * OS に合わせたい人は 'system' を選べる。
 *
 * @see docs/adr/0006-theme-switching.md
 */
export type ThemePreference = 'system' | 'light' | 'dark';

const DEFAULT_PREFERENCE: ThemePreference = 'dark';

const STORAGE_KEY = 'audit-trail:theme';

export function isThemePreference(value: unknown): value is ThemePreference {
  return value === 'system' || value === 'light' || value === 'dark';
}

/** localStorage は使えないことがある（プライベートモード等）。落とさない。 */
export function loadThemePreference(): ThemePreference {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return isThemePreference(stored) ? stored : DEFAULT_PREFERENCE;
  } catch {
    return DEFAULT_PREFERENCE;
  }
}

export function saveThemePreference(preference: ThemePreference): void {
  try {
    // 既定と同じでも明示的に保存する。既定を将来変えたときに、
    // 選択済みの人の見え方が勝手に変わらないようにするため。
    localStorage.setItem(STORAGE_KEY, preference);
  } catch {
    // 保存できなくても、そのセッション中は選択が効く。
  }
}

/** ルート要素へ反映する。'system' のときは属性を消して OS 設定に戻す。 */
export function applyThemePreference(preference: ThemePreference): void {
  const root = document.documentElement;
  if (preference === 'system') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', preference);
}

import { useCallback, useEffect, useState } from 'react';
import { applyThemePreference, loadThemePreference, saveThemePreference } from './theme.ts';
import type { ThemePreference } from './theme.ts';

export function useTheme(): {
  preference: ThemePreference;
  setPreference: (next: ThemePreference) => void;
} {
  const [preference, setState] = useState<ThemePreference>(loadThemePreference);

  // 初回と変更時にルートへ反映する。
  useEffect(() => {
    applyThemePreference(preference);
  }, [preference]);

  const setPreference = useCallback((next: ThemePreference) => {
    setState(next);
    saveThemePreference(next);
  }, []);

  return { preference, setPreference };
}

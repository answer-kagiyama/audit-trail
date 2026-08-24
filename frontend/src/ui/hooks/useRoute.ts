/**
 * ごく小さなルーティング。
 *
 * 経路は2つしかない（事件簿 / CASE1本）ので、react-router は入れない。
 * History API と popstate だけで足りる（AGENTS.md §1: 依存を増やさない）。
 */
import { useCallback, useSyncExternalStore } from 'react';

export type Route = { kind: 'index' } | { kind: 'case'; caseId: string };

/** ビルド時の base（サブパス配信でも壊れないように剥がす）。 */
const BASE = import.meta.env.BASE_URL;

function parse(pathname: string): Route {
  const path = pathname.startsWith(BASE)
    ? pathname.slice(BASE.length)
    : pathname.replace(/^\//, '');
  const segment = path.replace(/\/+$/, '');
  // CASE の id は英数字とハイフンだけ。想定外の経路は事件簿に落とす。
  return /^[a-z0-9-]+$/i.test(segment) ? { kind: 'case', caseId: segment } : { kind: 'index' };
}

function subscribe(onChange: () => void): () => void {
  window.addEventListener('popstate', onChange);
  return () => {
    window.removeEventListener('popstate', onChange);
  };
}

export function useRoute(): { route: Route; navigate: (to: Route) => void } {
  const pathname = useSyncExternalStore(
    subscribe,
    () => window.location.pathname,
    () => BASE,
  );

  const navigate = useCallback((to: Route) => {
    const path = to.kind === 'index' ? BASE : `${BASE}${to.caseId}`;
    if (window.location.pathname === path) return;
    window.history.pushState(null, '', path);
    // pushState は popstate を発火しないので、購読側へ自分で知らせる。
    window.dispatchEvent(new PopStateEvent('popstate'));
  }, []);

  return { route: parse(pathname), navigate };
}

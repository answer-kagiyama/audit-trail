/**
 * 作業状態（タブと履歴）を localStorage に載せる。
 *
 * 進捗（`game/save.ts`）とは**別のキー・別のライフサイクル**にしている。
 *   - 進捗は CASE の version と紐づき、CASEが更新されたら捨てる
 *   - 書きかけのSQLは、CASEが更新されても捨てる理由がない
 * 混ぜると「事件データを直したら、みんなの書きかけが消える」ことになる。
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { emptyWorkspace, parseWorkspace } from './workspace.ts';
import type { Workspace } from './workspace.ts';

const KEY_PREFIX = 'audit-trail:workspace:v1';

export function workspaceKey(caseId: string): string {
  return `${KEY_PREFIX}:${caseId}`;
}

/** localStorage は無い / 使えない環境がある。保存できなくてもゲームは止めない。 */
function storage(): Storage | undefined {
  try {
    return typeof localStorage === 'undefined' ? undefined : localStorage;
  } catch {
    return undefined;
  }
}

function load(caseId: string): Workspace {
  const store = storage();
  if (!store) return emptyWorkspace();
  try {
    const raw = store.getItem(workspaceKey(caseId));
    if (raw === null) return emptyWorkspace();
    return parseWorkspace(JSON.parse(raw)) ?? emptyWorkspace();
  } catch {
    return emptyWorkspace();
  }
}

export function clearWorkspace(caseId: string): void {
  const store = storage();
  if (!store) return;
  try {
    store.removeItem(workspaceKey(caseId));
  } catch {
    // 消せなくても続行する。
  }
}

export interface WorkspaceHandle {
  workspace: Workspace;
  /** 変換関数を渡して更新する。保存もここで行う。 */
  update: (change: (previous: Workspace) => Workspace) => void;
  /** 最初から書き直す（進捗リセットに合わせて呼ぶ）。 */
  reset: () => void;
}

export function useWorkspace(caseId: string): WorkspaceHandle {
  // 初期値は遅延評価。レンダリングのたびに localStorage を読まない。
  const [workspace, setWorkspace] = useState<Workspace>(() => load(caseId));

  // CASE を切り替えたら読み直す。CaseSession は key で作り直されるので
  // 通常は初期値で足りるが、単体で使われても壊れないようにしておく。
  const loadedFor = useRef(caseId);
  useEffect(() => {
    if (loadedFor.current === caseId) return;
    loadedFor.current = caseId;
    setWorkspace(load(caseId));
  }, [caseId]);

  const persist = useCallback(
    (next: Workspace) => {
      const store = storage();
      if (!store) return;
      try {
        store.setItem(workspaceKey(caseId), JSON.stringify(next));
      } catch {
        // 容量超過など。書けなくても、そのセッション中は状態を保つ。
      }
    },
    [caseId],
  );

  const update = useCallback(
    (change: (previous: Workspace) => Workspace) => {
      setWorkspace((previous) => {
        const next = change(previous);
        if (next !== previous) persist(next);
        return next;
      });
    },
    [persist],
  );

  const reset = useCallback(() => {
    const fresh = emptyWorkspace();
    setWorkspace(fresh);
    persist(fresh);
  }, [persist]);

  return { workspace, update, reset };
}

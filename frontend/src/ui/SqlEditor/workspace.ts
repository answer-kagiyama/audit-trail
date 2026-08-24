/**
 * SQLエディタの作業状態——タブと実行履歴。
 *
 * ここは純粋な関数だけ。React も localStorage も知らないので、
 * 「タブを閉じたら隣が選ばれる」といった細かい規則をそのままテストできる。
 *
 * **進行ロジックとは完全に別物**である点が大事。`game/` は
 * 「実行されたSQLと、その結果」しか見ていないので、
 * タブが何枚あろうと Objective の判定には一切影響しない。
 * 保存先も `save.ts` の進捗とは別のキーに分けてある（下の理由参照）。
 */

export interface EditorTab {
  id: string;
  /** タブに表示する名前。既定は連番。 */
  name: string;
  sql: string;
}

export interface Workspace {
  tabs: EditorTab[];
  activeId: string;
  /** 実行に成功したSQL。新しいものが末尾。タブをまたいで共有する。 */
  history: string[];
}

/**
 * タブの上限。
 *
 * 上限を置くのは、CodeMirror の EditorState をタブごとに保持するため。
 * 際限なく増やせると、長時間のプレイでメモリが積み上がる。
 * 8枚は「2〜3本の筋を並行して追う」には十分すぎる数。
 */
export const MAX_TABS = 8;

/** 履歴の上限。古いものから捨てる。 */
export const MAX_HISTORY = 100;

/** タブ名の上限。長いとタブ列が破綻する。 */
export const MAX_TAB_NAME = 24;

let counter = 0;

/** 衝突しないタブID。保存されるので、復元後も続きから採番する。 */
function nextId(): string {
  counter += 1;
  return `tab-${String(Date.now().toString(36))}-${String(counter)}`;
}

function makeTab(name: string, sql = ''): EditorTab {
  return { id: nextId(), name, sql };
}

export function emptyWorkspace(): Workspace {
  const tab = makeTab('クエリ 1');
  return { tabs: [tab], activeId: tab.id, history: [] };
}

export function activeTab(workspace: Workspace): EditorTab {
  // activeId は常に tabs のどれかを指す（各関数がそう保っている）。
  // それでも取れないときは先頭に落として、エディタが空にならないようにする。
  return (
    workspace.tabs.find((tab) => tab.id === workspace.activeId) ??
    workspace.tabs[0] ??
    makeTab('クエリ 1')
  );
}

/** 既存と重ならない「クエリ n」を作る。閉じたあとに番号が飛ばないようにする。 */
function nextTabName(tabs: readonly EditorTab[]): string {
  const used = new Set(
    tabs.flatMap((tab) => {
      const matched = /^クエリ (\d+)$/.exec(tab.name);
      return matched?.[1] === undefined ? [] : [Number(matched[1])];
    }),
  );
  let n = 1;
  while (used.has(n)) n += 1;
  return `クエリ ${String(n)}`;
}

export function addTab(workspace: Workspace): Workspace {
  if (workspace.tabs.length >= MAX_TABS) return workspace;
  const tab = makeTab(nextTabName(workspace.tabs));
  return { ...workspace, tabs: [...workspace.tabs, tab], activeId: tab.id };
}

/**
 * タブを閉じる。
 *
 * 最後の1枚は閉じずに中身だけ空にする。0枚になるとエディタの置き場所が
 * 無くなり、「追加」ボタンを探させることになる。
 */
export function closeTab(workspace: Workspace, id: string): Workspace {
  const index = workspace.tabs.findIndex((tab) => tab.id === id);
  if (index === -1) return workspace;

  if (workspace.tabs.length === 1) {
    const fresh = makeTab('クエリ 1');
    return { ...workspace, tabs: [fresh], activeId: fresh.id };
  }

  const tabs = workspace.tabs.filter((tab) => tab.id !== id);
  if (workspace.activeId !== id) return { ...workspace, tabs };

  // 閉じたのが選択中なら、右隣（無ければ左隣）へ移る。
  const next = tabs[Math.min(index, tabs.length - 1)];
  return { ...workspace, tabs, activeId: next?.id ?? tabs[0]?.id ?? '' };
}

export function selectTab(workspace: Workspace, id: string): Workspace {
  if (!workspace.tabs.some((tab) => tab.id === id)) return workspace;
  return { ...workspace, activeId: id };
}

export function setSql(workspace: Workspace, id: string, sql: string): Workspace {
  return {
    ...workspace,
    tabs: workspace.tabs.map((tab) => (tab.id === id ? { ...tab, sql } : tab)),
  };
}

export function renameTab(workspace: Workspace, id: string, name: string): Workspace {
  const trimmed = name.trim().slice(0, MAX_TAB_NAME);
  if (trimmed === '') return workspace;
  return {
    ...workspace,
    tabs: workspace.tabs.map((tab) => (tab.id === id ? { ...tab, name: trimmed } : tab)),
  };
}

/** 実行に成功したSQLを積む。直前と同じなら積まない。 */
export function pushHistory(workspace: Workspace, sql: string): Workspace {
  if (workspace.history[workspace.history.length - 1] === sql) return workspace;
  const history = [...workspace.history, sql];
  return { ...workspace, history: history.slice(-MAX_HISTORY) };
}

export function clearHistory(workspace: Workspace): Workspace {
  return { ...workspace, history: [] };
}

// --- 保存と復元 --------------------------------------------------------------

/**
 * 保存された作業状態を読む。壊れていたら undefined を返して作り直させる。
 *
 * **CASE の version は見ない。** CASEデータが更新されても、書きかけのSQLを
 * 消す理由にはならない（進捗と違って、古いSQLが残っていても詰まない）。
 * 参照先のテーブルが消えていれば実行時にエラーが出るだけで、
 * それはプレイヤーが直せる。
 */
export function parseWorkspace(raw: unknown): Workspace | undefined {
  if (typeof raw !== 'object' || raw === null) return undefined;
  const record = raw as Record<string, unknown>;

  if (!Array.isArray(record['tabs']) || typeof record['activeId'] !== 'string') return undefined;

  const tabs: EditorTab[] = [];
  for (const item of record['tabs']) {
    if (typeof item !== 'object' || item === null) return undefined;
    const tab = item as Record<string, unknown>;
    if (
      typeof tab['id'] !== 'string' ||
      typeof tab['name'] !== 'string' ||
      typeof tab['sql'] !== 'string'
    ) {
      return undefined;
    }
    tabs.push({ id: tab['id'], name: tab['name'], sql: tab['sql'] });
  }
  if (tabs.length === 0 || tabs.length > MAX_TABS) return undefined;

  const rawHistory = record['history'];
  const history =
    Array.isArray(rawHistory) && rawHistory.every((entry) => typeof entry === 'string')
      ? rawHistory.slice(-MAX_HISTORY)
      : [];

  const activeId = tabs.some((tab) => tab.id === record['activeId'])
    ? record['activeId']
    : (tabs[0]?.id ?? '');

  return { tabs, activeId, history };
}

import { describe, expect, it } from 'vitest';
import {
  MAX_HISTORY,
  MAX_TABS,
  activeTab,
  addTab,
  clearHistory,
  closeTab,
  emptyWorkspace,
  parseWorkspace,
  pushHistory,
  renameTab,
  selectTab,
  setSql,
} from './workspace.ts';
import type { Workspace } from './workspace.ts';

/** タブを n 枚まで増やす。 */
function withTabs(count: number): Workspace {
  let workspace = emptyWorkspace();
  while (workspace.tabs.length < count) workspace = addTab(workspace);
  return workspace;
}

describe('タブの追加', () => {
  it('最初は1枚で、それが選択されている', () => {
    const workspace = emptyWorkspace();
    expect(workspace.tabs).toHaveLength(1);
    expect(activeTab(workspace).id).toBe(workspace.activeId);
    expect(activeTab(workspace).sql).toBe('');
  });

  it('追加すると、そのタブが選択される', () => {
    const workspace = addTab(emptyWorkspace());
    expect(workspace.tabs).toHaveLength(2);
    expect(workspace.activeId).toBe(workspace.tabs[1]?.id);
  });

  it('名前は連番で付く', () => {
    const workspace = withTabs(3);
    expect(workspace.tabs.map((tab) => tab.name)).toEqual(['クエリ 1', 'クエリ 2', 'クエリ 3']);
  });

  it('閉じたあとの番号を埋め直す（番号が飛ばない）', () => {
    let workspace = withTabs(3);
    workspace = closeTab(workspace, workspace.tabs[1]!.id);
    workspace = addTab(workspace);
    expect(workspace.tabs.map((tab) => tab.name)).toEqual(['クエリ 1', 'クエリ 3', 'クエリ 2']);
  });

  it('上限を超えて増やせない', () => {
    const full = withTabs(MAX_TABS);
    expect(addTab(full)).toBe(full);
    expect(full.tabs).toHaveLength(MAX_TABS);
  });
});

describe('タブを閉じる', () => {
  it('選択中でないタブを閉じても、選択は動かない', () => {
    const workspace = withTabs(3);
    const activeId = workspace.activeId;
    const closed = closeTab(workspace, workspace.tabs[0]!.id);
    expect(closed.tabs).toHaveLength(2);
    expect(closed.activeId).toBe(activeId);
  });

  it('選択中を閉じたら右隣が選ばれる', () => {
    let workspace = withTabs(3);
    workspace = selectTab(workspace, workspace.tabs[0]!.id);
    const rightId = workspace.tabs[1]!.id;
    const closed = closeTab(workspace, workspace.tabs[0]!.id);
    expect(closed.activeId).toBe(rightId);
  });

  it('右端を閉じたら左隣が選ばれる', () => {
    const workspace = withTabs(3);
    const leftId = workspace.tabs[1]!.id;
    const closed = closeTab(workspace, workspace.tabs[2]!.id);
    expect(closed.activeId).toBe(leftId);
  });

  it('最後の1枚は消えず、中身が空になる', () => {
    // 0枚にすると、エディタの置き場所が無くなって「追加」を探させることになる。
    const base = emptyWorkspace();
    const workspace = setSql(base, base.activeId, 'SELECT 1');
    const closed = closeTab(workspace, workspace.activeId);
    expect(closed.tabs).toHaveLength(1);
    expect(closed.tabs[0]?.sql).toBe('');
    expect(closed.activeId).toBe(closed.tabs[0]?.id);
  });

  it('知らないIDでは何も起きない', () => {
    const workspace = withTabs(2);
    expect(closeTab(workspace, 'いないタブ')).toBe(workspace);
  });
});

describe('タブごとの内容', () => {
  it('別のタブの内容を書き換えない', () => {
    let workspace = withTabs(2);
    const [first, second] = workspace.tabs;
    workspace = setSql(workspace, first!.id, 'SELECT 1');
    workspace = setSql(workspace, second!.id, 'SELECT 2');

    expect(workspace.tabs[0]?.sql).toBe('SELECT 1');
    expect(workspace.tabs[1]?.sql).toBe('SELECT 2');
  });

  it('タブを切り替えても内容は保たれる', () => {
    let workspace = withTabs(2);
    workspace = setSql(workspace, workspace.tabs[0]!.id, 'SELECT 1');
    workspace = selectTab(workspace, workspace.tabs[1]!.id);
    workspace = selectTab(workspace, workspace.tabs[0]!.id);
    expect(activeTab(workspace).sql).toBe('SELECT 1');
  });

  it('知らないIDは選択できない', () => {
    const workspace = withTabs(2);
    expect(selectTab(workspace, 'いないタブ')).toBe(workspace);
  });
});

describe('タブ名の変更', () => {
  it('名前を変えられる', () => {
    const base = emptyWorkspace();
    const renamed = renameTab(base, base.activeId, '在庫の推移');
    expect(activeTab(renamed).name).toBe('在庫の推移');
  });

  it('空白だけの名前は無視する', () => {
    const base = emptyWorkspace();
    expect(renameTab(base, base.activeId, '   ')).toBe(base);
  });

  it('長すぎる名前は切り詰める', () => {
    const base = emptyWorkspace();
    const renamed = renameTab(base, base.activeId, 'あ'.repeat(100));
    expect(activeTab(renamed).name.length).toBeLessThanOrEqual(24);
  });
});

describe('実行履歴', () => {
  it('実行した順に積まれる', () => {
    let workspace = emptyWorkspace();
    workspace = pushHistory(workspace, 'SELECT 1');
    workspace = pushHistory(workspace, 'SELECT 2');
    expect(workspace.history).toEqual(['SELECT 1', 'SELECT 2']);
  });

  it('直前と同じSQLは積まない', () => {
    let workspace = pushHistory(emptyWorkspace(), 'SELECT 1');
    workspace = pushHistory(workspace, 'SELECT 1');
    expect(workspace.history).toEqual(['SELECT 1']);
  });

  it('上限を超えたら古いものから捨てる', () => {
    let workspace = emptyWorkspace();
    for (let i = 0; i < MAX_HISTORY + 10; i += 1) {
      workspace = pushHistory(workspace, `SELECT ${String(i)}`);
    }
    expect(workspace.history).toHaveLength(MAX_HISTORY);
    expect(workspace.history[0]).toBe('SELECT 10');
  });

  it('履歴はタブに属さない（消してもタブは残る）', () => {
    let workspace = addTab(pushHistory(emptyWorkspace(), 'SELECT 1'));
    workspace = clearHistory(workspace);
    expect(workspace.history).toEqual([]);
    expect(workspace.tabs).toHaveLength(2);
  });
});

describe('保存の復元', () => {
  const sample = (): Workspace => {
    let workspace = addTab(emptyWorkspace());
    workspace = setSql(workspace, workspace.tabs[0]!.id, 'SELECT 1');
    return pushHistory(workspace, 'SELECT 1');
  };

  it('往復して同じものに戻る', () => {
    const original = sample();
    const restored = parseWorkspace(JSON.parse(JSON.stringify(original)));
    expect(restored).toEqual(original);
  });

  it('オブジェクトでなければ諦める', () => {
    for (const raw of [null, 42, 'x', []]) {
      expect(parseWorkspace(raw)).toBeUndefined();
    }
  });

  it('タブが壊れていれば諦める', () => {
    expect(parseWorkspace({ tabs: [{ id: 'a', name: 'x' }], activeId: 'a' })).toBeUndefined();
    expect(parseWorkspace({ tabs: [], activeId: 'a' })).toBeUndefined();
  });

  it('タブが上限を超えていれば諦める（壊れた保存を信用しない）', () => {
    const tabs = Array.from({ length: MAX_TABS + 1 }, (_, i) => ({
      id: `t${String(i)}`,
      name: 'x',
      sql: '',
    }));
    expect(parseWorkspace({ tabs, activeId: 't0' })).toBeUndefined();
  });

  it('activeId が存在しないタブを指していたら先頭に寄せる', () => {
    const restored = parseWorkspace({
      tabs: [{ id: 'a', name: 'クエリ 1', sql: '' }],
      activeId: 'いないタブ',
    });
    expect(restored?.activeId).toBe('a');
  });

  it('履歴が壊れていても、タブは救う', () => {
    const restored = parseWorkspace({
      tabs: [{ id: 'a', name: 'クエリ 1', sql: 'SELECT 1' }],
      activeId: 'a',
      history: [1, 2, 3],
    });
    expect(restored?.tabs[0]?.sql).toBe('SELECT 1');
    expect(restored?.history).toEqual([]);
  });

  it('履歴が上限を超えていたら新しいほうを残す', () => {
    const history = Array.from({ length: MAX_HISTORY + 5 }, (_, i) => `SELECT ${String(i)}`);
    const restored = parseWorkspace({
      tabs: [{ id: 'a', name: 'クエリ 1', sql: '' }],
      activeId: 'a',
      history,
    });
    expect(restored?.history).toHaveLength(MAX_HISTORY);
    expect(restored?.history.at(-1)).toBe(`SELECT ${String(MAX_HISTORY + 4)}`);
  });
});

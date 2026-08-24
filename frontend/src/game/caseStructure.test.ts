/**
 * CASEデータの構造検証。事件の中身ではなく、データとしての整合性を見る。
 *
 * ここが守るのは「気づきにくい壊し方」:
 *   - schema.json に書いた列が実DBに無い（説明だけ直して SQL を直し忘れた）
 *   - FK に key: "fk" を付け忘れ、ER図に線が描かれない
 *   - Objective の prerequisites が循環していて永久にactiveにならない
 *   - ヒントの用意漏れ（詰まったプレイヤーに逃げ道がなくなる）
 *
 * **cases/ にあるCASE全部に対して回す。** CASEを足した人がテスト側の登録を
 * 忘れて検証から漏れる、という事故を起こさないため、対象はディレクトリを正とする。
 *
 * @see docs/case-format.md#42-er図の検証
 * @see docs/case-format.md#8-case追加時のチェックリスト
 */
import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import { allCaseIds, loadCase } from '../test/caseFixture.ts';
import type { LoadedCase } from '../test/caseFixture.ts';
import { computeBoxes } from '../ui/DatabasePanel/ErDiagram/layout.ts';

describe.each(allCaseIds())('%s', (caseId) => {
  let c: LoadedCase;

  beforeAll(async () => {
    c = await loadCase(caseId);
  });

  afterAll(() => {
    c.dispose();
  });

  interface ActualColumn {
    name: string;
    type: string;
    nullable: boolean;
  }

  /** 実DBの列一覧を PRAGMA から引く。 */
  function actualColumns(table: string): ActualColumn[] {
    const result = c.run(`PRAGMA table_info(${table})`);
    const index = (name: string) => result.columns.findIndex((column) => column === name);
    return result.rows.map((row) => {
      const notnull = Number(row[index('notnull')]);
      const pk = Number(row[index('pk')]);
      return {
        name: String(row[index('name')]),
        type: String(row[index('type')]),
        // SQLite の癖: INTEGER PRIMARY KEY は rowid の別名で、
        // PRAGMA table_info の notnull は 0 と報告される。だが NULL は入らない
        // （NULL を渡すと自動採番される）。プレイヤーに見せる仕様としては
        // 「NULL 不可」が正しいので、主キーは NOT NULL として扱う。
        nullable: notnull === 0 && pk === 0,
      };
    });
  }

  describe('schema.json と実DBの一致', () => {
    it('schema.json のテーブルがすべて実在する', () => {
      const tables = c
        .run(`SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'`)
        .rows.map((row) => String(row[0]));
      for (const table of c.schema.tables) {
        expect(tables, `schema.json のテーブル ${table.name} がDBにありません`).toContain(
          table.name,
        );
      }
    });

    it('実DBのテーブルがすべて schema.json に載っている（説明のないテーブルを作らない）', () => {
      const documented = c.schema.tables.map((table) => table.name);
      const tables = c
        .run(`SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'`)
        .rows.map((row) => String(row[0]));
      for (const table of tables) {
        expect(documented, `DBのテーブル ${table} が schema.json にありません`).toContain(table);
      }
    });

    it('列名・列の並びが実DBと一致する', () => {
      for (const table of c.schema.tables) {
        const actual = actualColumns(table.name).map((column) => column.name);
        const documented = table.columns.map((column) => column.name);
        expect(documented, `${table.name} の列が実DBと一致しません`).toEqual(actual);
      }
    });

    it('宣言型が実DBと一致する', () => {
      for (const table of c.schema.tables) {
        const actual = new Map(
          actualColumns(table.name).map((column) => [column.name, column.type]),
        );
        for (const column of table.columns) {
          expect(column.type, `${table.name}.${column.name} の型`).toBe(actual.get(column.name));
        }
      }
    });

    it('nullable が実DBの NOT NULL 制約と一致する', () => {
      for (const table of c.schema.tables) {
        const actual = new Map(
          actualColumns(table.name).map((column) => [column.name, column.nullable]),
        );
        for (const column of table.columns) {
          expect(column.nullable, `${table.name}.${column.name} の nullable`).toBe(
            actual.get(column.name),
          );
        }
      }
    });

    it('サンプル行の列が実在し、実データと矛盾しない値である', () => {
      for (const table of c.schema.tables) {
        expect(table.sampleRows.length, `${table.name} に sampleRows がありません`).toBeGreaterThan(
          0,
        );

        const names = new Set(table.columns.map((column) => column.name));
        for (const row of table.sampleRows) {
          for (const key of Object.keys(row)) {
            expect(names, `${table.name}.${key} は存在しない列です`).toContain(key);
          }
          // サンプルは実データから取る。存在しない行を載せると嘘の型を教えてしまう。
          const id = row['id'];
          expect(typeof id === 'number', `${table.name} の sampleRows に id がありません`).toBe(
            true,
          );
          const found = c.run(`SELECT COUNT(*) FROM ${table.name} WHERE id = ${String(id)}`);
          expect(
            found.rows[0]?.[0],
            `${table.name} の sampleRow id=${String(id)} が実データにありません`,
          ).toBe(1);
        }
      }
    });
  });

  describe('ER図の定義', () => {
    it('relations が実在するテーブル・列を指している', () => {
      const byTable = new Map(c.schema.tables.map((table) => [table.name, table]));
      for (const relation of c.schema.relations) {
        for (const endpoint of [relation.from, relation.to]) {
          const table = byTable.get(endpoint.table);
          expect(
            table,
            `relation ${relation.id}: テーブル ${endpoint.table} がありません`,
          ).toBeDefined();
          expect(
            table?.columns.map((column) => column.name),
            `relation ${relation.id}: 列 ${endpoint.table}.${endpoint.column} がありません`,
          ).toContain(endpoint.column);
        }
      }
    });

    it('key: "fk" の列はすべて relations に登場する（線の描き漏れ防止）', () => {
      const endpoints = new Set(
        c.schema.relations.flatMap((relation) => [
          `${relation.from.table}.${relation.from.column}`,
          `${relation.to.table}.${relation.to.column}`,
        ]),
      );
      for (const table of c.schema.tables) {
        for (const column of table.columns) {
          if (column.key !== 'fk') continue;
          expect(endpoints, `${table.name}.${column.name} は FK だが relations に無い`).toContain(
            `${table.name}.${column.name}`,
          );
        }
      }
    });

    it('relations に登場する列には key が付いている', () => {
      const byTable = new Map(c.schema.tables.map((table) => [table.name, table]));
      for (const relation of c.schema.relations) {
        for (const endpoint of [relation.from, relation.to]) {
          const column = byTable
            .get(endpoint.table)
            ?.columns.find((candidate) => candidate.name === endpoint.column);
          expect(
            column?.key,
            `${endpoint.table}.${endpoint.column} に key がありません`,
          ).toBeDefined();
        }
      }
    });

    it('実DBの外部キー制約が relations と一致する', () => {
      for (const table of c.schema.tables) {
        const foreignKeys = c.run(`PRAGMA foreign_key_list(${table.name})`);
        if (foreignKeys.rows.length === 0) continue;
        const from = foreignKeys.columns.indexOf('from');
        const to = foreignKeys.columns.indexOf('table');
        for (const row of foreignKeys.rows) {
          const column = String(row[from]);
          const target = String(row[to]);
          const declared = c.schema.relations.some(
            (relation) =>
              relation.from.table === table.name &&
              relation.from.column === column &&
              relation.to.table === target,
          );
          expect(declared, `${table.name}.${column} → ${target} が relations にありません`).toBe(
            true,
          );
        }
      }
    });

    it('すべての relations に日本語ラベルがある', () => {
      for (const relation of c.schema.relations) {
        expect(
          relation.label.length,
          `relation ${relation.id} に label がありません`,
        ).toBeGreaterThan(0);
      }
    });

    it('すべてのテーブルの箱が erCanvas の内側に収まる', () => {
      const boxes = computeBoxes(c.schema);
      for (const box of boxes.values()) {
        expect(box.x, `${box.table} が左にはみ出しています`).toBeGreaterThanOrEqual(0);
        expect(box.y, `${box.table} が上にはみ出しています`).toBeGreaterThanOrEqual(0);
        expect(box.x + box.width, `${box.table} が右にはみ出しています`).toBeLessThanOrEqual(
          c.schema.erCanvas.width,
        );
        expect(box.y + box.height, `${box.table} が下にはみ出しています`).toBeLessThanOrEqual(
          c.schema.erCanvas.height,
        );
      }
    });

    it('箱どうしが重なっていない', () => {
      const boxes = [...computeBoxes(c.schema).values()];
      for (let i = 0; i < boxes.length; i += 1) {
        for (let j = i + 1; j < boxes.length; j += 1) {
          const a = boxes[i];
          const b = boxes[j];
          if (!a || !b) continue;
          const overlaps =
            a.x < b.x + b.width &&
            b.x < a.x + a.width &&
            a.y < b.y + b.height &&
            b.y < a.y + a.height;
          expect(overlaps, `${a.table} と ${b.table} が重なっています`).toBe(false);
        }
      }
    });
  });

  describe('Objective の構造', () => {
    it('id が重複していない', () => {
      const ids = c.story.objectives.map((objective) => objective.id);
      expect(new Set(ids).size).toBe(ids.length);
    });

    it('prerequisites が実在する Objective を指している', () => {
      const ids = new Set(c.story.objectives.map((objective) => objective.id));
      for (const objective of c.story.objectives) {
        for (const prerequisite of objective.prerequisites) {
          expect(ids, `${objective.id} の prerequisite ${prerequisite} がありません`).toContain(
            prerequisite,
          );
        }
      }
    });

    it('DAG になっている（循環がない）', () => {
      const byId = new Map(c.story.objectives.map((objective) => [objective.id, objective]));
      const state = new Map<string, 'visiting' | 'done'>();

      const visit = (id: string, path: string[]): void => {
        const current = state.get(id);
        if (current === 'done') return;
        if (current === 'visiting') {
          throw new Error(`prerequisites が循環しています: ${[...path, id].join(' → ')}`);
        }
        state.set(id, 'visiting');
        for (const prerequisite of byId.get(id)?.prerequisites ?? []) {
          visit(prerequisite, [...path, id]);
        }
        state.set(id, 'done');
      };

      expect(() => {
        for (const objective of c.story.objectives) visit(objective.id, []);
      }).not.toThrow();
    });

    it('開始時にactiveになる Objective が存在する', () => {
      const roots = c.story.objectives.filter((objective) => objective.prerequisites.length === 0);
      expect(roots.length, 'prerequisites が空の Objective がありません').toBeGreaterThan(0);
    });

    it('すべての Objective が prerequisites を辿って到達できる（孤立がない）', () => {
      const byId = new Map(c.story.objectives.map((objective) => [objective.id, objective]));
      const reachable = new Set<string>();
      let changed = true;
      while (changed) {
        changed = false;
        for (const objective of c.story.objectives) {
          if (reachable.has(objective.id)) continue;
          if (objective.prerequisites.every((id) => reachable.has(id))) {
            reachable.add(objective.id);
            changed = true;
          }
        }
      }
      for (const objective of c.story.objectives) {
        expect(reachable, `${objective.id} に到達できません`).toContain(objective.id);
      }
      expect(byId.size).toBe(reachable.size);
    });

    it('すべての Objective に checks がある', () => {
      for (const objective of c.story.objectives) {
        const checks = c.solution.checks[objective.id];
        expect(checks, `${objective.id} に checks がありません`).toBeDefined();
        expect(checks?.length, `${objective.id} の checks が空です`).toBeGreaterThan(0);
      }
    });

    it('checks に対応する Objective が存在する（余分な checks がない）', () => {
      const ids = new Set(c.story.objectives.map((objective) => objective.id));
      for (const id of Object.keys(c.solution.checks)) {
        expect(ids, `checks の ${id} に対応する Objective がありません`).toContain(id);
      }
    });

    it('rewards が実在する evidence / storyBeat を指している', () => {
      const evidence = new Set(c.story.evidence.map((item) => item.id));
      const beats = new Set(c.story.storyBeats.map((item) => item.id));
      for (const objective of c.story.objectives) {
        for (const id of objective.rewards.evidence) {
          expect(evidence, `${objective.id} の evidence ${id} がありません`).toContain(id);
        }
        for (const id of objective.rewards.storyBeats) {
          expect(beats, `${objective.id} の storyBeat ${id} がありません`).toContain(id);
        }
      }
    });

    it('どこからも獲得されない evidence / storyBeat がない', () => {
      const usedEvidence = new Set(c.story.objectives.flatMap((o) => o.rewards.evidence));
      const usedBeats = new Set(c.story.objectives.flatMap((o) => o.rewards.storyBeats));
      for (const item of c.story.evidence) {
        expect(usedEvidence, `evidence ${item.id} はどこからも獲得されません`).toContain(item.id);
      }
      for (const item of c.story.storyBeats) {
        expect(usedBeats, `storyBeat ${item.id} はどこからも獲得されません`).toContain(item.id);
      }
    });
  });

  describe('ヒント', () => {
    it('すべての Objective に3段階のヒントがある', () => {
      for (const objective of c.story.objectives) {
        const hints = c.hints[objective.id];
        expect(hints, `${objective.id} にヒントがありません`).toBeDefined();
        expect(
          hints?.map((hint) => hint.level),
          `${objective.id} のヒント段階`,
        ).toEqual([1, 2, 3]);
      }
    });

    it('ヒントの本文が空でない', () => {
      for (const [id, hints] of Object.entries(c.hints)) {
        for (const hint of hints) {
          expect(
            hint.body.trim().length,
            `${id} level ${String(hint.level)} が空です`,
          ).toBeGreaterThan(0);
        }
      }
    });

    it('ヒントに対応する Objective が存在する', () => {
      const ids = new Set(c.story.objectives.map((objective) => objective.id));
      for (const id of Object.keys(c.hints)) {
        expect(ids, `ヒントの ${id} に対応する Objective がありません`).toContain(id);
      }
    });
  });

  describe('metadata', () => {
    it('files が指すファイルをすべて読めている', () => {
      expect(c.metadata.id).toBe(caseId);
      expect(c.metadata.version).toBeGreaterThanOrEqual(1);
      expect(c.schema.tables.length).toBeGreaterThan(0);
      expect(c.story.objectives.length).toBeGreaterThan(0);
    });

    it('DBサイズの目安（1MB以下）に収まっている', () => {
      const pages = Number(c.run('PRAGMA page_count').rows[0]?.[0] ?? 0);
      const pageSize = Number(c.run('PRAGMA page_size').rows[0]?.[0] ?? 0);
      expect(pages * pageSize).toBeLessThanOrEqual(1024 * 1024);
    });
  });
});

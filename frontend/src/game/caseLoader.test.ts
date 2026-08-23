/**
 * ローダーの検証が実際に壊れを弾くことを確かめる。
 *
 * 「読み込めた」だけでは意味がない。**壊れたデータを黙って受理しないこと**が
 * このモジュールの存在意義なので、そちらを重点的に確かめる。
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  CaseDataError,
  parseHints,
  parseMetadata,
  parseSchema,
  parseSolution,
  parseStory,
} from './caseLoader.ts';
import type { StoryDoc } from './caseTypes.ts';

const CASE_DIR = resolve(import.meta.dirname, '../../../cases/case-001');

function raw(name: string): unknown {
  return JSON.parse(readFileSync(resolve(CASE_DIR, name), 'utf8')) as unknown;
}

/** 構造化データを壊すためのディープコピー。 */
function copy<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

let story: StoryDoc;

beforeAll(() => {
  story = parseStory(raw('story.json'));
});

describe('正常系: CASE 001 が検証を通る', () => {
  it('metadata.json', () => {
    const metadata = parseMetadata(raw('metadata.json'));
    expect(metadata.id).toBe('case-001');
    expect(metadata.dialect).toBe('sqlite');
    expect(metadata.files.database).toBe('database.sqlite');
  });

  it('schema.json', () => {
    const schema = parseSchema(raw('schema.json'));
    expect(schema.tables.map((table) => table.name)).toEqual([
      'employees',
      'transactions',
      'login_logs',
      'access_logs',
    ]);
    expect(schema.relations).toHaveLength(3);
  });

  it('story.json', () => {
    expect(story.objectives).toHaveLength(7);
    expect(story.evidence).toHaveLength(7);
  });

  it('solution.json', () => {
    const solution = parseSolution(raw('solution.json'), story);
    expect(Object.keys(solution.checks)).toHaveLength(7);
    expect(solution.finalAnswer.fields).toHaveLength(2);
  });

  it('hints.json', () => {
    const hints = parseHints(raw('hints.json'), story);
    expect(Object.keys(hints)).toHaveLength(7);
  });
});

describe('metadata.json の検証', () => {
  it('オブジェクトでなければ落ちる', () => {
    expect(() => parseMetadata('nope')).toThrow(CaseDataError);
    expect(() => parseMetadata(null)).toThrow(CaseDataError);
    expect(() => parseMetadata([])).toThrow(CaseDataError);
  });

  it('未知の方言を弾く', () => {
    const broken = copy(raw('metadata.json')) as Record<string, unknown>;
    broken['dialect'] = 'mysql';
    expect(() => parseMetadata(broken)).toThrow(/dialect/);
  });

  it('version が無ければ落ちる（セーブ互換性のキーなので必須）', () => {
    const broken = copy(raw('metadata.json')) as Record<string, unknown>;
    delete broken['version'];
    expect(() => parseMetadata(broken)).toThrow(/version/);
  });

  it('files の指定漏れを弾く', () => {
    const broken = copy(raw('metadata.json')) as Record<string, Record<string, unknown>>;
    delete broken['files']?.['solution'];
    expect(() => parseMetadata(broken)).toThrow(/files\.solution/);
  });
});

describe('schema.json の検証', () => {
  it('存在しないテーブルを指す relation を弾く', () => {
    const broken = copy(raw('schema.json')) as { relations: { to: { table: string } }[] };
    const first = broken.relations[0];
    if (first) first.to.table = 'ghosts';
    expect(() => parseSchema(broken)).toThrow(/ghosts/);
  });

  it('存在しない列を指す relation を弾く', () => {
    const broken = copy(raw('schema.json')) as { relations: { to: { column: string } }[] };
    const first = broken.relations[0];
    if (first) first.to.column = 'nope';
    expect(() => parseSchema(broken)).toThrow(/nope/);
  });

  it('未知の key を弾く', () => {
    const broken = copy(raw('schema.json')) as {
      tables: { columns: { key?: string }[] }[];
    };
    const column = broken.tables[0]?.columns[0];
    if (column) column.key = 'index';
    expect(() => parseSchema(broken)).toThrow(/key/);
  });

  it('未知のカーディナリティを弾く', () => {
    const broken = copy(raw('schema.json')) as { relations: { cardinality: string }[] };
    const first = broken.relations[0];
    if (first) first.cardinality = 'many-to-many';
    expect(() => parseSchema(broken)).toThrow(/cardinality/);
  });

  it('erLayout が無ければ落ちる', () => {
    const broken = copy(raw('schema.json')) as { tables: Record<string, unknown>[] };
    delete broken.tables[0]?.['erLayout'];
    expect(() => parseSchema(broken)).toThrow(/erLayout/);
  });
});

describe('story.json の検証', () => {
  it('存在しない Objective を prerequisites に書いたら落ちる', () => {
    const broken = copy(raw('story.json')) as { objectives: { prerequisites: string[] }[] };
    broken.objectives[1]?.prerequisites.push('obj-99');
    expect(() => parseStory(broken)).toThrow(/obj-99/);
  });

  it('prerequisites の循環を検出する', () => {
    const broken = copy(raw('story.json')) as {
      objectives: { id: string; prerequisites: string[] }[];
    };
    // obj-01 に obj-02 を要求させて循環を作る。
    const first = broken.objectives.find((objective) => objective.id === 'obj-01');
    if (first) first.prerequisites = ['obj-02'];
    expect(() => parseStory(broken)).toThrow(/循環/);
  });

  it('開始時に active になる Objective が無い状態も、循環として弾かれる', () => {
    // 有限のグラフで全 Objective が prerequisites を持つなら必ず循環する。
    // だから「rootが無い」は循環検出でカバーされ、別のチェックは要らない。
    const broken = copy(raw('story.json')) as {
      objectives: { id: string; prerequisites: string[] }[];
    };
    const first = broken.objectives.find((objective) => objective.id === 'obj-01');
    if (first) first.prerequisites = ['obj-07'];
    expect(broken.objectives.every((objective) => objective.prerequisites.length > 0)).toBe(true);
    expect(() => parseStory(broken)).toThrow(/循環/);
  });

  it('id が重複していたら落ちる', () => {
    const broken = copy(raw('story.json')) as { objectives: { id: string }[] };
    const second = broken.objectives[1];
    if (second) second.id = 'obj-01';
    expect(() => parseStory(broken)).toThrow(/重複/);
  });

  it('存在しない evidence を rewards に書いたら落ちる', () => {
    const broken = copy(raw('story.json')) as {
      objectives: { rewards: { evidence: string[] } }[];
    };
    broken.objectives[0]?.rewards.evidence.push('ev-99');
    expect(() => parseStory(broken)).toThrow(/ev-99/);
  });

  it('エピローグが無ければ落ちる（クリア時の最大の報酬なので必須）', () => {
    const broken = copy(raw('story.json')) as Record<string, unknown>;
    delete broken['epilogue'];
    expect(() => parseStory(broken)).toThrow(/epilogue/);
  });
});

describe('solution.json の検証', () => {
  it('Objective の checks 漏れを弾く', () => {
    const broken = copy(raw('solution.json')) as { checks: Record<string, unknown> };
    delete broken.checks['obj-04'];
    expect(() => parseSolution(broken, story)).toThrow(/obj-04/);
  });

  it('対応する Objective が無い checks を弾く', () => {
    const broken = copy(raw('solution.json')) as { checks: Record<string, unknown> };
    broken.checks['obj-99'] = [{ type: 'containsRows', columns: ['id'], rows: [[1]] }];
    expect(() => parseSolution(broken, story)).toThrow(/obj-99/);
  });

  it('未知の判定タイプを弾く', () => {
    const broken = copy(raw('solution.json')) as { checks: Record<string, { type: string }[]> };
    const check = broken.checks['obj-01']?.[0];
    if (check) check.type = 'magicMatch';
    expect(() => parseSolution(broken, story)).toThrow(/magicMatch/);
  });

  it('rows の列数が columns と合っていなければ弾く', () => {
    const broken = copy(raw('solution.json')) as {
      checks: Record<string, { rows: unknown[][] }[]>;
    };
    const check = broken.checks['obj-01']?.[0];
    if (check) check.rows = [[4821]];
    expect(() => parseSolution(broken, story)).toThrow(/列数/);
  });

  it('正解が選択肢に含まれていなければ弾く', () => {
    const broken = copy(raw('solution.json')) as {
      finalAnswer: { fields: { correct: string }[] };
    };
    const field = broken.finalAnswer.fields[0];
    if (field) field.correct = '存在しない人';
    expect(() => parseSolution(broken, story)).toThrow(/options に含まれていません/);
  });
});

describe('hints.json の検証', () => {
  it('Objective のヒント漏れを弾く', () => {
    const broken = copy(raw('hints.json')) as Record<string, unknown>;
    delete broken['obj-05'];
    expect(() => parseHints(broken, story)).toThrow(/obj-05/);
  });

  it('level が連番でなければ弾く', () => {
    const broken = copy(raw('hints.json')) as Record<string, { level: number }[]>;
    const hint = broken['obj-01']?.[1];
    if (hint) hint.level = 5;
    expect(() => parseHints(broken, story)).toThrow(/連番/);
  });

  it('本文が空なら弾く', () => {
    const broken = copy(raw('hints.json')) as Record<string, { body: string }[]>;
    const hint = broken['obj-01']?.[0];
    if (hint) hint.body = '   ';
    expect(() => parseHints(broken, story)).toThrow(/空文字/);
  });
});

describe('エラーメッセージ', () => {
  it('どのファイルのどこが壊れているかを名指しする', () => {
    const broken = copy(raw('schema.json')) as { tables: Record<string, unknown>[] };
    delete broken.tables[1]?.['name'];
    try {
      parseSchema(broken);
      expect.unreachable('should throw');
    } catch (e) {
      expect(e).toBeInstanceOf(CaseDataError);
      expect((e as CaseDataError).path).toBe('schema.json.tables[1].name');
      expect((e as CaseDataError).message).toContain('schema.json.tables[1].name');
    }
  });
});

/**
 * CASEデータの読み込みと検証。
 *
 * 不正なJSONを黙って受理しない。CASEデータの壊れは、
 * 「なぜかクリアできない」「なぜか画面が空」という形で後から現れると
 * 原因追跡が非常に難しくなる。読み込んだ瞬間に、どこが壊れているかを名指しで落とす。
 *
 * 検証ライブラリ（zod 等）は入れない。CASEの形は固定で、
 * 必要なのは素朴な型ガードだけ（AGENTS.md §1）。
 *
 * @see docs/architecture.md#8-caseデータの読み込み
 * @see docs/case-format.md
 */
import type {
  CaseData,
  CaseMetadata,
  HintsDoc,
  SchemaDoc,
  SolutionDoc,
  StoryDoc,
} from './caseTypes.ts';

/** どのファイルのどこが壊れているかを名指しするエラー。 */
export class CaseDataError extends Error {
  readonly path: string;

  constructor(path: string, detail: string) {
    super(`CASEデータが不正です（${path}）: ${detail}`);
    this.name = 'CaseDataError';
    this.path = path;
  }
}

// --- 素朴な型ガード ----------------------------------------------------------

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requireRecord(value: unknown, path: string): Record<string, unknown> {
  if (!isRecord(value)) throw new CaseDataError(path, 'オブジェクトではありません');
  return value;
}

function requireArray(value: unknown, path: string): unknown[] {
  if (!Array.isArray(value)) throw new CaseDataError(path, '配列ではありません');
  return value;
}

function requireString(value: unknown, path: string): string {
  if (typeof value !== 'string') throw new CaseDataError(path, '文字列ではありません');
  return value;
}

function requireNonEmptyString(value: unknown, path: string): string {
  const text = requireString(value, path);
  if (text.trim() === '') throw new CaseDataError(path, '空文字です');
  return text;
}

function requireNumber(value: unknown, path: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new CaseDataError(path, '数値ではありません');
  }
  return value;
}

function requireBoolean(value: unknown, path: string): boolean {
  if (typeof value !== 'boolean') throw new CaseDataError(path, '真偽値ではありません');
  return value;
}

/**
 * 列挙値。unknown は `!==` 比較では literal 型に絞り込めないので、
 * 明示的にリテラル型を返すヘルパーを用意する。
 */
function requireLiteral<T extends string>(value: unknown, path: string, allowed: readonly T[]): T {
  const text = requireString(value, path);
  const match = allowed.find((candidate) => candidate === text);
  if (match === undefined) {
    throw new CaseDataError(path, `${allowed.join(' / ')} のいずれかにしてください: ${text}`);
  }
  return match;
}

function requireStringArray(value: unknown, path: string): string[] {
  return requireArray(value, path).map((item, index) =>
    requireString(item, `${path}[${String(index)}]`),
  );
}

// --- 各ファイルの検証 --------------------------------------------------------

export function parseMetadata(raw: unknown): CaseMetadata {
  const root = requireRecord(raw, 'metadata.json');
  const files = requireRecord(root['files'], 'metadata.json.files');

  const dialect = requireLiteral(root['dialect'], 'metadata.json.dialect', [
    'sqlite',
    'postgres',
  ] as const);

  const estimated = requireArray(root['estimatedMinutes'], 'metadata.json.estimatedMinutes');
  if (estimated.length !== 2) {
    throw new CaseDataError('metadata.json.estimatedMinutes', '[最小, 最大] の2要素にしてください');
  }

  return {
    id: requireNonEmptyString(root['id'], 'metadata.json.id'),
    version: requireNumber(root['version'], 'metadata.json.version'),
    title: requireNonEmptyString(root['title'], 'metadata.json.title'),
    subtitle: requireString(root['subtitle'] ?? '', 'metadata.json.subtitle'),
    difficulty: requireNumber(root['difficulty'], 'metadata.json.difficulty'),
    estimatedMinutes: [
      requireNumber(estimated[0], 'metadata.json.estimatedMinutes[0]'),
      requireNumber(estimated[1], 'metadata.json.estimatedMinutes[1]'),
    ],
    sqlConcepts: requireStringArray(root['sqlConcepts'] ?? [], 'metadata.json.sqlConcepts'),
    dialect,
    files: {
      story: requireNonEmptyString(files['story'], 'metadata.json.files.story'),
      schema: requireNonEmptyString(files['schema'], 'metadata.json.files.schema'),
      hints: requireNonEmptyString(files['hints'], 'metadata.json.files.hints'),
      solution: requireNonEmptyString(files['solution'], 'metadata.json.files.solution'),
      database: requireNonEmptyString(files['database'], 'metadata.json.files.database'),
    },
  };
}

export function parseSchema(raw: unknown): SchemaDoc {
  const root = requireRecord(raw, 'schema.json');
  const canvas = requireRecord(root['erCanvas'], 'schema.json.erCanvas');

  const tables = requireArray(root['tables'], 'schema.json.tables').map((item, index) => {
    const path = `schema.json.tables[${String(index)}]`;
    const table = requireRecord(item, path);
    const layout = requireRecord(table['erLayout'], `${path}.erLayout`);

    return {
      name: requireNonEmptyString(table['name'], `${path}.name`),
      description: requireString(table['description'], `${path}.description`),
      erLayout: {
        x: requireNumber(layout['x'], `${path}.erLayout.x`),
        y: requireNumber(layout['y'], `${path}.erLayout.y`),
      },
      columns: requireArray(table['columns'], `${path}.columns`).map((rawColumn, columnIndex) => {
        const columnPath = `${path}.columns[${String(columnIndex)}]`;
        const column = requireRecord(rawColumn, columnPath);
        const rawKey = column['key'];
        const key =
          rawKey === undefined
            ? undefined
            : requireLiteral(rawKey, `${columnPath}.key`, ['pk', 'fk'] as const);
        return {
          name: requireNonEmptyString(column['name'], `${columnPath}.name`),
          type: requireNonEmptyString(column['type'], `${columnPath}.type`),
          nullable: requireBoolean(column['nullable'], `${columnPath}.nullable`),
          ...(key === undefined ? {} : { key }),
          description: requireString(column['description'], `${columnPath}.description`),
        };
      }),
      // サンプル行の値は SqlValue のまま通す（表示にしか使わない）。
      sampleRows: requireArray(table['sampleRows'], `${path}.sampleRows`).map((row, rowIndex) =>
        requireRecord(row, `${path}.sampleRows[${String(rowIndex)}]`),
      ) as SchemaDoc['tables'][number]['sampleRows'],
    };
  });

  const relations = requireArray(root['relations'], 'schema.json.relations').map((item, index) => {
    const path = `schema.json.relations[${String(index)}]`;
    const relation = requireRecord(item, path);
    const cardinality = requireLiteral(relation['cardinality'], `${path}.cardinality`, [
      'many-to-one',
      'one-to-many',
      'one-to-one',
    ] as const);
    const endpoint = (value: unknown, endpointPath: string) => {
      const record = requireRecord(value, endpointPath);
      return {
        table: requireNonEmptyString(record['table'], `${endpointPath}.table`),
        column: requireNonEmptyString(record['column'], `${endpointPath}.column`),
      };
    };
    return {
      id: requireNonEmptyString(relation['id'], `${path}.id`),
      from: endpoint(relation['from'], `${path}.from`),
      to: endpoint(relation['to'], `${path}.to`),
      cardinality,
      label: requireNonEmptyString(relation['label'], `${path}.label`),
      description: requireString(relation['description'], `${path}.description`),
    };
  });

  const schema: SchemaDoc = {
    tables,
    relations,
    erCanvas: {
      width: requireNumber(canvas['width'], 'schema.json.erCanvas.width'),
      height: requireNumber(canvas['height'], 'schema.json.erCanvas.height'),
    },
  };

  // 参照整合性。ここが壊れているとER図が黙って線を落とす。
  const byTable = new Map(schema.tables.map((table) => [table.name, table]));
  for (const relation of schema.relations) {
    for (const [side, end] of [
      ['from', relation.from],
      ['to', relation.to],
    ] as const) {
      const table = byTable.get(end.table);
      if (!table) {
        throw new CaseDataError(
          `schema.json.relations.${relation.id}.${side}`,
          `テーブル ${end.table} がありません`,
        );
      }
      if (!table.columns.some((column) => column.name === end.column)) {
        throw new CaseDataError(
          `schema.json.relations.${relation.id}.${side}`,
          `列 ${end.table}.${end.column} がありません`,
        );
      }
    }
  }

  return schema;
}

export function parseStory(raw: unknown): StoryDoc {
  const root = requireRecord(raw, 'story.json');

  const section = (value: unknown, path: string) => {
    const record = requireRecord(value, path);
    return {
      title: requireNonEmptyString(record['title'], `${path}.title`),
      body: requireNonEmptyString(record['body'], `${path}.body`),
    };
  };

  const objectives = requireArray(root['objectives'], 'story.json.objectives').map(
    (item, index) => {
      const path = `story.json.objectives[${String(index)}]`;
      const objective = requireRecord(item, path);
      const rewards = requireRecord(objective['rewards'], `${path}.rewards`);
      return {
        id: requireNonEmptyString(objective['id'], `${path}.id`),
        title: requireNonEmptyString(objective['title'], `${path}.title`),
        brief: requireNonEmptyString(objective['brief'], `${path}.brief`),
        prerequisites: requireStringArray(objective['prerequisites'], `${path}.prerequisites`),
        rewards: {
          evidence: requireStringArray(rewards['evidence'] ?? [], `${path}.rewards.evidence`),
          storyBeats: requireStringArray(rewards['storyBeats'] ?? [], `${path}.rewards.storyBeats`),
        },
      };
    },
  );

  if (objectives.length === 0) {
    throw new CaseDataError('story.json.objectives', 'Objective が1つもありません');
  }

  const story: StoryDoc = {
    prologue: section(root['prologue'], 'story.json.prologue'),
    objectives,
    evidence: requireArray(root['evidence'], 'story.json.evidence').map((item, index) => {
      const path = `story.json.evidence[${String(index)}]`;
      const record = requireRecord(item, path);
      return {
        id: requireNonEmptyString(record['id'], `${path}.id`),
        title: requireNonEmptyString(record['title'], `${path}.title`),
        body: requireNonEmptyString(record['body'], `${path}.body`),
      };
    }),
    storyBeats: requireArray(root['storyBeats'], 'story.json.storyBeats').map((item, index) => {
      const path = `story.json.storyBeats[${String(index)}]`;
      const record = requireRecord(item, path);
      return {
        id: requireNonEmptyString(record['id'], `${path}.id`),
        body: requireNonEmptyString(record['body'], `${path}.body`),
      };
    }),
    epilogue: section(root['epilogue'], 'story.json.epilogue'),
  };

  validateStoryReferences(story);
  return story;
}

function validateStoryReferences(story: StoryDoc): void {
  const ids = new Set<string>();
  for (const objective of story.objectives) {
    if (ids.has(objective.id)) {
      throw new CaseDataError('story.json.objectives', `id が重複しています: ${objective.id}`);
    }
    ids.add(objective.id);
  }

  const evidenceIds = new Set(story.evidence.map((item) => item.id));
  const beatIds = new Set(story.storyBeats.map((item) => item.id));

  for (const objective of story.objectives) {
    for (const prerequisite of objective.prerequisites) {
      if (!ids.has(prerequisite)) {
        throw new CaseDataError(
          `story.json.objectives.${objective.id}.prerequisites`,
          `存在しない Objective を指しています: ${prerequisite}`,
        );
      }
    }
    for (const id of objective.rewards.evidence) {
      if (!evidenceIds.has(id)) {
        throw new CaseDataError(
          `story.json.objectives.${objective.id}.rewards.evidence`,
          `存在しない evidence を指しています: ${id}`,
        );
      }
    }
    for (const id of objective.rewards.storyBeats) {
      if (!beatIds.has(id)) {
        throw new CaseDataError(
          `story.json.objectives.${objective.id}.rewards.storyBeats`,
          `存在しない storyBeat を指しています: ${id}`,
        );
      }
    }
  }

  assertAcyclic(story);
}

/**
 * prerequisites が循環していると、その Objective は永久に active にならない。
 *
 * 「開始時に active になる Objective が1つも無い」も同時にここで弾ける。
 * 有限のグラフで全 Objective が prerequisites を持つなら、
 * 辿っていけば必ずどこかで元に戻る＝循環になるため、別のチェックは要らない。
 */
function assertAcyclic(story: StoryDoc): void {
  const byId = new Map(story.objectives.map((objective) => [objective.id, objective]));
  const state = new Map<string, 'visiting' | 'done'>();

  const visit = (id: string, path: string[]): void => {
    const current = state.get(id);
    if (current === 'done') return;
    if (current === 'visiting') {
      throw new CaseDataError(
        'story.json.objectives',
        `prerequisites が循環しています: ${[...path, id].join(' → ')}`,
      );
    }
    state.set(id, 'visiting');
    for (const prerequisite of byId.get(id)?.prerequisites ?? []) {
      visit(prerequisite, [...path, id]);
    }
    state.set(id, 'done');
  };

  for (const objective of story.objectives) visit(objective.id, []);
}

export function parseSolution(raw: unknown, story: StoryDoc): SolutionDoc {
  const root = requireRecord(raw, 'solution.json');
  const checksRaw = requireRecord(root['checks'], 'solution.json.checks');
  const finalRaw = requireRecord(root['finalAnswer'], 'solution.json.finalAnswer');

  const checks: SolutionDoc['checks'] = {};
  for (const [objectiveId, value] of Object.entries(checksRaw)) {
    const path = `solution.json.checks.${objectiveId}`;
    const list = requireArray(value, path);
    if (list.length === 0) throw new CaseDataError(path, 'checks が空です');
    checks[objectiveId] = list.map((item, index) => parseCheck(item, `${path}[${String(index)}]`));
  }

  // Objective と checks の対応漏れは、そのまま「クリアできない CASE」になる。
  for (const objective of story.objectives) {
    if (!(objective.id in checks)) {
      throw new CaseDataError('solution.json.checks', `${objective.id} の checks がありません`);
    }
  }
  for (const objectiveId of Object.keys(checks)) {
    if (!story.objectives.some((objective) => objective.id === objectiveId)) {
      throw new CaseDataError(
        'solution.json.checks',
        `${objectiveId} に対応する Objective がありません`,
      );
    }
  }

  // 答えの提示。全 Objective ぶん揃っていないと、そこだけ脱出弁が無い CASE になる。
  const exampleRaw = requireRecord(root['exampleSql'], 'solution.json.exampleSql');
  const exampleSql: SolutionDoc['exampleSql'] = {};
  for (const objective of story.objectives) {
    exampleSql[objective.id] = requireNonEmptyString(
      exampleRaw[objective.id],
      `solution.json.exampleSql.${objective.id}`,
    );
  }
  for (const objectiveId of Object.keys(exampleRaw)) {
    if (!story.objectives.some((objective) => objective.id === objectiveId)) {
      throw new CaseDataError(
        'solution.json.exampleSql',
        `${objectiveId} に対応する Objective がありません`,
      );
    }
  }

  const fields = requireArray(finalRaw['fields'], 'solution.json.finalAnswer.fields').map(
    (item, index) => {
      const path = `solution.json.finalAnswer.fields[${String(index)}]`;
      const field = requireRecord(item, path);
      const type = requireLiteral(field['type'], `${path}.type`, ['select'] as const);
      const options = requireStringArray(field['options'], `${path}.options`);
      const correct = requireNonEmptyString(field['correct'], `${path}.correct`);
      if (!options.includes(correct)) {
        throw new CaseDataError(`${path}.correct`, `options に含まれていません: ${correct}`);
      }
      return {
        id: requireNonEmptyString(field['id'], `${path}.id`),
        label: requireNonEmptyString(field['label'], `${path}.label`),
        type,
        options,
        correct,
      };
    },
  );

  if (fields.length === 0) {
    throw new CaseDataError('solution.json.finalAnswer.fields', 'フィールドが1つもありません');
  }

  return {
    checks,
    exampleSql,
    finalAnswer: {
      fields,
      requireAll: requireBoolean(finalRaw['requireAll'], 'solution.json.finalAnswer.requireAll'),
    },
  };
}

function parseCheck(raw: unknown, path: string): SolutionDoc['checks'][string][number] {
  const check = requireRecord(raw, path);
  const type = requireString(check['type'], `${path}.type`);

  // options は素通しでよい。未知のキーがあっても判定側が無視するだけで、
  // 誤って達成/未達成が変わることはない。
  const options =
    check['options'] === undefined ? undefined : requireRecord(check['options'], `${path}.options`);
  const optionPart = options === undefined ? {} : { options };

  switch (type) {
    case 'containsRows':
    case 'resultSet': {
      const columns = requireStringArray(check['columns'], `${path}.columns`);
      if (columns.length === 0)
        throw new CaseDataError(`${path}.columns`, '列が指定されていません');
      const rows = requireArray(check['rows'], `${path}.rows`).map((row, index) =>
        requireArray(row, `${path}.rows[${String(index)}]`),
      );
      if (rows.length === 0) throw new CaseDataError(`${path}.rows`, '行が指定されていません');
      for (const [index, row] of rows.entries()) {
        if (row.length !== columns.length) {
          throw new CaseDataError(
            `${path}.rows[${String(index)}]`,
            `列数が columns と一致しません（${String(row.length)} / ${String(columns.length)}）`,
          );
        }
      }
      return { type, columns, rows, ...optionPart } as SolutionDoc['checks'][string][number];
    }
    case 'columnValues': {
      const values = requireArray(check['values'], `${path}.values`);
      if (values.length === 0) throw new CaseDataError(`${path}.values`, '値が指定されていません');
      return {
        type,
        column: requireNonEmptyString(check['column'], `${path}.column`),
        values,
        ...optionPart,
      } as SolutionDoc['checks'][string][number];
    }
    default:
      throw new CaseDataError(`${path}.type`, `未知の判定タイプ: ${type}`);
  }
}

export function parseHints(raw: unknown, story: StoryDoc): HintsDoc {
  const root = requireRecord(raw, 'hints.json');
  const hints: HintsDoc = {};

  for (const [objectiveId, value] of Object.entries(root)) {
    const path = `hints.json.${objectiveId}`;
    const list = requireArray(value, path).map((item, index) => {
      const itemPath = `${path}[${String(index)}]`;
      const hint = requireRecord(item, itemPath);
      return {
        level: requireNumber(hint['level'], `${itemPath}.level`),
        body: requireNonEmptyString(hint['body'], `${itemPath}.body`),
      };
    });

    // level は 1 から連番。飛んでいるとUIの段階開示が壊れる。
    list.forEach((hint, index) => {
      if (hint.level !== index + 1) {
        throw new CaseDataError(
          path,
          `level が 1 からの連番になっていません: ${String(hint.level)}`,
        );
      }
    });

    hints[objectiveId] = list;
  }

  // ヒントの用意漏れは、詰まったプレイヤーの逃げ道を塞ぐ。
  for (const objective of story.objectives) {
    if (!(objective.id in hints)) {
      throw new CaseDataError('hints.json', `${objective.id} のヒントがありません`);
    }
  }

  return hints;
}

// --- 読み込み ---------------------------------------------------------------

export interface LoadCaseOptions {
  /** CASEアセットの置き場。末尾は '/'。 */
  baseUrl: string;
  caseId: string;
  /** テストから差し替えられるようにしておく。 */
  fetchImpl?: typeof fetch;
}

export async function loadCaseData({
  baseUrl,
  caseId,
  fetchImpl = fetch,
}: LoadCaseOptions): Promise<CaseData> {
  const dir = `${baseUrl}cases/${caseId}/`;

  const metadata = parseMetadata(await fetchJson(fetchImpl, `${dir}metadata.json`));
  if (metadata.id !== caseId) {
    throw new CaseDataError('metadata.json.id', `ディレクトリ名と一致しません: ${metadata.id}`);
  }

  // solution は隠さない。配信済みである事実は分割しても変わらず、
  // 複雑さだけが増す（docs/architecture.md §8）。
  const [storyRaw, schemaRaw, solutionRaw, hintsRaw, database] = await Promise.all([
    fetchJson(fetchImpl, `${dir}${metadata.files.story}`),
    fetchJson(fetchImpl, `${dir}${metadata.files.schema}`),
    fetchJson(fetchImpl, `${dir}${metadata.files.solution}`),
    fetchJson(fetchImpl, `${dir}${metadata.files.hints}`),
    fetchBytes(fetchImpl, `${dir}${metadata.files.database}`),
  ]);

  const story = parseStory(storyRaw);

  return {
    metadata,
    schema: parseSchema(schemaRaw),
    story,
    solution: parseSolution(solutionRaw, story),
    hints: parseHints(hintsRaw, story),
    database,
  };
}

async function fetchJson(fetchImpl: typeof fetch, url: string): Promise<unknown> {
  const response = await fetchImpl(url);
  if (!response.ok) {
    throw new CaseDataError(url, `取得に失敗しました（HTTP ${String(response.status)}）`);
  }
  try {
    return (await response.json()) as unknown;
  } catch {
    throw new CaseDataError(url, 'JSON として読めません');
  }
}

async function fetchBytes(fetchImpl: typeof fetch, url: string): Promise<ArrayBuffer> {
  const response = await fetchImpl(url);
  if (!response.ok) {
    throw new CaseDataError(url, `取得に失敗しました（HTTP ${String(response.status)}）`);
  }
  return response.arrayBuffer();
}

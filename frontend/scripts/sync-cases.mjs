/**
 * cases/ を frontend/public/cases/ にコピーし、事件簿用の index.json を生成する。
 *
 * CASEデータはアプリのコードではなくコンテンツなのでリポジトリ直下に置き、
 * 配信のためにビルド前でここへ複製する（docs/architecture.md §4）。
 * コピー先は生成物なので git に入れない。
 *
 * index.json は **各CASEの metadata.json / story.json から組み立てる**。
 * 手で書くと、CASEを直したときに一覧の難易度や目的数だけ古いまま残る。
 */
import { cp, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { basename, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const frontendRoot = resolve(here, '..');
const source = resolve(frontendRoot, '../cases');
const target = resolve(frontendRoot, 'public/cases');

if (!existsSync(source)) {
  console.error(`cases/ が見つかりません: ${source}`);
  process.exit(1);
}

/**
 * 配信しないファイル。
 *
 * seed.sql は database.sqlite の元ネタで、アプリは読まない。
 * 配信しても害はない（solution.json は元々公開される前提）が、
 * 無駄な転送になるので除く。
 */
const EXCLUDE = new Set(['seed.sql']);

// 消してから入れ直す。CASEを削除・改名したときに古い実体が残らないようにする。
await rm(target, { recursive: true, force: true });
await mkdir(dirname(target), { recursive: true });
await cp(source, target, {
  recursive: true,
  filter: (from) => !EXCLUDE.has(basename(from)),
});

// --- 事件簿の索引 -----------------------------------------------------------

const readJson = async (path) => JSON.parse(await readFile(path, 'utf8'));

const entries = await readdir(source, { withFileTypes: true });
const caseDirs = entries
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort();

const cases = [];
for (const id of caseDirs) {
  const metadata = await readJson(resolve(source, id, 'metadata.json'));
  const story = await readJson(resolve(source, id, metadata.files.story));

  if (metadata.id !== id) {
    console.error(
      `✗ ${id}: metadata.json の id が "${metadata.id}" でディレクトリ名と一致しません`,
    );
    process.exit(1);
  }

  cases.push({
    id: metadata.id,
    title: metadata.title,
    subtitle: metadata.subtitle,
    difficulty: metadata.difficulty,
    estimatedMinutes: metadata.estimatedMinutes,
    sqlConcepts: metadata.sqlConcepts,
    // 進捗の復元判定に使う。索引と本体でずれないよう metadata から取る。
    version: metadata.version,
    // 「n / m 達成」を、CASE本体を読まずに出すために持つ。
    objectiveCount: story.objectives.length,
  });
}

await writeFile(resolve(target, 'index.json'), `${JSON.stringify({ cases }, null, 2)}\n`);

console.log(`synced cases → public/cases（索引 ${cases.length} 件）`);

#!/usr/bin/env node
/**
 * CASE の seed.sql から database.sqlite を生成する。
 *
 *   node tools/build-case-db.mjs cases/case-001
 *   node tools/build-case-db.mjs --check cases/case-001   # 差分があれば失敗
 *
 * seed.sql が唯一の真実で、database.sqlite は生成物。
 * バイナリを直接編集すると差分レビューが不可能になり、人もAIも変更を追えなくなる。
 * --check を CI で走らせ、コミット済みの .sqlite と seed.sql のズレを検出する。
 *
 * @see docs/case-format.md#seedsql-と-databasesqlite
 */
import { createRequire } from "node:module";
import { readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { basename, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// npm プロジェクトは frontend/ の一つだけ。ツールはそこの sql.js を借りる。
// （cases/ はアプリのコードではなくコンテンツなので、リポジトリ直下に置いている）
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(resolve(repoRoot, "frontend/package.json"));
const initSqlJs = require("sql.js");

const args = process.argv.slice(2);
const checkOnly = args.includes("--check");
const caseDirs = args.filter((arg) => !arg.startsWith("--"));

if (caseDirs.length === 0) {
  console.error("usage: node tools/build-case-db.mjs [--check] <case-dir>...");
  process.exit(2);
}

const sqlJs = await initSqlJs({
  locateFile: () => require.resolve("sql.js/dist/sql-wasm.wasm"),
});

let failed = false;

for (const caseDir of caseDirs) {
  const seedPath = resolve(caseDir, "seed.sql");
  const dbPath = resolve(caseDir, "database.sqlite");
  const name = basename(caseDir);

  if (!existsSync(seedPath)) {
    console.error(`✗ ${name}: seed.sql がありません (${seedPath})`);
    failed = true;
    continue;
  }

  const seed = await readFile(seedPath, "utf8");
  const db = new sqlJs.Database();
  try {
    db.run(seed);
  } catch (e) {
    console.error(`✗ ${name}: seed.sql の実行に失敗しました\n  ${String(e)}`);
    db.close();
    failed = true;
    continue;
  }

  // VACUUM で未使用ページを落とし、出力を安定させる。
  db.run("VACUUM;");
  const built = Buffer.from(db.export());
  db.close();

  if (checkOnly) {
    if (!existsSync(dbPath)) {
      console.error(
        `✗ ${name}: database.sqlite が未生成です。build-case-db.mjs を実行してください。`,
      );
      failed = true;
      continue;
    }
    const committed = await readFile(dbPath);
    if (!committed.equals(built)) {
      console.error(
        `✗ ${name}: database.sqlite が seed.sql と一致しません。\n` +
          `  node tools/build-case-db.mjs ${caseDir} を実行してコミットしてください。`,
      );
      failed = true;
      continue;
    }
    console.log(`✓ ${name}: database.sqlite は seed.sql と一致しています`);
    continue;
  }

  await writeFile(dbPath, built);
  console.log(
    `✓ ${name}: database.sqlite を生成しました (${built.length} bytes)`,
  );
}

process.exit(failed ? 1 : 0);

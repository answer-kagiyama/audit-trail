/**
 * 設計書（`docs/cases/<caseId>.md`）と、実際に配るCASEデータのずれを見つける。
 *
 * Objective のタイトルは、いま3か所に書かれている:
 *   1. `cases/<caseId>/story.json` —— **これが正**。player が画面で見る文字列
 *   2. `docs/cases/<caseId>.md` の Objective 一覧の表
 *   3. `frontend/src/game/<caseId>.test.ts` の `describe(...)`
 *
 * 1本にまとめられればよいが、設計書は表の中で「新しく登場するSQL」「得られる
 * 証拠」と並べて読ませたいし、テストの `describe` は実行結果に出したい。
 * どちらも生成物にすると読み書きしづらくなる——ので**写しは許し、ずれだけを
 * 機械が見つける**ことにした。
 *
 * これを書いた時点で、設計書のタイトルは8件ずれていた。設計書だけ読んで
 * CASEを直すと、直したつもりのものが player には別の名前で出ている。
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { allCaseIds } from '../test/caseFixture.ts';
import { parseStory } from './caseLoader.ts';
import type { StoryDoc } from './caseTypes.ts';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');

function storyOf(caseId: string): StoryDoc {
  const path = resolve(repoRoot, 'cases', caseId, 'story.json');
  return parseStory(JSON.parse(readFileSync(path, 'utf8')) as unknown);
}

function read(path: string): string {
  return readFileSync(resolve(repoRoot, path), 'utf8');
}

/** 設計書の Objective 一覧の表から `| **obj-01** | タイトル |` を拾う。 */
function titlesInDesignDoc(markdown: string): Map<string, string> {
  const found = new Map<string, string>();
  for (const line of markdown.split('\n')) {
    const match = /^\|\s*\*\*(obj-\d+)\*\*\s*\|\s*([^|]+?)\s*\|/.exec(line);
    if (match?.[1] && match[2]) found.set(match[1], match[2]);
  }
  return found;
}

/** CASE検証テストの `describe('obj-01 タイトル', ...)` を拾う。 */
function titlesInCaseTest(source: string): Map<string, string> {
  const found = new Map<string, string>();
  for (const match of source.matchAll(/describe\('(obj-\d+) ([^']+)'/g)) {
    if (match[1] && match[2]) found.set(match[1], match[2]);
  }
  return found;
}

describe.each(allCaseIds())('%s', (caseId) => {
  const story = storyOf(caseId);
  const expected = new Map(story.objectives.map((o) => [o.id, o.title]));

  describe('設計書（docs/cases）', () => {
    const doc = titlesInDesignDoc(read(`docs/cases/${caseId}.md`));

    it('Objective 一覧に、実データの Objective がすべて載っている', () => {
      expect([...doc.keys()].sort()).toEqual([...expected.keys()].sort());
    });

    it('Objective のタイトルが story.json と一致する', () => {
      // 差分を1件ずつ読めるように、Map ごと比べる。
      expect(Object.fromEntries(doc)).toEqual(Object.fromEntries(expected));
    });
  });

  describe('CASE検証テストの describe', () => {
    const test = titlesInCaseTest(read(`frontend/src/game/${caseId}.test.ts`));

    it('Objective のタイトルが story.json と一致する', () => {
      expect(Object.fromEntries(test)).toEqual(Object.fromEntries(expected));
    });
  });
});

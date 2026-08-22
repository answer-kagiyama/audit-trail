# architecture.md — アーキテクチャ

## 1. 全体像

MVPは **バックエンドなしの静的SPA**。CASEデータも含め、すべて静的アセットとして配信する。

```
        ┌──────────────── ブラウザ ────────────────┐
        │                                          │
        │  React UI (main thread)                  │
        │   Story / Database / SQLEditor / Result  │
        │            │           ▲                 │
        │            │ sql       │ QueryResult     │
        │            ▼           │                 │
        │  ┌──── Game Core (pure TS) ────────┐     │
        │  │  case loader / progression /    │     │
        │  │  check evaluator / save         │     │
        │  └──────────┬──────────▲───────────┘     │
        │             │          │                 │
        │      SqlEngine interface                 │
        │             │          │                 │
        │  ┌──────────▼──────────┴───────────┐     │
        │  │  Web Worker                     │     │
        │  │   sql.js (SQLite WASM, in-mem)  │     │
        │  └─────────────────────────────────┘     │
        └────────────────┬─────────────────────────┘
                         │ fetch (static)
              ┌──────────▼──────────┐
              │ CDN / 静的ホスティング │
              │  /cases/case-001/*   │
              └─────────────────────┘
```

サーバーは**ファイルを返すだけ**。DBサーバーもAPIサーバーも存在しない。

---

## 2. レイヤ境界（最重要）

将来のPostgreSQL移行を妨げないために、境界は3つだけ厳格に守る。

| レイヤ | 責務 | 依存してよいもの | 禁止 |
|---|---|---|---|
| **engine** | SQL文字列を受けて結果表を返す | SQLite WASM実装 | ゲームの概念（Objective/Evidence等）を一切知らない |
| **game core** | CASE読込・進行・判定・セーブ | `SqlEngine` インターフェース、`QueryResult` 型 | SQLite固有API、React、DOM |
| **ui** | 表示と入力 | game core | SQLエンジンを直接呼ぶこと |

### なぜこの境界か

- **engine を差し替えれば PostgreSQL 対応になる。** game core は `SqlEngine` しか知らないので、
  HTTP経由でサーバー実行する `RemotePostgresEngine` を実装すれば、それ以外は無変更で動く。
- **game core が純粋TSなので、WASMなしでテストできる。** 判定ロジックのユニットテストが
  ブラウザもWASMも起動せずに走る（Vitest / Node環境）。これがテスト戦略の土台。

### SqlEngine インターフェース

```ts
// engine/types.ts — このファイルがSQLエンジン差し替えの契約
export type SqlValue = string | number | boolean | null | Uint8Array;

export interface QueryResult {
  columns: string[];
  rows: SqlValue[][];
  rowCount: number;       // 切り捨て前の総行数
  truncated: boolean;     // maxRows で切り捨てたか
  elapsedMs: number;
}

export interface QueryError {
  kind: 'syntax' | 'no_such_table' | 'no_such_column' | 'timeout' | 'forbidden' | 'unknown';
  rawMessage: string;     // エンジン生メッセージ（デバッグ・表示用に残す）
}

export interface ExecuteOptions {
  timeoutMs?: number;     // 既定 5000
  maxRows?: number;       // 既定 500
}

export interface SqlEngine {
  init(): Promise<void>;
  loadDatabase(bytes: ArrayBuffer): Promise<void>;
  execute(sql: string, opts?: ExecuteOptions): Promise<QueryResult>;  // 失敗時 QueryError を throw
  dispose(): Promise<void>;
}
```

**設計上の注意**: `QueryResult` にSQLite固有の型（BLOB表現、`bigint` 等）を漏らさない。
PostgreSQLでも表現できる形に正規化してから返す。

---

## 3. 技術スタック

| 領域 | 採用 | 補足 |
|---|---|---|
| Framework | React 19 + TypeScript (strict) | |
| Build | Vite | |
| SQL Engine | **sql.js**（Web Worker内） | 選定理由は [ADR-0001](./adr/0001-sql-engine.md) |
| 状態管理 | React標準（useReducer + Context） | Redux/Zustand等は入れない。状態はCASE進行のみで小さい |
| ルーティング | なし（MVPは単一画面） | 複数CASE時に react-router を検討 |
| SQLエディタ | CodeMirror 6 (`@codemirror/lang-sql`) | textarea でも可。[ADR-0003](./adr/0003-editor.md) |
| スタイル | CSS Modules | UIライブラリは入れない |
| Test | Vitest（unit） + Playwright（E2E、Phase 5） | |
| Lint/Format | ESLint + Prettier | |
| Hosting | 静的ホスティング（S3+CloudFront / Cloudflare Pages 等） | |

**依存を増やさない原則**: 上記以外のランタイム依存を追加する場合はADRを書く。

---

## 4. ディレクトリ構成

```
/
├── AGENTS.md
├── README.md
├── docs/
│   ├── vision.md
│   ├── game-design.md
│   ├── architecture.md
│   ├── case-format.md
│   ├── roadmap.md
│   ├── mvp-issues.md
│   ├── adr/
│   └── cases/case-001.md
├── frontend/
│   ├── index.html
│   ├── vite.config.ts
│   ├── public/
│   │   └── cases/            ← ビルド時に /cases からコピー
│   └── src/
│       ├── engine/           ← SQL実行層（ゲームを知らない）
│       │   ├── types.ts          # SqlEngine / QueryResult の契約
│       │   ├── sqlJsEngine.ts    # Worker のクライアント側ラッパー
│       │   ├── worker.ts         # Worker本体（sql.js をここでロード）
│       │   ├── protocol.ts       # Worker との postMessage 型定義
│       │   └── guard.ts          # 読み取り専用ガード
│       ├── game/             ← 純粋TS。React も WASM も知らない
│       │   ├── caseLoader.ts     # CASEアセットの fetch + スキーマ検証
│       │   ├── caseTypes.ts      # CASEデータのTS型
│       │   ├── checks.ts         # 判定ロジック（純関数）
│       │   ├── normalize.ts      # 値の正規化（判定の中核）
│       │   ├── progression.ts    # Objective DAG の状態遷移（純関数）
│       │   ├── errorMap.ts       # SQLエラー → 日本語メッセージ
│       │   └── save.ts           # localStorage シリアライズ
│       ├── ui/
│       │   ├── App.tsx
│       │   ├── StoryPanel/
│       │   ├── DatabasePanel/
│       │   ├── SqlEditor/
│       │   ├── ResultTable/
│       │   └── FinalAnswer/
│       ├── state/
│       │   └── gameReducer.ts    # UI状態 = progression の薄いラッパー
│       └── main.tsx
├── cases/
│   └── case-001/
│       ├── metadata.json
│       ├── story.json
│       ├── schema.json
│       ├── hints.json
│       ├── solution.json
│       ├── seed.sql          ← 正
│       └── database.sqlite   ← seed.sql からビルド生成（コミットする）
├── tools/
│   └── build-case-db.mjs     # seed.sql → database.sqlite
└── tests/
    └── cases/                # CASE検証テスト（各Objectiveが解けることの保証）
```

**`seed.sql` が正で `database.sqlite` が生成物**である点が重要。バイナリを直接編集すると
差分レビューができず、AIエージェントも人間も変更を追えない。
`database.sqlite` はビルド成果物だがコミットする（静的配信のため）。
`tools/build-case-db.mjs` を CI で走らせ、seed と sqlite の不一致を検出する。

---

## 5. SQL実行フロー

```
UI「実行」
  → guard.ts で読み取り専用チェック（同期・main thread）
      → 違反なら即 forbidden エラー（Workerに送らない）
  → Worker へ postMessage { id, sql, timeoutMs, maxRows }
  → main thread 側で timeoutMs のタイマー開始
  ├─ 期限内に応答     → タイマー解除 → QueryResult を返す
  └─ タイムアウト     → worker.terminate() → 新Workerを起動しDB再ロード
                        → timeout エラーを返す
```

### なぜ Web Worker か

sql.js の実行は**同期的**で、main threadで走らせるとクエリ中UIが完全に固まる。
プレイヤーは試行錯誤の中で必ず事故クエリ（意図しないCROSS JOIN等）を書く。
このとき:

- Workerでなければ **タブごとフリーズし、復帰手段がない**
- Workerなら `terminate()` で強制停止でき、DBを再ロードして復帰できる

タイムアウトの実現手段が `terminate()` しかないため、Workerは
「パフォーマンス最適化」ではなく **必須の安全機構**。

### Worker再起動のコスト

CASE DBは数百KB規模なので、`ArrayBuffer` をmain thread側に保持しておけば
再ロードは数十ms。DBは読み取り専用なので状態の復元は不要（再ロードで完全に元通り）。

---

## 6. クエリガード

ゲーム上不要な文を実行前に拒否する（[game-design.md §5](./game-design.md#5-エラーとフィードバックのux)）。

**方針: 許可リスト方式。** 拒否リストは必ず抜ける。

- 先頭トークンが `SELECT` または `WITH` の場合のみ許可
- `;` で区切られた複数文は最初の1文のみ許可（2文目以降があればエラー）
- 加えて **多層防御**として、sql.js の `db` を開いた後に
  `PRAGMA query_only = ON;` を実行する（Worker内）。
  文字列解析をすり抜けても実際の書き込みは失敗する。

ガードは**セキュリティ機能ではなくゲームルール**であることを明記する。
ブラウザ内DBなので、DevToolsから直接叩けば何でもできる。それは前提として受け入れる
（[vision.md §6](./vision.md#6-意図的に受け入れる制約)）。

---

## 7. 判定の実行位置

**判定は main thread の game core で行う。Workerでは行わない。**

- Workerは「SQLを実行して結果を返す」だけ。ゲームを知らない（レイヤ境界のとおり）
- 判定は純関数 `evaluateChecks(result, objectives) → ObjectiveId[]` として実装し、
  WASMなしでユニットテストできる状態を保つ

正解データ（`solution.json`）はクライアントに配信されるため、判定をどこでやっても
秘匿性は変わらない。ならばテストしやすい場所に置く。

---

## 8. CASEデータの読み込み

```
起動
 → fetch /cases/<caseId>/metadata.json
 → metadata の files 一覧に従い story/schema/hints/solution を並列 fetch
 → JSONスキーマ検証（不正なら明示的にエラー画面。黙って壊れない）
 → fetch /cases/<caseId>/database.sqlite (ArrayBuffer)
 → engine.loadDatabase(bytes)
 → localStorage からセーブ復元（caseVersion 不一致なら破棄）
 → 初期Objectiveをactiveに
```

`solution.json` を**遅延ロードしない**（配信済みである事実は変わらないので、
分割しても秘匿にはならず、複雑さだけが増す）。

---

## 9. PostgreSQL移行の道筋（MVPでは実装しない）

将来サーバー実行に切り替える場合に触る場所:

1. `engine/` に `RemotePostgresEngine implements SqlEngine` を追加
2. CASEデータに `dialect: 'sqlite' | 'postgres'` を追加し、`seed.sql` を方言別に用意
3. `solution.json` の期待値は**方言に依存しない**（結果の値のみを持つため）ので原則そのまま

サーバー側で必要になる対策（MVPでは不要）:

- 読み取り専用ロール + CASE専用スキーマ
- `statement_timeout` / `SET LOCAL`
- 行数上限
- レート制限
- コネクションプール

**MVPで守るべきことは1つだけ**: game core が `SqlEngine` 以外のSQL実行手段を持たないこと。
これさえ守れば移行はengine層の追加で済む。

---

## 10. テスト戦略

| 層 | 手段 | 対象 |
|---|---|---|
| game core | Vitest（Node） | 判定・正規化・進行DAG・エラーマップ・セーブ。**WASM不要で高速** |
| engine | Vitest（Node + sql.js） | ガード、タイムアウト、結果正規化。sql.jsはNodeでも動く |
| CASE検証 | Vitest（Node + sql.js） | **各Objectiveについて、複数の書き方のSQLが同じ判定結果になること**（下記） |
| UI | Playwright（Phase 5） | 開始→クリアの通しシナリオ1本 |

### CASE検証テストが最重要

CASEを追加・修正するたびに、以下を自動で保証する:

- 各Objectiveに対して用意した **正解例SQLを2〜3通り**（素朴な書き方 / JOIN版 / サブクエリ版）
  が全て達成判定される
- 各Objectiveに対して **不正解例SQL** が達成判定されない
- 最終回答の正解が受理され、各誤答候補が拒否される

これがないと「CASEデータを直したらクリアできなくなった」が検出できない。
CASE作成タスクの完了条件にこのテストを含める。

---

## 11. パフォーマンス方針

- CASE DBは **1MB以下 / 数千行以下** を目安にする
- 初回ロード: sql.js wasm（約1MB強）+ DB。ローディング表示を出す
- 結果表は500行で打ち切り（仮想スクロールはMVPでは入れない）
- 実行タイムアウト 5秒

# mvp-issues.md — MVP実装タスク分解

**1 Issue = 1つの明確な成果物。** 依存関係順に並べてある。
各Issueは「実装前に計画を出す → 実装 → lint/typecheck/test/build → レビュー」で進める。

凡例: `⛔` = 先に完了が必要なIssue / `🔀` = 並行着手可

---

## Phase 1: 技術PoC

### #1 プロジェクト初期化（Vite + React + TypeScript） ✅
- **成果物**: `frontend/` に Vite + React 19 + TS(strict) の雛形。ESLint / Prettier / Vitest 設定
- **完了条件**: `npm run dev` / `lint` / `typecheck` / `test` / `build` が全て動く。ダミーテスト1本が緑
- **スコープ外**: UIの見た目、CI

### #2 CI を用意する ✅
- **成果物**: GitHub Actions で `lint` / `typecheck` / `test` / `build` を実行
- **完了条件**: PRでCIが走り、失敗が検知される
- ⛔ `#1`

### #3 `SqlEngine` インターフェースを定義する ✅
- **成果物**: `engine/types.ts` — `SqlEngine` / `QueryResult` / `QueryError` / `ExecuteOptions`
- **完了条件**: 型定義のみ。実装なし。sql.js の型が一切露出していない
- **参照**: [architecture.md §2](./architecture.md#2-レイヤ境界最重要)
- ⛔ `#1`

### #4 sql.js を Web Worker でロードし SELECT を実行する ✅
- **成果物**: `engine/worker.ts`, `engine/sqlJsEngine.ts`, `engine/protocol.ts`。
  `.wasm` を `public/` に配置し `locateFile` で解決
- **完了条件**: 固定の `.sqlite` を fetch → `loadDatabase` → `SELECT 1` の結果が
  `QueryResult` として返る。画面に生JSONで出るだけでよい
- **スコープ外**: タイムアウト、ガード、UI
- ⛔ `#3`

### #5 実行タイムアウトと Worker 再起動 ✅
- **成果物**: `execute` の `timeoutMs`。超過で `worker.terminate()` → 新Worker起動 → DB再ロード
- **完了条件**: 意図的な暴走クエリ（大きなCROSS JOIN）が5秒で中断され、
  **その後も続けてクエリを実行できる**。ユニットテストあり
- **これは最適化ではなく必須の安全機構**（[architecture.md §5](./architecture.md#5-sql実行フロー)）
- ⛔ `#4`

### #6 Node環境で sql.js を動かすテスト基盤 ✅
- **成果物**: Vitest から sql.js を叩けるヘルパー（CASE検証テストの土台）
- **完了条件**: Node上で `.sqlite` を読んで `SELECT` した結果をアサートするテストが緑
- ⛔ `#4`

> **Phase 1 完了時に [ADR-0001](./adr/0001-sql-engine.md) を再評価する。**
> → **再評価済み: sql.js 採用を維持。** 統合に想定外の困難はなかった
> （`?url` インポートで wasm が解決でき、Worker は `format: 'es'` のみ、
> COOP/COEPヘッダ不要）。[roadmap.md](./roadmap.md#phase-1-技術poc--完了) 参照。

---

## Phase 2: UI ✅ 完了

### #7 読み取り専用ガード（許可リスト方式） ✅
- **成果物**: `engine/guard.ts` + Worker側の `PRAGMA query_only = ON`
- **完了条件**: 先頭が `SELECT`/`WITH` 以外を拒否、複文を拒否。
  拒否メッセージは世界観に沿った日本語。ユニットテストあり
- ⛔ `#4`

### #8 SQLエラーの日本語化 ✅
- **成果物**: `game/errorMap.ts` — SQLiteエラー → `QueryError.kind` + 日本語メッセージ。
  テーブル名/カラム名のtypoに「もしかして」を出す（レーベンシュタイン距離）
- **完了条件**: [game-design.md §5](./game-design.md#5-エラーとフィードバックのux) の
  4パターンすべてにテストがある
- ⛔ `#3` 🔀

### #9 UI基盤（デザイントークン + レイアウト + Base UI） ✅
- **成果物**:
  - `styles/tokens.css` — 色・間隔・フォント・角丸のCSSカスタムプロパティ
  - `ui/App.tsx` と4領域のプレースホルダ。デスクトップ2カラム / モバイルタブ切替
  - Base UI 導入（このIssueで使うのは **Tabs のみ**）
- **完了条件**: レスポンシブに切り替わる。中身は空でよい。
  ハードコードされた色・間隔がCSS Modules内に存在しない
- **制約**: Base UI から「あるから」という理由で他の部品を入れない
  （[ADR-0005](./adr/0005-ui-styling.md)）
- ⛔ `#1` 🔀

### #10 SQL Editor コンポーネント ✅
- **成果物**: `ui/SqlEditor/`。CodeMirror 6 + `@codemirror/lang-sql`。
  実行ボタン + `Cmd/Ctrl+Enter`。**クエリ履歴**（↑キー or リスト）
- **完了条件**: SQLを書いて実行イベントを発火できる。履歴を遡れる
- **フォールバック**: CodeMirror導入が難航したら textarea にする
  （[ADR-0003](./adr/0003-editor.md)）。これでPhase 2をブロックしない
- ⛔ `#9`

### #11 Result（結果表）コンポーネント ✅
- **成果物**: `ui/ResultTable/`。列ヘッダ固定、横スクロール、
  **NULLをグレーの `NULL` 表示**、行数・実行時間、500行で打ち切り表示、エラー表示
- **完了条件**: 正常結果・空結果・エラー・500行超過の4状態が正しく描画される
- ⛔ `#9`, `#8`

### #12 Database パネル（テーブル詳細ビュー） ✅
- **成果物**: `ui/DatabasePanel/TableDetail/`。`schema.json` を描画。
  テーブル説明・列/型/説明/NULL可否/PK・FKの別・**サンプル行3件**
- **完了条件**: [case-format.md §4](./case-format.md#4-schemajson) の全項目が表示される
- **MVPで最も手を抜いてはいけない画面**（ここが貧弱だとプレイヤーは詰む）
- ⛔ `#9`

### #13 ER図ビューア ✅
- **成果物**: `ui/DatabasePanel/ErDiagram/`。`schema.json` の
  `erLayout` / `relations` / `erCanvas` から**インラインSVG**を描画
- **完了条件**:
  - テーブルの箱に **PK/FK列だけ**が表示される（全列は描かない）
  - リレーションが**クロウズフット記法**＋**日本語ラベル**付きで描かれる
  - 線は直交折れ線（L字）。ベジエは使わない
  - **箱クリック** → #12 のテーブル詳細が開く
  - **線ホバー** → 両端のカラムをハイライト
  - モバイルでピンチズーム／パンできる（`viewBox` 操作）
  - `schema.json` を入力とする純粋な描画なので、**スナップショットテストがある**
- **制約**: 図描画ライブラリ・自動レイアウトを**入れない**。
  座標はCASEデータが持つ（[case-format.md §4.1](./case-format.md#41-er図のレイアウト)）
- **なぜ必要か**: ER図を読むことがJOINを書く前提の思考であり、
  **ER図の読み方を学ぶこと自体を副次的な価値として意図している**
  （[game-design.md §4](./game-design.md#database-画面)）
- ⛔ `#12`

### #14 UI と engine を繋ぐ（自由SQL実行が通しで動く） ✅
- **成果物**: エディタ実行 → ガード → Worker → 結果表、の一気通貫
- **完了条件**: ダミー `.sqlite` に対して自由にSQLを書き、結果とエラーが画面に出る。
  暴走クエリがタイムアウトして復帰できる。ER図とテーブル詳細が表示されている
- ⛔ `#5`, `#7`, `#10`, `#11`, `#13`

---

## Phase 3: CASE 001

### #15 CASE DB ビルドツール
- **成果物**: `tools/build-case-db.mjs`（`seed.sql` → `database.sqlite`）+
  CIでの再生成・差分検出
- **完了条件**: コマンド1発で生成でき、コミット済みsqliteと不一致ならCIが落ちる
- ⛔ `#2`, `#6`

### #16 CASE 001 の seed.sql を作る
- **成果物**: `cases/case-001/seed.sql`。employees(12) / transactions(~200) /
  login_logs(~400) / access_logs(~300)。
  [case-001.md §2](./cases/case-001.md#2-テーブル設計) の鍵となる行を含む
- **完了条件**: ビルドが通り、
  [case-001.md §4](./cases/case-001.md#4-難易度上のノイズ意図的に混ぜるもの) の
  ノイズがすべて入っている。DBサイズ1MB以下
- ⛔ `#15`

### #17 CASE 001 のメタデータとスキーマ記述（ER図定義を含む）
- **成果物**: `metadata.json`, `schema.json`
- **完了条件**:
  - `sampleRows` が実データと一致。列挙値が `description` に明記されている
  - 全FK列に `key: "fk"`、PK列に `key: "pk"`
  - `relations` に3本すべて（cardinality + 日本語ラベル付き）
  - `erLayout` / `erCanvas` を指定し、`employees` を中心とした放射状配置になっている
  - **`schema.json` と実DBの一致を検証するテスト**（`PRAGMA table_info` と突き合わせ）
- ⛔ `#16`

### #18 CASE 001 のストーリーテキスト
- **成果物**: `story.json`（prologue / objectives 7件 / evidence / storyBeats / epilogue）
- **完了条件**: `brief` に「どう書くか」が書かれていない。
  epilogueが証拠を引用して真相を説明している
- ⛔ `#17`

### #19 CASE 001 の判定条件と最終回答
- **成果物**: `solution.json`（checks 7件 + finalAnswer）
- **完了条件**: [case-001.md §3](./cases/case-001.md#3-objective-一覧) の表どおり。
  obj-05 のみ `columnValues` + `exact: true`
- ⛔ `#18`

### #20 CASE 001 のヒント
- **成果物**: `hints.json`。全7Objectiveに3段階
- **完了条件**: level 3 でも正解SQLそのものを書いていない。用意漏れなし
- ⛔ `#18`

### #21 CASE 001 検証テスト
- **成果物**: `tests/cases/case-001.test.ts`
- **完了条件**: 各Objectiveについて**正解例SQL 2〜3通り**が全て達成判定され、
  **不正解例**が達成判定されない。最終回答の正解が受理され誤答が拒否される。
  ER図定義の整合性チェック（[case-format.md §4.2](./case-format.md#42-er図の検証)）も通る
- **これがないとPhase 3は完了しない**
- ⛔ `#19`, `#23`

---

## Phase 4: 進行・判定

### #22 CASEローダーとスキーマ検証
- **成果物**: `game/caseTypes.ts`, `game/caseLoader.ts`
- **完了条件**: 不正なCASE JSONを黙って受理せず、明示的なエラーにする。テストあり
- ⛔ `#3` 🔀（Phase 2と並行可）

### #23 判定エンジン（normalize + checks）
- **成果物**: `game/normalize.ts`, `game/checks.ts`。
  `containsRows` / `resultSet` / `columnValues` の3タイプ
- **完了条件**: [case-format.md §5.3](./case-format.md#53-値の正規化ルール実装が必ず従うこと) の
  正規化表の**全行にテストがある**（特に NULL vs 空文字、`1000000` vs `"1000000"`）
- **純関数。WASM不要でテストできること**
- ⛔ `#22`

### #24 Objective DAG の進行ロジック
- **成果物**: `game/progression.ts`（純関数）
- **完了条件**: prerequisites による active 判定、複数同時達成、
  prerequisites 未達成なら結果一致でも達成しないこと、にテストがある
- ⛔ `#23`

### #25 セーブ / ロード / リセット
- **成果物**: `game/save.ts` + localStorage（キー `audit-trail:progress:v1:<caseId>`）
- **完了条件**: リロードで進捗復元。`metadata.version` 不一致でセーブを破棄。
  リセットボタン（確認ダイアログ = Base UI Dialog）。テストあり
- ⛔ `#24`

### #26 Story パネル（目的・証拠・ヒント）
- **成果物**: `ui/StoryPanel/`。事件概要 / activeな目的 / 獲得証拠 / 段階ヒント開示
- **完了条件**: 証拠獲得時に視覚的な変化がある。ヒントが1段階ずつ開く
- ⛔ `#24`, `#9`

### #27 最終回答フォームとクリア画面
- **成果物**: `ui/FinalAnswer/`。構造化フォーム（select）+ 判定 + エピローグ表示 +
  プレイ記録（時間 / クエリ数 / ヒント数）
- **完了条件**: 不正解時は回数制限なしで再挑戦でき、どこが違うかは言わない。
  正解でエピローグが出る
- ⛔ `#24`

### #28 全部繋いで CASE 001 を通しでクリアできるようにする
- **成果物**: ローダー → 進行 → 判定 → UI → クリア の統合
- **完了条件**: **人間が CASE 001 を最初から最後まで実際にプレイしてクリアできる**
- **MVPの山場**
- ⛔ `#14`, `#20`, `#21`, `#25`, `#26`, `#27`

---

## Phase 5: 品質

### #29 ローディングとエラー画面
- **完了条件**: WASMロード失敗 / CASEデータ取得失敗 / JSON不正、の3状態で
  ユーザーに何が起きたか分かる画面が出る
- ⛔ `#28`

### #30 E2E テスト（開始 → クリア）
- **成果物**: Playwright で通しシナリオ1本
- **完了条件**: CIで走る
- ⛔ `#28`

### #31 アクセシビリティ
- **完了条件**: キーボードのみで一通り操作できる。証拠獲得を `aria-live` で通知。
  コントラスト比を満たす。フォーカスリングが見える。
  **ER図に代替表現**（リレーションのテキスト一覧）がある
- **補足**: Dialog/Tabs/Tooltip/Toast は Base UI が担保するので、
  ここで作り込むのは**自作部品**（結果表・ER図・エディタ）に絞られる
  （[ADR-0005](./adr/0005-ui-styling.md)）
- ⛔ `#28`

### #32 モバイル実機確認と初回ロード最適化
- **完了条件**: 実機で遊べる（ER図のピンチズーム含む）。初回ロード時間を計測し、
  ローディング表示が機能している
- ⛔ `#28`

---

## Phase 6: 公開

### #33 静的ホスティングへのデプロイ
- **完了条件**: CIから自動デプロイされ、公開URLで遊べる
- ⛔ `#30`

### #34 実プレイテスト
- **完了条件**: SQL中級者を含む3〜5人が完走。Objective別の所要時間とヒント使用率を記録。
  **ER図を実際に見ているか / 役に立っているか**を観察する
- ⛔ `#33`

### #35 プレイテスト結果を受けた CASE 001 の調整
- **完了条件**: 詰まりどころのヒント強化 / ノイズ量の調整 / ER図レイアウトの改善。
  DoD を全て満たす
- ⛔ `#34`

---

## クリティカルパス

```
#1 ─┬→ #3 → #4 ─┬→ #5 ──────────────┐
    │            ├→ #6 → #15 → #16 → #17 → #18 ─┬→ #19 ┐
    │            └→ #7 ────────────┐            └→ #20 ┤
    ├→ #2 ───────────────────────┐ │                    │
    └→ #9 ─┬→ #10 ───────────────┼─┤                    │
           ├→ #11 ───────────────┼─┤                    │
           └→ #12 → #13 ─────────┴─┴→ #14 ┐             │
                                            │             │
        #3 → #22 → #23 ─┬→ #24 ─┬→ #25 ────┤   #19+#23 → #21
                        │        ├→ #26 ────┤             │
                        └─ #21   └→ #27 ────┴─────────────┴→ #28
                                                              │
                                              #29 / #30 / #31 / #32
                                                              │
                                                    #33 → #34 → #35
```

最短で価値を確認したいなら **#28（通しでクリアできる）** を最優先の里程標にする。
Phase 5 の項目は #28 の後なら順不同で並行できる。

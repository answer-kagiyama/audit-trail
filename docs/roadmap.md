# roadmap.md — ロードマップ

原則: **設計 → 小さく実装 → テスト → レビュー** のループ。
「全部作って」を1回投げるのではなく、フェーズごとに動くものを確認する。

---

## Phase 0: 仕様・設計 ✅ 完了

| 成果物 | 状態 |
|---|---|
| [vision.md](./vision.md) | ✅ |
| [game-design.md](./game-design.md) | ✅ |
| [architecture.md](./architecture.md) | ✅ |
| [case-format.md](./case-format.md) | ✅ |
| [adr/](./adr/) 0001–0004 | ✅ |
| [adr/0005](./adr/0005-ui-styling.md)（UI方針） | ✅ |
| [cases/case-001.md](./cases/case-001.md)（CASE 001仕様） | ✅ |
| [AGENTS.md](../AGENTS.md) | ✅ |
| [mvp-issues.md](./mvp-issues.md)（依存関係順のIssue分解） | ✅ |

**このフェーズではコードを書かない。** 人間のレビューを受けてから Phase 1 へ進む。

---

## Phase 1: 技術PoC ✅ 完了

**目的**: SQLite WASM がブラウザで動き、静的 `.sqlite` を読んで `SELECT` できることを実証する。

- Vite + React + TS のプロジェクト初期化
- sql.js を **Web Worker** でロード
- 静的 `.sqlite` を fetch → `loadDatabase` → `SELECT` 実行 → 結果表示
- `SqlEngine` インターフェースの確定
- タイムアウト（`terminate()` + Worker再起動）の動作確認
- Node上でも sql.js が動き、Vitestから叩けることの確認

**完了条件**: ブラウザで固定SQLを実行して結果が画面に出る。暴走クエリが5秒で中断され、
その後も続けて実行できる。CIでテストが緑。

**結果**: 実 Chromium で検証済み — 起動 → SELECT → 暴走クエリが 5,076ms で中断 →
その後もクエリ実行を継続。ユニットテスト16本が緑。

**ADR-0001 の再評価**: sql.js の統合に想定外の困難はなかった。
`sql.js/dist/sql-wasm.wasm?url` を Vite が解決し、Worker も `format: 'es'` のみで動作。
COOP/COEPヘッダは不要。**sql.js 採用を維持する。**

**この時点でADR-0001を再評価する。** 統合が想定より難航したら
`@sqlite.org/sqlite-wasm` への切替を検討する（この判断のためにPhase 1を先頭に置いている）。

---

## Phase 2: UI ✅ 完了

**目的**: 4画面の骨格。ゲームロジックはまだ入れない。

- デザイントークン（`styles/tokens.css`）と Base UI 導入（[ADR-0005](./adr/0005-ui-styling.md)）
- Story / Database / SQL Editor / Result のレイアウト
- **ER図ビューア**（`schema.json` からインラインSVG）
- CodeMirror 6 導入（難航したら textarea にフォールバック → [ADR-0003](./adr/0003-editor.md)）
- 結果表（NULL表示、行数上限、実行時間）
- SQLエラーの日本語化（`errorMap.ts`）
- 読み取り専用ガード
- クエリ履歴
- レスポンシブ（デスクトップ2カラム / モバイルタブ）

**完了条件**: ダミーCASEデータで、自由にSQLを書いて結果とエラーを確認できる。
ER図が描画され、テーブルをクリックすると詳細が開く。

**結果**: 実 Chromium で17項目を検証済み。ユニットテスト95本が緑。
ダミーCASEは CASE 001 と同じ4テーブル放射状構成にしたので、
Phase 3 で本番データに差し替えても図の形は変わらない。

---

## Phase 3: CASE 001

**目的**: 事件のデータとテキストを作り切る。

- `seed.sql`（employees / transactions / login_logs / access_logs）
- `tools/build-case-db.mjs`
- `metadata.json` / `story.json` / `schema.json` / `hints.json` / `solution.json`
- **CASE検証テスト**（各Objectiveに正解例SQL 2〜3通り + 不正解例）

**完了条件**: [case-format.md §8](./case-format.md#8-case追加時のチェックリスト) の
チェックリストがすべて埋まる。UIがなくてもテストだけでCASEの整合性が保証される。

---

## Phase 4: 進行・判定

**目的**: Phase 2 のUIと Phase 3 のデータを繋いで、ゲームとして成立させる。

- CASEローダー + JSONスキーマ検証
- 判定エンジン（`checks.ts` / `normalize.ts`）
- Objective DAG の進行（`progression.ts`）
- 証拠獲得の演出とStory更新
- ヒントの段階開示
- 最終回答フォーム + クリア画面
- localStorage セーブ / リセット / version不整合の破棄

**完了条件**: **CASE 001 を最初から最後まで通しでクリアできる。**
これがMVPの山場。

---

## Phase 5: 品質

- Playwright E2E（開始→クリアの通し 1本）
- ローディング / エラー画面（CASEデータ取得失敗、WASMロード失敗）
- アクセシビリティ（キーボード操作、フォーカス、コントラスト、`aria-live` で証拠獲得を通知）
- モバイル実機確認
- 初回ロード時間の計測と改善

---

## Phase 6: 公開

- 静的ホスティングへのデプロイ（CI）
- **実プレイテスト**（3〜5人。SQL中級者を含む）
- 詰まりどころの計測（ヒント使用率、Objective別所要時間）
- フィードバックを受けてCASE 001を調整

**完了条件**: 第三者が完走できる。

---

## Phase 7 以降（MVPの外）

- CASE 002以降（CTE / Window Function を扱う難易度帯）
- CASE選択画面
- PostgreSQL実行エンジン（[architecture.md §9](./architecture.md#9-postgresql移行の道筋mvpでは実装しない)）
- アカウント・進捗のサーバー同期
- サーバー判定モードと競技性

---

## Definition of Done

MVPの完了条件（引き継ぎ資料 §16 に対応）。

- [ ] CASEを開始できる
- [ ] 事件ストーリーを読める
- [ ] テーブル・カラム情報を確認できる
- [x] **ER図でテーブル間のリレーションを確認できる**
- [ ] SQLを書いて実行できる
- [ ] SQL結果を表形式で確認できる
- [ ] SQLエラーを理解可能な形で表示できる
- [ ] 正しい結果を取得すると証拠・イベントが発生する
- [ ] 調査を複数段階進められる
- [ ] 最終回答を入力できる
- [ ] 正解するとクリア画面が表示される
- [ ] CASE 001を最初から最後までプレイできる
- [ ] 主要なゲームロジックの自動テストがある
- [ ] 静的ホスティングで動作する

**追加（設計時に判明した必須項目）**

- [ ] 暴走クエリがタイムアウトで中断され、その後も遊び続けられる
- [ ] 書き込み系SQLが世界観に沿ったメッセージで拒否される
- [ ] リロードしても進捗が復元される
- [ ] CASEデータ変更時に、古いセーブで詰まない（version破棄が機能する）
- [ ] CASE検証テストがCIで走っている
- [ ] `schema.json` と実DBの不一致がCIで検出される

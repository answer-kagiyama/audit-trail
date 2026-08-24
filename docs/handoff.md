# handoff.md — 開発引き継ぎ資料（原本）

> **この資料はプロジェクト開始時に ChatGPT で構想を練って作成された、最初の指示書である。**
> 元は Word ファイル（`.docx`）として Claude Code に渡され、これを読んだ Claude が
> Phase 0 として `vision.md` 以下の設計資料一式を書き起こした。
>
> **内容は当時のまま残している（歴史的記録）。** その後の判断で変わった点がある:
>
> - プロダクト名は `sql-mystery` → `Audit Trail`（監査証跡）→ **`WHERE`** に変わった
>   （経緯は [vision.md §0](./vision.md#0-プロダクト名) を参照）
> - §14 の CASE 001 たたき台は、実装時に「送金者本人ではなく、認証情報を盗用した
>   人物が真犯人」という展開に具体化された（[cases/case-001.md](./cases/case-001.md) を参照）
> - §10 のリポジトリ構成案は `tools/` の追加など細部が変わっている
>   （実際の構成は [architecture.md §4](./architecture.md#4-ディレクトリ構成)）
>
> **現在のプロダクト方針を知りたい場合はこの資料ではなく [vision.md](./vision.md) を読むこと。**
> ここは「最初に何を渡されて、そこから何が変わったか」を追うための記録。

---

## 1. プロダクト概要

ブラウザ上でユーザーが実際にSQLを書き、架空の事件に関するデータベースを調査し、謎を解いてストーリーを進める推理ゲーム。SQLを学ぶこと自体を目的にするのではなく、SQLをゲーム内の「調査手段」として扱う。

- 事件のストーリーを読む
- 利用可能なテーブル・カラムを確認する
- SQLを書く・実行する
- 結果から証拠や手掛かりを発見する
- 調査を進める
- 最終的に事件の真相・犯人などを回答する

## 2. MVP方針

- まず1つのCASEを最初から最後まで遊べる状態にする。複数事件・ランキング・認証・課金などは後回し。
- SQL実行エンジンはSQLite WASM。CASE専用SQLite DBをブラウザ内で実行する。
- MVPでは原則バックエンドなし。CASEデータも静的アセットとして配信する。
- CASEデータは基本的に読み取り専用。
- 正解SQLの文字列比較はしない。期待する結果・証拠・ゲームイベントを判定する。
- SQLの難易度はSELECT/WHERE → JOIN → GROUP BY/HAVING → サブクエリ → CTE → Window Function等へ段階的に上げられる設計にする。

## 3. 想定ユーザーフロー

1. CASE開始：事件概要と最初の手掛かりを読む。
2. Database画面でschemaを確認する。
3. SQLエディタで調査用SQLを書く。
4. 実行して結果を表形式で確認する。
5. 結果から手掛かりを見つける。
6. 必要に応じてJOIN等を使い、人物・取引・時刻などを関連付ける。
7. 条件を満たすと証拠を獲得し、ストーリーが進む。
8. 最終回答を入力して事件を解決する。

## 4. 技術方針

| 領域 | 方針 |
|---|---|
| Frontend | React + TypeScript + Vite |
| SQL Engine | SQLite WASM。sql.js / @sqlite.org/sqlite-wasm等を技術PoCで比較して決定 |
| CASE DB | CASEごとのSQLite DB、またはSQL/seedから生成 |
| Backend | MVPでは原則なし |
| Progress | MVPではlocalStorage等。アカウント機能は後回し |
| Test | Vitest等。SQL/CASE検証も自動化 |
| Hosting | 静的ホスティング。将来的にS3/CloudFront等 |

## 5. SQLite WASMを選ぶ理由

- CASEデータは固定・読み取り専用なのでブラウザ内DBと相性がよい。
- SQL実行のたびにサーバーへ問い合わせる必要がない。
- DBサーバー費用をほぼゼロにできる。
- SQL実行APIやDB接続管理が不要。
- ユーザーSQLをサーバーDBへ直接流すセキュリティ問題をMVPで大幅に減らせる。
- SELECT / WHERE / ORDER BY / GROUP BY / HAVING / JOIN / サブクエリ / CTE / Window Functionなど主要なSQLはSQLiteでもかなり扱える。

注意：PostgreSQL固有機能、型システム、日付処理などには差がある。MVPではSQLite SQLを使用するゲームとして仕様化し、将来PostgreSQLへ切り替えられるようゲーム進行とSQL実行エンジンを分離する。

## 6. CASEデータ設計案

- metadata：CASE ID、タイトル、難易度、対象SQL概念、クリア条件など。
- story：プロローグ、各調査段階、証拠、次の目的。
- schema：テーブル名、カラム名、型、説明。
- database：SQLite DBまたは初期化SQL/seed。
- hints：段階的ヒント。
- solution：期待する結果・証拠・進行条件。正解SQLそのものに依存しない。

例：

```
case-001/
├── metadata.json
├── story.json
├── schema.json
├── database.sqlite
├── hints.json
└── solution.json
```

## 7. 正解判定

SQL文字列ではなく結果を判定する。例えば次の2つは同じ結果なら正解とする。

```sql
SELECT name FROM employees WHERE id = 3;
SELECT e.name FROM employees e WHERE e.id = 3;
```

MVPでは期待する列・行・値を正規化して比較する方式を推奨。将来的には「証拠を発見した」「特定条件を満たした」といったゲームイベント型の判定へ拡張する。

**重要：** ブラウザへ配信したCASE DBや静的JSONはユーザーがDevToolsで見られる。完全に秘匿したい正解情報はクライアントに配信しない。

## 8. MVPの画面

- Story：事件概要、現在の目的、発見済み証拠。
- Database：テーブル一覧、カラム、型、説明。
- SQL Editor：SQL入力欄と実行ボタン。
- Result：結果表、SQLエラー、実行時間等。

## 9. セキュリティ

- MVPはブラウザ内SQLiteなので、サーバーDBへの攻撃面がほぼない。
- ゲームDBは読み取り専用として扱う。
- INSERT/UPDATE/DELETE等をゲーム上不要なら拒否する。
- DevToolsでCASE DBを見られることは前提にする。
- 将来サーバー側SQL実行へ移行する場合は、DB権限、statement timeout、row limit、schema分離等を実施する。

## 10. リポジトリ構成案

```
sql-mystery/
├── AGENTS.md
├── README.md
├── docs/
│   ├── vision.md
│   ├── game-design.md
│   ├── architecture.md
│   ├── case-format.md
│   └── roadmap.md
├── frontend/
├── cases/
│   └── case-001/
└── tests/
```

## 11. AIエージェント開発の進め方

| Phase | 目的 | 成果物 |
|---|---|---|
| 0 | 仕様・設計 | PRD、ゲームデザイン、アーキテクチャ、CASE仕様、AGENTS.md |
| 1 | 技術PoC | SQLite WASMをロードしてSELECTを実行する最小実装 |
| 2 | UI | Story / Database / SQL Editor / Result |
| 3 | CASE 001 | 30〜60分程度で遊べる事件1本 |
| 4 | 進行・判定 | 証拠、調査目的、ヒント、最終回答、クリア |
| 5 | 品質 | テスト、UX、エラー表示、レスポンシブ、アクセシビリティ |
| 6 | 公開 | 静的ホスティング、実プレイテスト |

## 12. Claude Codeへの最初の指示

> このプロジェクトは、ブラウザ上でユーザーがSQLを書いて架空の事件を調査し、謎を解いてストーリーを進めるWebゲームです。まず実装を開始しないでください。
>
> 1. プロダクトの目的とMVP範囲を整理する。
> 2. React + TypeScript + Viteを前提に、SQLite WASMをブラウザ内で実行するアーキテクチャを検討する。
> 3. sql.js と @sqlite.org/sqlite-wasm 等を比較し、このゲームに適した実装を選定する。
> 4. `docs/vision.md`
> 5. `docs/game-design.md`
> 6. `docs/architecture.md`
> 7. `docs/case-format.md`
> 8. `docs/roadmap.md`
> 9. `AGENTS.md`
>
>    を作成する。
> 10. 最後にMVP実装タスクを依存関係順に分解し、GitHub Issueにできる粒度で提示する。
>
> 制約：
> - MVPではバックエンドを原則作らない。
> - SQL実行はブラウザ内SQLite WASM。
> - CASEデータは静的アセット。
> - SQL文字列を正解判定しない。結果・証拠・ゲームイベントを判定する。
> - 将来的なPostgreSQL実行エンジン追加を妨げない境界を設計する。
> - 過剰なライブラリや複雑なアーキテクチャは避ける。
> - この段階ではコードを書かず、設計資料をレビュー可能な状態にする。

## 13. Claude Codeへの次の指示例

### 技術PoC

> 設計資料を読み、SQLite WASMをブラウザで初期化し、CASE用SQLite DBをロードしてSELECTを実行し、結果を取得する最小PoCを実装してください。実装前に変更計画を提示し、実装後にテストを実行してください。

### UI

> 設計資料を読み、MVPのStory / Database / SQL Editor / Result画面を実装してください。まず現在のコードを確認し、最小変更を計画してから実装してください。

### CASE

> CASE 001の仕様に従い、schema・seed data・story・hints・solutionを実装してください。複数のSQL書き方で同じ正解に到達できることを検証してください。

### レビュー

> 実装をゲームとしてレビューしてください。SQL実行、正解判定、CASEデータと秘密情報の分離、UX、テスト不足、将来のPostgreSQL移行可能性の観点で問題点を重要度順に列挙してください。コード変更はレビュー後に行ってください。

## 14. CASE 001のたたき台

- タイトル：消えた100万円
- テーマ：社内システムから不正送金された100万円の調査。
- テーブル候補：employees / transactions / login_logs
- 導入：深夜02:14に1,000,000円の送金が発生。
- 調査1：高額取引をSELECT + WHEREで探す。
- 調査2：employee_idから人物を特定するためJOINを使う。
- 調査3：送金時刻とlogin_logsを比較する。
- 終盤：単純に送金者=犯人ではないことが分かり、複数データを組み合わせて真相を推理する。
- 目標プレイ時間：30〜60分。

## 15. AI開発の原則

- 「全部作って」と依頼せず、設計→小実装→テスト→レビューのループにする。
- AGENTS.mdとADRで技術方針を固定し、AIが勝手にスタックを変更しないようにする。
- 1 Issue = 1つの明確な成果物を基本にする。
- 実装前に変更計画を出させる。
- 実装後にlint/test/buildを必ず実行させる。
- ゲームコンテンツ生成とアプリケーション開発を将来的に別Agent/別タスクとして分離する。
- 最終的なゲーム品質は人間が実際にプレイして判断する。

## 16. MVP Definition of Done

- CASEを開始できる。
- 事件ストーリーを読める。
- テーブル・カラム情報を確認できる。
- SQLを書いて実行できる。
- SQL結果を表形式で確認できる。
- SQLエラーを理解可能な形で表示できる。
- 正しい結果を取得すると証拠・イベントが発生する。
- 調査を複数段階進められる。
- 最終回答を入力できる。
- 正解するとクリア画面が表示される。
- CASE 001を最初から最後までプレイできる。
- 主要なゲームロジックの自動テストがある。
- 静的ホスティングで動作する。

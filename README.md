# Audit Trail — SQL推理ゲーム

ブラウザ上でユーザーが実際にSQLを書き、架空の事件のデータベースを調査して
謎を解いてストーリーを進める推理ゲーム。

SQLを学ぶこと自体が目的ではなく、SQLをゲーム内の**「調査手段」**として扱う。

> **Audit Trail**（監査証跡）— システムが残す「誰が・いつ・何をしたか」の記録。
> プレイヤーが読み解くのは、まさにこの証跡である。

> **現在のフェーズ: Phase 3（CASE 001）完了。次は Phase 4（進行・判定）。**

---

## ドキュメント

| ファイル | 内容 |
|---|---|
| [docs/vision.md](./docs/vision.md) | プロダクトの目的、ターゲット、MVPスコープ |
| [docs/game-design.md](./docs/game-design.md) | ゲームループ、進行モデル、UX |
| [docs/architecture.md](./docs/architecture.md) | 技術構成、レイヤ境界、テスト戦略 |
| [docs/case-format.md](./docs/case-format.md) | CASEデータ仕様（JSON構造・判定ルール） |
| [docs/roadmap.md](./docs/roadmap.md) | Phase 0〜6 と Definition of Done |
| [docs/mvp-issues.md](./docs/mvp-issues.md) | 実装タスク34件（依存関係順） |
| [docs/cases/case-001.md](./docs/cases/case-001.md) | CASE 001「消えた100万円」仕様 ⚠️ネタバレ |
| [docs/adr/](./docs/adr/) | 技術方針の決定記録 |
| [AGENTS.md](./AGENTS.md) | AIエージェント／コントリビューター向け規約 |

---

## MVPの技術方針（要約）

- **バックエンドなし。** 静的ホスティングのみ（[ADR-0002](./docs/adr/0002-no-backend.md)）
- **SQL実行はブラウザ内 sql.js（SQLite WASM）**、Web Worker上（[ADR-0001](./docs/adr/0001-sql-engine.md)）
- **CASEデータは静的アセット**（JSON + `.sqlite`）
- **正解判定はSQL文字列を見ない。実行結果のみで判定する**（[ADR-0004](./docs/adr/0004-answer-checking.md)）
- 将来のPostgreSQL移行のため、`SqlEngine` インターフェースでゲームとSQL実行を分離する
- **ER図**でテーブル間のリレーションを提示する（`schema.json` からインラインSVG）
- 見た目は **CSS Modules + デザイントークン**。アクセシビリティが難しい部品だけ
  **Base UI**（ヘッドレス）に任せる（[ADR-0005](./docs/adr/0005-ui-styling.md)）

---

## 開発

```bash
cd frontend
npm ci
npm run dev          # http://localhost:5173
npm run lint         # 以下4つが緑になるまで完了としない（AGENTS.md）
npm run typecheck
npm run test
npm run build
```

`npm run fixtures` が PoC/テスト用の `.sqlite` を生成する（`dev`/`test`/`build` の前に自動実行）。
生成物は git に入れない。

CASEデータを触ったら:

```bash
npm run cases:build   # seed.sql → database.sqlite を再生成
npm run cases:check   # コミット済みの .sqlite とのズレを検出（CIでも実行）
```

## 次にやること

[docs/mvp-issues.md](./docs/mvp-issues.md) の **#22 CASEローダー** から
Phase 4（進行・判定）に着手する。判定エンジン（#23）は Phase 3 で実装済み。

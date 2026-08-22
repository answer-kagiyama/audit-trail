# SQL Mystery — SQL推理ゲーム

ブラウザ上でユーザーが実際にSQLを書き、架空の事件のデータベースを調査して
謎を解いてストーリーを進める推理ゲーム。

SQLを学ぶこと自体が目的ではなく、SQLをゲーム内の**「調査手段」**として扱う。

> **現在のフェーズ: Phase 0（仕様・設計）完了。実装は未着手。**

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

---

## 次にやること

[docs/mvp-issues.md](./docs/mvp-issues.md) の **#1 プロジェクト初期化** から着手する。

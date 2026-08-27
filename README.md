# WHERE — SQL推理ゲーム

> **真実はどこにある？**

ブラウザ上でユーザーが実際にSQLを書き、架空の事件のデータベースを調査して
謎を解いてストーリーを進める推理ゲーム。

SQLを学ぶこと自体が目的ではなく、SQLをゲーム内の**「調査手段」**として扱う。

> `WHERE` は「どの行を選ぶか」を書く句であり、同時に「どこに」を問う言葉でもある。
> 絞り込むことで在り処を突き止める——それがこのゲームでやることそのものになっている。

リポジトリ名・パッケージ名・localStorage キーは `audit-trail`（監査証跡）のまま。
表示名と識別子を分けている理由は [docs/vision.md §0](./docs/vision.md) を参照。

> **現在のフェーズ: Phase 5（品質）完了。Vercel にデプロイ済み。Phase 6（実プレイテスト）進行中。**

---

## 生成AI開発の事例として見る場合

このリポジトリは、**Claude Code に開発を任せて作った**アプリの実物です。
ゲームとしての完成度だけでなく、「AIエージェントにどう仕事を渡すと、
何が返ってくるか」の一例として、社内で共有する目的で公開しています。

最初の指示は Word 1枚（ChatGPT で構想を練ったもの）でした。そこから
Claude が設計資料を書き、Phase ごとに実装 → テスト → レビューを繰り返して
ここまで進んでいます。読む順のおすすめ:

1. [docs/handoff.md](./docs/handoff.md) — 最初に渡した指示書（原本）
2. [docs/vision.md](./docs/vision.md) 〜 [docs/roadmap.md](./docs/roadmap.md) — その指示書を受けて
   Claude が Phase 0 で書いた設計資料一式。**「実装前に設計から」を指示したときの実際の出力**
3. [AGENTS.md](./AGENTS.md) — Claude に守らせた制約（技術スタックの固定、レイヤ境界、
   日本語で書く規約など）。**これがブレ止めとして機能したかどうか**は ADR や実装を見ると分かる
4. [docs/adr/](./docs/adr/) — 技術選定を理由つきで記録したもの。後から readable な形で
   「なぜその選択をしたか」を追える
5. [docs/mvp-issues.md](./docs/mvp-issues.md) — 実装タスクを1 Issue = 1成果物で分解したもの
6. [docs/ui-layout.md](./docs/ui-layout.md) — **設計が一度外れて、直した記録**。
   計測に基づいて決めた設計が、そもそもの計測値がバグ由来だったせいで誤っていた。
   §4 と §9 に、何をどう間違えたかがそのまま残してある
7. GitHub の Pull Request 履歴 — 各PhaseのPR説明とレビューのやり取り。
   実際の「計画 → 実装 → 検証 → 人間のフィードバック」のループが残っている

⚠️ ライセンスは付与していません（[LICENSE](./LICENSE) 参照）。閲覧・参考は自由ですが、
コードの再利用には著作権者の許諾が必要です。

---

## ドキュメント

| ファイル | 内容 |
|---|---|
| [docs/vision.md](./docs/vision.md) | プロダクトの目的、ターゲット、MVPスコープ |
| [docs/game-design.md](./docs/game-design.md) | ゲームループ、進行モデル、UX |
| [docs/ui-layout.md](./docs/ui-layout.md) | 調査画面のレイアウト設計（実測値と根拠） |
| [docs/architecture.md](./docs/architecture.md) | 技術構成、レイヤ境界、テスト戦略 |
| [docs/case-format.md](./docs/case-format.md) | CASEデータ仕様（JSON構造・判定ルール） |
| [docs/roadmap.md](./docs/roadmap.md) | Phase 0〜6 と Definition of Done |
| [docs/mvp-issues.md](./docs/mvp-issues.md) | 実装タスク37件（依存関係順） |
| [docs/cases/case-001.md](./docs/cases/case-001.md) | CASE 001「消えた100万円」仕様 ⚠️ネタバレ |
| [docs/cases/case-002.md](./docs/cases/case-002.md) | CASE 002「改ざんされた在庫」仕様 ⚠️ネタバレ |
| [docs/cases/case-003.md](./docs/cases/case-003.md) | CASE 003「戻らなかった試作機」設計（実装前） ⚠️ネタバレ |
| [docs/adr/](./docs/adr/) | 技術方針の決定記録 |
| [AGENTS.md](./AGENTS.md) | AIエージェント／コントリビューター向け規約 |
| [docs/handoff.md](./docs/handoff.md) | 最初の開発引き継ぎ資料（原本。歴史的記録） |

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
npm run e2e          # Playwright（実ブラウザでの通し確認）
```

`npm run fixtures` が PoC/テスト用の `.sqlite` を生成する（`dev`/`test`/`build` の前に自動実行）。
生成物は git に入れない。

`npm run dev` で CASE 001 を実際にプレイできます。

CASEデータを触ったら:

```bash
npm run cases:build   # seed.sql → database.sqlite を再生成
npm run cases:check   # コミット済みの .sqlite とのズレを検出（CIでも実行）
```

## デプロイ（Vercel）

リポジトリ直下の [`vercel.json`](./vercel.json) がビルド方法を指定している。

**Vercel 側の設定で Root Directory は変更しないこと（リポジトリ直下のまま）。**
`frontend` に設定すると、既定では `frontend/` の外が含まれず、
`cases/` が見つからずビルドが落ちる。

| 設定 | 値 |
|---|---|
| Root Directory | （空＝リポジトリ直下） |
| Framework Preset | Other |
| Install / Build / Output | `vercel.json` の指定が使われる |

`vercel.json` の `rewrites` は、`/case-001` のような URL を直接開いたときに
`index.html` を返すための指定（SPA フォールバック）。
これが無いと、CASE の URL を共有された人が 404 を見る。
`cases/` と `assets/` は実ファイルなので除外している。

## 次にやること

[docs/mvp-issues.md](./docs/mvp-issues.md) の **#34 実プレイテスト**。
SQL中級者を含む3〜5人に通しで遊んでもらい、詰まりどころを計測する。
**Phase 6 で残っているのはこれだけ**で、あとは作者が遊んで挙げた分の対応
（[roadmap.md](./docs/roadmap.md#phase-6-公開)）まで含めて片付いている。

その先は CASE 003「戻らなかった試作機」。
設計は [docs/cases/case-003.md](./docs/cases/case-003.md) にあり、実装はこれから。

## ライセンス

[LICENSE](./LICENSE) を参照。ライセンス方針は未確定のため、現時点では
全著作権留保（閲覧・参考は自由、再利用には許諾が必要）としている。

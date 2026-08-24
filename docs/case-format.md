# case-format.md — CASEデータ仕様

CASE = 1つの事件。ゲームエンジンはCASEデータを読むだけで動作し、
CASE固有のロジックをコードに持たない。**新しい事件の追加＝データの追加**であること。

---

## 1. ファイル構成

```
cases/case-001/
├── metadata.json     # CASE ID、タイトル、難易度、バージョン、ファイル一覧
├── story.json        # プロローグ、Objective、証拠、エピローグ
├── schema.json       # Database画面に出すテーブル説明（DBから自動生成しない）
├── hints.json        # Objectiveごとの段階的ヒント
├── solution.json     # 判定条件と最終回答
├── seed.sql          # ★正 — DBの中身はここで定義する
└── database.sqlite   # seed.sql からの生成物（コミットするがhand-editしない）
```

### seed.sql と database.sqlite

`seed.sql` が唯一の真実。`database.sqlite` は `tools/build-case-db.mjs` の生成物。

```
node tools/build-case-db.mjs cases/case-001
```

CIで再生成し、コミット済みの `database.sqlite` と一致しなければ失敗させる。
**バイナリを直接編集すると差分レビューが不可能になり、AIエージェントも変更を追えない。**

---

## 2. metadata.json

```jsonc
{
  "id": "case-001",
  "version": 1,                    // ★ セーブ互換性のキー。データを変えたら必ず上げる
  "title": "消えた100万円",
  "subtitle": "深夜の不正送金事件",
  "difficulty": 1,                 // 1..5
  "estimatedMinutes": [30, 60],
  "sqlConcepts": ["SELECT", "WHERE", "ORDER BY", "JOIN", "GROUP BY", "サブクエリ"],
  "dialect": "sqlite",             // 将来 "postgres" を取りうる
  "files": {
    "story": "story.json",
    "schema": "schema.json",
    "hints": "hints.json",
    "solution": "solution.json",
    "database": "database.sqlite"
  }
}
```

`version` を上げると既存セーブは破棄される（[game-design.md §6](./game-design.md#6-セーブとリセット)）。
CASEデータを変更したのにversionを据え置くと、**古いセーブで詰む**プレイヤーが出る。

---

## 3. story.json

```jsonc
{
  "prologue": {
    "title": "深夜0214",
    "body": "3月14日 午前2時14分。社内経理システムから..."  // Markdown可（サブセット）
  },

  "objectives": [
    {
      "id": "obj-01",
      "title": "不審な高額送金を特定する",
      "brief": "まずは取引記録から、1,000,000円の送金を探し出してください。",
      "prerequisites": [],               // 空 = 開始時からactive
      "rewards": {
        "evidence": ["ev-01"],
        "storyBeats": ["beat-01"]
      }
    },
    {
      "id": "obj-02",
      "title": "送金を実行したアカウントの持ち主を突き止める",
      "brief": "取引記録の employee_id だけでは人物が分かりません。社員名簿と突き合わせてください。",
      "prerequisites": ["obj-01"],
      "rewards": { "evidence": ["ev-02"], "storyBeats": ["beat-02"] }
    }
  ],

  "evidence": [
    {
      "id": "ev-01",
      "title": "深夜2時14分の1,000,000円送金",
      "body": "取引ID 4821。2026-03-14 02:14:33、employee_id=7 のアカウントから外部口座へ。"
    }
  ],

  "storyBeats": [
    {
      "id": "beat-01",
      "body": "記録は確かに残っていた。問題は、この時間に誰が社内システムを操作できたかだ。"
    }
  ],

  "epilogue": {
    "title": "真相",
    "body": "..."   // ★ 獲得した証拠を引用しながら、データの繋がりを解説する
  }
}
```

### 執筆ルール

- `brief` は **「何を知りたいか」を書く。「どう書くか」は書かない。** SQL構文の指示はヒント側の役割
- ただし、**必要な情報が複数のテーブルに分かれているときは、そのことを明示する。**
  「取引記録には employee_id しかなく、氏名は社員名簿にあります」のように書く。
  これは「どう書くか」ではなく「どこに何があるか」なので `brief` の役目。
  プレイテストで「JOINが要ることが目的の文から判断しづらい」という指摘が出たため、
  ここを曖昧にしない。`**強調**` で該当箇所を目立たせてよい
- `evidence.body` には**具体的な値**（ID、時刻、金額）を含める。後の調査で参照するため
- `epilogue` はクリア時の最大の報酬。手を抜かない（[game-design.md §7](./game-design.md#7-クリア体験)）

---

## 4. schema.json

Database画面の表示内容。**DBから自動生成しない**（説明文とリレーションは人間が書くため）。

```jsonc
{
  "tables": [
    {
      "name": "employees",
      "description": "社員名簿。退職者も残っている。",
      "erLayout": { "x": 40, "y": 40 },        // ★ ER図での配置（下記4.1）
      "columns": [
        { "name": "id",         "type": "INTEGER", "nullable": false,
          "key": "pk",                            // "pk" | "fk" | null
          "description": "社員ID（主キー）" },
        { "name": "name",       "type": "TEXT",    "nullable": false, "description": "氏名" },
        { "name": "department", "type": "TEXT",    "nullable": false, "description": "所属部署" },
        { "name": "status",     "type": "TEXT",    "nullable": false,
          "description": "在籍状況。'active' または 'retired'" },
        { "name": "hired_at",   "type": "TEXT",    "nullable": false,
          "description": "入社日。'YYYY-MM-DD' 形式の文字列" }
      ],
      "sampleRows": [
        { "id": 1, "name": "佐藤 健一", "department": "経理部", "status": "active", "hired_at": "2019-04-01" }
      ]
    },
    {
      "name": "transactions",
      "description": "取引記録。",
      "erLayout": { "x": 340, "y": 40 },
      "columns": [
        { "name": "id",          "type": "INTEGER", "nullable": false, "key": "pk", "description": "取引ID" },
        { "name": "employee_id", "type": "INTEGER", "nullable": false, "key": "fk",
          "description": "実行アカウントの社員ID" }
        // ...
      ],
      "sampleRows": [ /* ... */ ]
    }
  ],

  "relations": [
    {
      "id": "rel-tx-emp",
      "from": { "table": "transactions", "column": "employee_id" },
      "to":   { "table": "employees",    "column": "id" },
      "cardinality": "many-to-one",           // "many-to-one" | "one-to-many" | "one-to-one"
      "label": "実行したアカウント",            // ★ ER図の線に添えるラベル
      "description": "取引を実行したアカウントの社員ID"
    }
  ],

  "erCanvas": { "width": 640, "height": 460 }  // ★ ER図のビューボックス
}
```

**`sampleRows` は必須。** SQLiteは型が緩く、日時が `'2026-03-14 02:14:33'` なのか
epoch秒なのかが分からないとプレイヤーは詰む。実データから3行程度を貼る。

**`description` に列挙値を書く。** `status` が `'active'|'retired'` であることを
明示しないと、プレイヤーは総当たりで `SELECT DISTINCT status` を撃つことになる
（それ自体は健全な捜査だが、全列でやらせるのは不親切）。

`type` は SQLite の宣言型をそのまま書く。日時列は `TEXT` であることを隠さない。

`key` は ER図の箱に表示する主キー／外部キーの印。`"pk"` / `"fk"` / 省略（通常列）。

### 4.1 ER図のレイアウト

ER図は **CASEデータが座標を持ち、アプリはそのとおりに描くだけ**にする。自動レイアウトは使わない。

理由:

- テーブル数が4〜6程度なので、**作者が読みやすい配置を決めた方が確実によい**。
  自動レイアウト（dagre / elkjs 等）は依存を増やすうえ、線が交差した図を毎回引き当てる
- 座標が固定なら、CASEを変えない限り**図は毎回同じに描かれる**。
  スクリーンショットでのレビューやE2Eテストが安定する
- 「配置が汚い」はデータの修正で直せる。コードを直す必要がない

規約:

- `erLayout.x` / `erLayout.y` は箱の左上角。単位はSVGのユーザー座標
- 箱のサイズは**アプリが内容（テーブル名 + PK/FK行数）から算出**する。データ側では持たない
- `erCanvas` はビューボックス全体のサイズ。全テーブルが収まる値を作者が指定する
- **ER図に描く列は `key` が `"pk"` / `"fk"` の列のみ。** 全列を描くと図が破綻する

### 4.2 ER図の検証

CASE検証テストで以下を自動チェックする（[§8](#8-case追加時のチェックリスト)）:

- `relations` の `from` / `to` が実在するテーブル・カラムを指している
- `key: "fk"` の列がすべて `relations` に登場する（FKの描き漏れ防止）
- `relations` に登場する列の `key` が `"fk"` / `"pk"` になっている
- すべてのテーブルの `erLayout` が `erCanvas` の内側にある
- **`schema.json` のテーブル・カラムが実際の `database.sqlite` と一致している**
  （`PRAGMA table_info` と突き合わせる。説明文の乖離は防げないが、
  存在しない列を書いてしまう事故は防げる）

---

## 5. 判定仕様（Check）

### 5.1 solution.json

```jsonc
{
  "checks": {
    "obj-01": [
      {
        "type": "containsRows",
        "columns": ["id", "amount"],       // 判定に使う列（名前で照合、大小文字無視）
        "rows": [ [4821, 1000000] ],
        "options": {
          "maxRows": 20,                   // ★ 全件ダンプで通らないようにする
          "caseInsensitive": false
        }
      }
    ],
    "obj-03": [
      {
        "type": "columnValues",
        "column": "name",
        "values": ["山田 咲", "田中 誠"],
        "options": { "exact": true }       // true: 集合一致 / false: 包含
      }
    ]
  },

  "finalAnswer": {
    "fields": [
      {
        "id": "culprit",
        "label": "真犯人は誰ですか？",
        "type": "select",
        "options": ["佐藤 健一", "山田 咲", "田中 誠", "鈴木 花子", "高橋 修", "渡辺 一郎"],
        "correct": "田中 誠"
      },
      {
        "id": "method",
        "label": "どうやって送金したのですか？",
        "type": "select",
        "options": [
          "自分のアカウントで送金した",
          "他人のアカウントの認証情報を使って送金した",
          "システムの脆弱性を突いて直接DBを書き換えた"
        ],
        "correct": "他人のアカウントの認証情報を使って送金した"
      }
    ],
    "requireAll": true
  }
}
```

### 5.2 判定タイプ

判定は **`type` を持つ判別可能ユニオン**。種類の追加が既存CASEを壊さないようにする。

#### `containsRows` — 期待する行を含む（MVPの基本形）

- `columns` に挙げた列が結果に**存在すること**（列名で照合、大小文字無視）
- 余分な列があってもよい
- 余分な行があってもよい
- 行の順序は**問わない**
- `rows` の各行が、結果のいずれかの行に（`columns` の値において）一致すること
- **`options.maxRows` を指定した場合、結果の行数がそれ以下であること**

> 「犯行時刻にログインしていた人物を見つけろ」のように、
> **「見つけたこと」が達成条件**である場合に使う。

**`options.maxRows` は原則として必ず付ける。** これが無いと
`SELECT * FROM access_logs` のような**全件ダンプで達成できてしまう**。
包含しか要求しない以上、テーブル全体は常に期待行を含むためである。

閾値は「想定される正解クエリの結果行数」と「テーブル全件」の間に取る。
CASE 001 では、たとえば obj-04 の想定解が 50 行、`access_logs` 全件が 504 行なので
`maxRows: 60` としている。上限を厳しくしすぎると、少し広めに絞った正解を
弾いてしまうので注意する。

#### `resultSet` — 結果表と完全一致

- 列の集合が一致（順序は `options.orderedColumns: true` のときのみ問う）
- 行の**多重集合**が一致（重複行の数も一致すること）
- 行順は `options.orderedRows: true` のときのみ問う

> 「関与した3名**だけ**を抽出しろ」のように、
> **絞り込みの精度そのものが達成条件**である場合に限って使う。
> 安易に使うと「余計な列を消す」という捜査と無関係な作業を強いる。

#### `columnValues` — 特定列の値集合

- 指定した1列の値集合を比較
- `options.exact: true` で集合一致、`false` で包含

> 「関与者の名前を挙げろ」のように、**列構成を問わない**場合に使う。

### 5.3 値の正規化ルール（実装が必ず従うこと）

比較前に期待値・実測値の双方へ同じ正規化をかける。`game/normalize.ts` に純関数として実装する。

| 型 | ルール |
|---|---|
| `NULL` | `null` のまま。空文字 `''` とは**区別する** |
| 数値 | 数値として比較。`1000000` と `1000000.0` は等しい。浮動小数は絶対誤差 `1e-9` 以内を等しいとする |
| 数値 vs 数字文字列 | `1000000` と `"1000000"` は **等しいとする**（SQLiteの型の緩さを吸収するため） |
| 文字列 | 前後の空白を `trim`。デフォルトは**大小文字を区別する**。`options.caseInsensitive: true` で無視 |
| 真偽値 | SQLiteに真偽型はない。`true → 1`, `false → 0` に正規化 |
| BLOB | MVPでは判定に使わない（CASEデータにBLOB列を作らない） |
| 日時 | 文字列として比較（`trim` のみ）。**日時パースはしない。** CASEデータ側で表記を統一する責任を持つ |

**行の一致**: `columns` に挙げた各列の正規化後の値がすべて等しいこと。

**列名の照合**: 大小文字を無視して一致。`AS` によるエイリアスは考慮しない
（＝ CASEは、プレイヤーが元の列名のまま出せる形で設計する。
どうしても別名が必要なら `brief` でそう指示する）。

### 5.4 判定タイミング

クエリ実行が**成功するたびに**、`active` な全Objectiveの `checks` を評価する。
`checks` の配列は **AND**（すべて満たしてはじめて達成）。

複数のObjectiveが同時に達成されうる。これは仕様
（[game-design.md §2](./game-design.md#2-進行モデルデータ構造の語彙)）。

`prerequisites` を満たしていないObjectiveは、結果が一致しても達成しない。

---

## 6. hints.json

```jsonc
{
  "obj-01": [
    { "level": 1, "body": "取引の記録は transactions テーブルにあります。" },
    { "level": 2, "body": "金額で絞り込みます。WHERE 句に amount の条件を書いてみましょう。" },
    { "level": 3, "body": "1,000,000円ちょうどとは限りません。amount >= 1000000 のように範囲で探すと確実です。" }
  ]
}
```

- `level` は 1 から連番
- **level 3 でも正解SQLそのものは書かない**（書き方は複数あり、1つを提示すると
  「これが正解の形だ」と誤って伝えてしまう）
- 全Objectiveにヒントを用意する。用意漏れがあると、そこで詰んだプレイヤーに逃げ道がなくなる

---

## 7. 秘匿情報の扱い

**`solution.json` はブラウザに配信される。DevToolsで読める。**

- MVPではこれを前提として受け入れる（[ADR-0002](./adr/0002-no-backend.md)）
- **やってはいけないこと**: 難読化・base64化・分割ロードによる「隠したつもり」。
  秘匿にならないうえ、デバッグとレビューを困難にするだけ
- 将来サーバー判定を導入する場合、`solution.json` を**サーバー側にだけ置き**、
  クライアントは「クエリ結果のハッシュ」または「結果そのもの」を送って判定を受ける。
  `Check` の型定義は共有できるので、この移行でCASEデータの形は変わらない

---

## 8. CASE追加時のチェックリスト

新しいCASEを追加する（または既存CASEを変更する）ときは、以下をすべて満たすこと。

> **`cases/` にディレクトリを置いた時点で自動的に掛かるもの**（登録作業は不要）:
> `cases:check`（seed.sql と database.sqlite の一致）と
> `caseStructure.test.ts`（schema.json と実DBの一致・FKとER図・DAGの循環・
> ヒント網羅・DBサイズ）。どちらも `cases/` の中身を正として全CASEに回る。
>
> **CASEごとに手で書く必要があるもの**: 正解例・不正解例の検証テスト
> （`case-001.test.ts` に相当するファイル）。事件の中身に依存するため自動化できない。

- [ ] `seed.sql` を書き、`build-case-db.mjs` で `database.sqlite` を生成した
- [ ] `metadata.json` の `version` を上げた（既存CASEの変更時）
- [ ] `schema.json` の `sampleRows` が実データと一致している
- [ ] `schema.json` のテーブル・カラムが `database.sqlite` と一致している（自動検証あり）
- [ ] すべてのFK列に `key: "fk"` が付き、`relations` に対応する定義がある
- [ ] `erLayout` / `erCanvas` を指定し、**実際に描画して線が交差していないことを目視した**
- [ ] すべての `relations` に日本語の `label` がある
- [ ] すべてのObjectiveに `checks` がある
- [ ] すべてのObjectiveに3段階のヒントがある
- [ ] Objectiveの `prerequisites` がDAGになっている（循環がない）
- [ ] 全Objectiveが `prerequisites` を辿って到達可能である（孤立していない）
- [ ] **すべての `containsRows` に `maxRows` を指定した**（全件ダンプ対策）
- [ ] **各Objectiveについて、正解例SQLを2〜3通り書き、すべて達成判定されるテストがある**
- [ ] **各Objectiveについて、不正解例SQLが達成判定されないテストがある**
      （全件ダンプ・別テーブル・惜しいが違う絞り込み、の3種は必ず入れる）
- [ ] 最終回答の正解が受理され、各誤答が拒否されるテストがある
- [ ] 人間が最初から最後まで通しでプレイし、想定時間内に収まることを確認した

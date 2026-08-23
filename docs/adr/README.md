# Architecture Decision Records

技術方針を固定し、AIエージェント・人間の双方が勝手にスタックを変更しないための記録。

**ルール**
- ランタイム依存の追加、レイヤ境界の変更、SQLエンジンの変更はADRを書いてから行う
- 一度 Accepted になったADRは書き換えず、新しいADRで Superseded にする
- 番号は連番。ファイル名は `NNNN-短い名前.md`

| # | タイトル | 状態 |
|---|---|---|
| [0001](./0001-sql-engine.md) | SQL実行エンジンに sql.js を採用する | Accepted |
| [0002](./0002-no-backend.md) | MVPではバックエンドを作らない | Accepted |
| [0003](./0003-editor.md) | SQLエディタに CodeMirror 6 を採用する | Accepted |
| [0004](./0004-answer-checking.md) | 正解判定はSQL文字列ではなく結果で行う | Accepted |
| [0005](./0005-ui-styling.md) | CSS Modules + ヘッドレスUIプリミティブ(Base UI) | Accepted（単一テーマの点のみ [0006](./0006-theme-switching.md) が上書き） |
| [0006](./0006-theme-switching.md) | ライト / ダークを切り替えられるようにする | Accepted |

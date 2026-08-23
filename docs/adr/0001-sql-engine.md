# ADR-0001: SQL実行エンジンに sql.js を採用する

- 状態: **Accepted**
- 日付: 2026-08-22
- 関連: [architecture.md](../architecture.md), [ADR-0002](./0002-no-backend.md)

## コンテキスト

ブラウザ内でSQLiteを実行する必要がある。要件は以下:

1. **静的な `.sqlite` ファイルをバイト列から読み込める**こと（CASE DBの配信形態）
2. 読み取り専用。**永続化は一切不要**
3. データ規模は数百〜数千行、1MB以下
4. `JOIN` / `GROUP BY` / `HAVING` / サブクエリ / CTE / Window Function が使えること
5. Viteでビルドでき、**通常の静的ホスティングで動く**こと
6. Node環境でも動くこと（CASE検証テストをCIで走らせるため）
7. Web Worker内で動かせること（タイムアウト＝`terminate()` の実現に必須）

候補は `sql.js` と、SQLite公式の `@sqlite.org/sqlite-wasm`。

## 比較

| 観点 | sql.js | @sqlite.org/sqlite-wasm |
|---|---|---|
| 提供元 | コミュニティ（sql-js org, MIT） | **SQLite公式** |
| SQLiteバージョン | 3.49 系（v1.14.1 時点） | 上流に追従（`3.x.y-buildN`） |
| バイト列からのDB読込 | `new SQL.Database(uint8Array)` — **1行** | `oo1` + `deserialize` 相当が必要でやや込み入る |
| 永続化(OPFS) | 非対応 | 対応（**本件では不要**） |
| COOP/COEP ヘッダ | **不要** | OPFS利用時のみ必要。非OPFSなら不要 |
| Vite設定 | `locateFile` で `.wasm` の場所を指定 | `optimizeDeps.exclude` が必要。ESM周りにハマりどころあり |
| Node実行 | 可 | 可（in-memoryのみ） |
| Worker内実行 | 可 | 可（OPFS同期I/Oは**Worker必須**） |
| API | 素直（`exec` が `{columns, values}` を返す） | 低レベル寄り。C APIに近い層と `oo1` OO層 |
| 実績・情報量 | 多い | 増加中 |

要件4（SQL機能）は**どちらも満たす**。Window Function は SQLite 3.25、CTE は 3.8.3 で
導入済みで、sql.js の 3.49 系でも当然使える。ここは判断材料にならない。

## 決定

**sql.js を採用する。**

決め手:

- 本件の要件のうち、`@sqlite.org/sqlite-wasm` だけが持つ強み（**OPFS永続化**）が
  **まったく必要ない**。CASE DBは読み取り専用で、リロードのたびに静的ファイルから
  読み直せばよい。最大の差別化要因が本件では価値ゼロになる。
- 逆に本件で最も頻度が高い操作は「静的 `.sqlite` をバイト列で読み込む」であり、
  ここは sql.js が明確に簡単（`new SQL.Database(bytes)`）。
- COOP/COEPヘッダが不要なため、**静的ホスティングの選択肢を狭めない**。
  ヘッダ設定が要ると、ホスティング先の制約やCDN設定という本質でない作業が増える。
- Vite統合が単純で、ビルド設定のハマりどころが少ない。

「公式である」ことは長期的には利点だが、**OPFSを使わない読み取り専用ユースケースでは
実質的な差にならない**ため、統合コストの低い方を取る。

## 結果・影響

- `sql.js` を **Web Worker 内** でロードする（[architecture.md §5](../architecture.md#5-sql実行フロー)）
- `.wasm` は `public/` に配置し `locateFile` で解決する（CDN依存を作らない）
- **`SqlEngine` インターフェース越しにしか使わない。** sql.js の型を
  game core / ui に露出させない（[architecture.md §2](../architecture.md#2-レイヤ境界最重要)）
- SQLiteバージョンが上流より遅れることは受容する。使う構文が枯れているため実害がない

## 再検討のトリガー

以下が起きたらこのADRを見直す:

- **OPFSでの永続化が必要になった**（例: 巨大CASE DBのキャッシュ、ユーザー作成データの保存）
- sql.js のメンテナンスが停止した
- 使いたいSQLite機能が sql.js のバージョンに存在しない
- 実測でロード時間・クエリ性能が問題になった

**`SqlEngine` 境界を守っていれば、乗り換えは engine 層の1ファイル差し替えで済む。**
この境界の維持が、本ADRのリスクヘッジそのものである。

## 参考

- [sql-js/sql.js](https://github.com/sql-js/sql.js/)
- [sqlite/sqlite-wasm](https://github.com/sqlite/sqlite-wasm)
- [sqlite3 WebAssembly & JavaScript Documentation](https://sqlite.org/wasm)

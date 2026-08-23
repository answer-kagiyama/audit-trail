# ADR-0005: CSS Modules + ヘッドレスUIプリミティブ（Base UI）を採用する

- 状態: **Accepted**（「単一テーマに固定する」の一点のみ [ADR-0006](./0006-theme-switching.md) が上書き）
- 日付: 2026-08-23（承認: 2026-08-23）
- 関連: [ADR-0003](./0003-editor.md)

## コンテキスト

「UIライブラリを使った方が楽ではないか、それとも自前のCSS Modulesの方が
よいUIを作りやすいか」という問いに答える必要がある。

前提として、Audit Trail が必要とするUI部品を洗い出すと、性質が**二極化**している。

### A. このアプリ固有で、既製品が存在しないもの（＝自作するしかない）

| 部品 | 備考 |
|---|---|
| **ER図** | インラインSVG。UIライブラリの守備範囲外 |
| **結果表（Result）** | 列ヘッダ固定・横スクロール・NULL表示・500行打ち切り |
| **SQLエディタ** | CodeMirror 6（[ADR-0003](./0003-editor.md)） |
| **Storyパネル**（証拠カード、目的リスト） | 世界観に沿った独自表現 |
| **2カラム／タブのレイアウト** | CSS Grid + メディアクエリで十数行 |

### B. どのアプリにもある、アクセシビリティが難しいもの（＝自作すると事故る）

| 部品 | 自作時のハマりどころ |
|---|---|
| **Dialog**（リセット確認、クリア画面） | フォーカストラップ、`Esc`、スクロールロック、背景の `aria-hidden` |
| **Tabs**（モバイルの画面切替、ER図/詳細切替） | 矢印キー移動、`role="tab"` と `aria-controls` の対応 |
| **Tooltip / Popover**（列の説明、リレーションのラベル） | ホバーとフォーカスの両対応、タッチ端末、配置の衝突回避 |
| **Toast / Live region**（証拠獲得の通知） | `aria-live` の粒度、読み上げの重複 |
| **Select**（最終回答フォーム） | ネイティブ `<select>` で足りる可能性が高い |

**Bを自作すると、[roadmap Phase 5 のアクセシビリティ対応](../roadmap.md#phase-5-品質)が
まるごと自作分のデバッグに化ける。** ここが判断の分かれ目になる。

## 選択肢

| | フルコンポーネントライブラリ<br>(MUI / Chakra / Ant Design) | **ヘッドレスプリミティブ**<br>(Base UI / Radix / React Aria) | 完全自作<br>(CSS Modules のみ) |
|---|---|---|---|
| Aの部品 | **役に立たない**（結局自作） | 役に立たない（結局自作） | 自作 |
| Bの部品 | もらえる | **もらえる** | 全部自作 |
| 見た目の自由度 | **低い**。既定のデザインと戦う | **完全に自由**（スタイル無し） | 完全に自由 |
| バンドル増 | 大 | **小**（使う部品のみ） | 0 |
| 学習コスト | 中〜大（独自のスタイル記法） | 小 | 0 |
| a11y | もらえる | **もらえる** | 自前で作り込む |

## 決定

**CSS Modules で見た目を作り、アクセシビリティが難しい部品だけ
ヘッドレスプリミティブ（Base UI）に任せる。**

**フルコンポーネントライブラリ（MUI / Chakra / Ant Design 等）は採用しない。**

### なぜフルコンポーネントライブラリを使わないか

1. **このアプリの主要部品（A群）を1つも提供してくれない。**
   ER図も結果表もSQLエディタもStoryパネルも自作になる。
   「楽になる」はずの部分が、実際にはこのアプリのUIのほとんどを占めていない
2. **見た目で戦うことになる。** Audit Trail は捜査・監査ログという世界観を持ち、
   等幅フォント・低彩度・ターミナル寄りの質感を狙いたい。
   MUIのMaterial Design、Chakraの丸みを帯びた既定値は、
   **打ち消すコストの方が、最初から書くコストより高くなる**
3. **バンドルが重い。** 初回ロードには既に sql.js の wasm（約1MB強）と
   CodeMirror が乗る。ここにコンポーネントライブラリを足すと、
   [Phase 5 のロード時間](../roadmap.md#phase-5-品質)がそのぶん厳しくなる
4. A群を自作する以上、**結局CSSを書く**。
   ライブラリのスタイル記法と自前CSSが混在する方が、統一されたCSS Modulesより読みにくい

### なぜ完全自作にもしないか

Dialog / Tabs / Tooltip / Toast の**アクセシビリティを正しく実装するのは、
見た目を作るより明確に難しい**。フォーカストラップ、矢印キーのroving tabindex、
`aria-*` の対応関係は、知らなければ気づけない失敗を大量に含む。
ここは既製品に任せるのが合理的で、しかも**ヘッドレスなので見た目の自由度は1ミリも失わない**。

### なぜ Base UI か

- **v1.0 stable（2025年12月）** に到達し、MUIチームがフルタイムで開発している
- **2026年7月時点で shadcn/ui の既定のプリミティブ層**になっており、事実上の標準に近い
- スタイルを一切持たず、`className` と `data-*` 属性で状態を露出する
  → **CSS Modules と素直に組み合わせられる**（Tailwind必須ではない）
- Radix UI も同等の選択肢だが、WorkOS による買収後、
  一部コンポーネントの更新が鈍化している

**React Aria Components** はアクセシビリティが最も深いが、
部品あたりの記述量が多い。本作の規模ではそこまでの厳密さは要らない。

## 制約（重要）

- **Base UI から使うのは B群の部品だけ。** レイアウト、ボタン、カード、テーブルは
  CSS Modules で自作する。「あるから使う」をしない
- **導入は必要になった時点で行う。** Phase 2 の時点で必要なのは
  Tabs（モバイル切替 / ER図切替）程度。Dialog は Phase 4、
  Toast は Phase 4〜5 で入る。**最初に全部入れない**
- ネイティブHTML要素（`<select>`, `<details>`, `<dialog>`）で足りるものは
  そちらを使う。プリミティブを使う判断には理由が要る
- デザイントークン（色・間隔・フォント）は **`src/styles/tokens.css` の
  CSS カスタムプロパティに集約**する。CSS Modules 側はトークンを参照するだけにする

## 結果・影響

- `frontend/src/styles/tokens.css` を作り、全CSS Modulesがこれを参照する
- Phase 2 の Issue に「UI基盤（トークン + レイアウト + Base UI導入）」を含める
- [Phase 5 のアクセシビリティ](../roadmap.md#phase-5-品質)の作業量が減る。
  残るのは自作部品（結果表・ER図・エディタ）のキーボード操作とコントラスト
- `AGENTS.md` の「UIコンポーネントライブラリを追加しない」は
  「**フル**コンポーネントライブラリを追加しない」に読み替える

## 再検討のトリガー

- CSS Modules での自作部品が増えすぎ、見た目の一貫性が崩れてきた
  → まずデザイントークンの整理で対処する。それでも駄目ならライブラリを再検討
- Base UI の必要部品が揃わない → Radix UI の該当部品を個別に併用してよい
- チームにデザイナーが入り、独自デザインシステムを作ることになった

## 参考

- [Radix vs Base UI: which headless React library should you use in 2026?](https://www.shadcndeck.com/blog/radix-vs-base-ui)
- [Top Headless UI libraries for React in 2026](https://www.greatfrontend.com/blog/top-headless-ui-libraries-for-react-in-2026)
- [Headless UI alternatives: Radix Primitives vs. React Aria vs. Ark UI vs. Base UI](https://blog.logrocket.com/headless-ui-alternatives/)

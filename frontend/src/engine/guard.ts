/**
 * 読み取り専用ガード。
 *
 * これは**セキュリティ機能ではなくゲームルール**である。ブラウザ内DBなので、
 * DevTools から直接叩けば何でもできる。それは前提として受け入れている
 * （docs/vision.md#6-意図的に受け入れる制約）。
 *
 * ここが担うのは「捜査資料を書き換えるのはこのゲームの行為ではない」という
 * 世界観の表明と、うっかり UPDATE を撃ったプレイヤーへの案内である。
 *
 * 方式は**許可リスト**。拒否リストは必ず抜ける（`WITH x AS (...) DELETE ...`、
 * コメント紛れ込み、方言の別名など）ので採らない。
 *
 * 多層防御として、Worker 側で `PRAGMA query_only = ON` も効いている。
 *
 * @see docs/architecture.md#6-クエリガード
 */

export type GuardVerdict = { ok: true; sql: string } | { ok: false; message: string };

/** ゲーム上ここから始まる文だけを認める。 */
const ALLOWED_HEAD = /^(select|with)$/i;

const WRITE_VERB_MESSAGE =
  'このゲームでは記録の閲覧のみ可能です。捜査資料を書き換えることはできません。';

/**
 * コメントと文字列リテラルを取り除いた「素」のSQLを返す。
 *
 * 先頭トークンの判定と文の個数の数え上げを、コメントや文字列の中身に
 * 惑わされずに行うために使う。返り値は判定専用で、実行には使わない。
 */
export function stripCommentsAndStrings(sql: string): string {
  let out = '';
  let i = 0;
  while (i < sql.length) {
    const two = sql.slice(i, i + 2);

    if (two === '--') {
      const end = sql.indexOf('\n', i);
      i = end === -1 ? sql.length : end;
      continue;
    }
    if (two === '/*') {
      const end = sql.indexOf('*/', i + 2);
      i = end === -1 ? sql.length : end + 2;
      out += ' ';
      continue;
    }

    const ch = sql[i];
    // '...' / "..." / [...] / `...` — SQLite が認めるクォートを全部飛ばす。
    if (ch === "'" || ch === '"' || ch === '`' || ch === '[') {
      const close = ch === '[' ? ']' : ch;
      i += 1;
      while (i < sql.length) {
        if (sql[i] === close) {
          // '' のようなエスケープは1文字として飛ばす（[] にはこの規則はない）。
          if (close !== ']' && sql[i + 1] === close) {
            i += 2;
            continue;
          }
          i += 1;
          break;
        }
        i += 1;
      }
      out += ' ';
      continue;
    }

    out += ch;
    i += 1;
  }
  return out;
}

/** 末尾のセミコロンを落としたうえで、区切りとして機能する `;` が残るか。 */
function hasMultipleStatements(bare: string): boolean {
  const trimmed = bare.trim().replace(/;+\s*$/, '');
  return trimmed.includes(';');
}

export function guardQuery(sql: string): GuardVerdict {
  const trimmed = sql.trim();
  if (trimmed === '') {
    return { ok: false, message: 'SQLが入力されていません。' };
  }

  const bare = stripCommentsAndStrings(trimmed).trim();
  if (bare === '') {
    // コメントだけ、など。
    return { ok: false, message: '実行できるSQLがありません。' };
  }

  if (hasMultipleStatements(bare)) {
    return {
      ok: false,
      message: '一度に実行できるSQLは1文だけです。`;` で区切らず、1つずつ実行してください。',
    };
  }

  const head = /^([a-z_]+)/i.exec(bare)?.[1] ?? '';
  if (!ALLOWED_HEAD.test(head)) {
    return { ok: false, message: WRITE_VERB_MESSAGE };
  }

  return { ok: true, sql: trimmed };
}

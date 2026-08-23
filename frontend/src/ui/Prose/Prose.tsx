import { Fragment } from 'react';

/**
 * CASEデータの本文を描く。
 *
 * 対応するのは `**強調**` と改行だけ。改行は CSS の `white-space: pre-wrap` に任せる。
 *
 * Markdown ライブラリは入れない。CASEデータは自分たちで書くもので、
 * 必要な表現はこれだけ。そして何より **CASEデータを HTML として解釈しない**
 * ことで、`dangerouslySetInnerHTML` を使わずに済む。
 */
export function Prose({ text, className }: { text: string; className?: string | undefined }) {
  return <p className={className}>{renderEmphasis(text)}</p>;
}

const EMPHASIS = /\*\*([^*]+)\*\*/g;

function renderEmphasis(text: string) {
  const nodes: React.ReactNode[] = [];
  let lastIndex = 0;
  let key = 0;

  for (const match of text.matchAll(EMPHASIS)) {
    const start = match.index;
    if (start > lastIndex) {
      nodes.push(<Fragment key={key++}>{text.slice(lastIndex, start)}</Fragment>);
    }
    nodes.push(<strong key={key++}>{match[1]}</strong>);
    lastIndex = start + match[0].length;
  }

  if (lastIndex < text.length) {
    nodes.push(<Fragment key={key++}>{text.slice(lastIndex)}</Fragment>);
  }
  return nodes;
}

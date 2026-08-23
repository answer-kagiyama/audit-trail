/**
 * 「もしかして」の候補選びに使う編集距離。
 *
 * 素のレーベンシュタイン距離ではなく **Damerau-Levenshtein（OSA）** を使う。
 * 隣接文字の入れ替わり（`nmae` → `name`）はタイポとして最も多いのに、
 * 素のレーベンシュタインだと距離2になって短い語では閾値を超えてしまうため。
 */
export function editDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  // 識別子どうしの比較なので短い。素直に行列を作る。
  const rows = a.length + 1;
  const cols = b.length + 1;
  const d: number[][] = Array.from({ length: rows }, () => new Array<number>(cols).fill(0));

  for (let i = 0; i < rows; i += 1) d[i]![0] = i;
  for (let j = 0; j < cols; j += 1) d[0]![j] = j;

  for (let i = 1; i < rows; i += 1) {
    for (let j = 1; j < cols; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let best = Math.min(
        d[i - 1]![j]! + 1, // 削除
        d[i]![j - 1]! + 1, // 挿入
        d[i - 1]![j - 1]! + cost, // 置換
      );
      // 隣接文字の入れ替わり
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        best = Math.min(best, d[i - 2]![j - 2]! + 1);
      }
      d[i]![j] = best;
    }
  }

  return d[a.length]![b.length]!;
}

/**
 * candidates の中から typo とみなせる最も近いものを返す。
 *
 * 閾値は語長に応じて緩める。短い語で誤爆すると、正しい語を打ったのに
 * 見当違いの候補を出されて、かえって混乱させるため。
 * 大小文字は無視して比較するが、返すのは候補の元の表記。
 */
export function closestMatch(input: string, candidates: readonly string[]): string | undefined {
  const needle = input.toLowerCase();
  const limit = needle.length <= 4 ? 1 : needle.length <= 8 ? 2 : 3;

  let best: string | undefined;
  let bestDistance = Number.POSITIVE_INFINITY;

  for (const candidate of candidates) {
    const distance = editDistance(needle, candidate.toLowerCase());
    if (distance < bestDistance) {
      bestDistance = distance;
      best = candidate;
    }
  }

  return bestDistance <= limit ? best : undefined;
}

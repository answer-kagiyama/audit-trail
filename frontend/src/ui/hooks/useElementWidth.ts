/**
 * 要素の**内容領域**の幅を測って返す。
 *
 * カラム幅を「画面に収まるか」で詰めるのに、実際に使える幅が要る。
 * `window.innerWidth` から引き算で求めると、余白やスクロールバーの分だけずれる。
 *
 * `clientWidth` は padding を**含む**ので、そのまま使うと余白のぶんだけ
 * 広く見積もってしまい、両端を広げたときに真ん中が下限を割る。
 *
 * 初期値は `window.innerWidth` からの見積もり。0 から始めると、
 * 測り終わるまでの1フレームだけカラムが潰れて見えるため。
 */
import { useEffect, useState } from 'react';
import type { RefObject } from 'react';

function contentWidth(element: HTMLElement): number {
  const style = getComputedStyle(element);
  const padding = parseFloat(style.paddingLeft) + parseFloat(style.paddingRight);
  return element.clientWidth - (Number.isFinite(padding) ? padding : 0);
}

export function useElementWidth(ref: RefObject<HTMLElement | null>, estimate: number): number {
  const [width, setWidth] = useState(estimate);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    // ResizeObserver が無い環境（古い JSDOM など）でも、初回の実測だけは合わせる。
    setWidth(contentWidth(element));
    if (typeof ResizeObserver === 'undefined') return;

    const observer = new ResizeObserver(() => {
      setWidth(contentWidth(element));
    });
    observer.observe(element);
    return () => {
      observer.disconnect();
    };
  }, [ref]);

  return width;
}

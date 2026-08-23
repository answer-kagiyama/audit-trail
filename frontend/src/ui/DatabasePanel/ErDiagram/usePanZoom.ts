/**
 * SVG の viewBox を操作するパン・ズーム。
 *
 * ER図は横に広い。モバイルでは全体が収まるようフィットさせたうえで、
 * ピンチズームとパンで細部を読めるようにする
 * （docs/game-design.md#モバイル）。
 */
import { useCallback, useRef, useState } from 'react';

export interface ViewBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

const MIN_SCALE = 0.4;
const MAX_SCALE = 4;
/** これ未満の移動はクリックとみなし、パンを始めない（px）。 */
const DRAG_THRESHOLD = 4;

export function usePanZoom(initial: ViewBox) {
  const [viewBox, setViewBox] = useState<ViewBox>(initial);
  const svgRef = useRef<SVGSVGElement | null>(null);
  /** 追跡中のポインタ。2本になったらピンチ。 */
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  /** 押し始めた位置。ドラッグ判定の起点。 */
  const dragOrigin = useRef(new Map<number, { x: number; y: number }>());
  const dragging = useRef(false);
  const pinchDistance = useRef<number | null>(null);

  const reset = useCallback(() => {
    setViewBox(initial);
    // initial はレンダリングごとに新しいオブジェクトになりうるので値で比較する。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initial.x, initial.y, initial.width, initial.height]);

  /** クライアント座標を viewBox 座標へ。 */
  const toUser = useCallback((clientX: number, clientY: number, box: ViewBox) => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0 || rect.height === 0) return { x: box.x, y: box.y };
    return {
      x: box.x + ((clientX - rect.left) / rect.width) * box.width,
      y: box.y + ((clientY - rect.top) / rect.height) * box.height,
    };
  }, []);

  const zoomAt = useCallback(
    (clientX: number, clientY: number, factor: number) => {
      setViewBox((box) => {
        const scale = initial.width / box.width;
        const nextScale = clamp(scale * factor, MIN_SCALE, MAX_SCALE);
        const applied = scale / nextScale;
        if (applied === 1) return box;

        const anchor = toUser(clientX, clientY, box);
        const width = box.width * applied;
        const height = box.height * applied;
        return {
          // アンカー（カーソル位置）が動かないように原点を寄せる。
          x: anchor.x - ((anchor.x - box.x) * width) / box.width,
          y: anchor.y - ((anchor.y - box.y) * height) / box.height,
          width,
          height,
        };
      });
    },
    [initial.width, toUser],
  );

  const onWheel = useCallback(
    (event: React.WheelEvent<SVGSVGElement>) => {
      event.preventDefault();
      zoomAt(event.clientX, event.clientY, event.deltaY > 0 ? 1 / 1.12 : 1.12);
    },
    [zoomAt],
  );

  const onPointerDown = useCallback((event: React.PointerEvent<SVGSVGElement>) => {
    // ここでは setPointerCapture しない。
    // 押した瞬間に捕捉すると pointerup が SVG ルートへ付け替えられ、
    // click の発火先も SVG ルートになる＝テーブルの箱をクリックできなくなる。
    // 捕捉は「実際にドラッグが始まってから」行う（下の onPointerMove）。
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    dragOrigin.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
  }, []);

  const onPointerMove = useCallback(
    (event: React.PointerEvent<SVGSVGElement>) => {
      const tracked = pointers.current;
      if (!tracked.has(event.pointerId)) return;

      const previous = tracked.get(event.pointerId);
      tracked.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (!previous) return;

      // 2本指: ピンチズーム
      if (tracked.size >= 2) {
        const [a, b] = [...tracked.values()];
        if (!a || !b) return;
        const distance = Math.hypot(a.x - b.x, a.y - b.y);
        if (pinchDistance.current !== null && pinchDistance.current > 0) {
          zoomAt((a.x + b.x) / 2, (a.y + b.y) / 2, distance / pinchDistance.current);
        }
        pinchDistance.current = distance;
        return;
      }

      pinchDistance.current = null;

      // 1本指: 閾値を超えて初めてドラッグとみなす。
      if (!dragging.current) {
        const origin = dragOrigin.current.get(event.pointerId);
        if (!origin) return;
        if (Math.hypot(event.clientX - origin.x, event.clientY - origin.y) < DRAG_THRESHOLD) return;
        dragging.current = true;
        event.currentTarget.setPointerCapture(event.pointerId);
      }

      setViewBox((box) => {
        const rect = svgRef.current?.getBoundingClientRect();
        if (!rect || rect.width === 0 || rect.height === 0) return box;
        return {
          ...box,
          x: box.x - ((event.clientX - previous.x) / rect.width) * box.width,
          y: box.y - ((event.clientY - previous.y) / rect.height) * box.height,
        };
      });
    },
    [zoomAt],
  );

  const endPointer = useCallback((event: React.PointerEvent<SVGSVGElement>) => {
    pointers.current.delete(event.pointerId);
    dragOrigin.current.delete(event.pointerId);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    if (pointers.current.size === 0) dragging.current = false;
    if (pointers.current.size < 2) pinchDistance.current = null;
  }, []);

  return {
    svgRef,
    viewBox,
    reset,
    handlers: {
      onWheel,
      onPointerDown,
      onPointerMove,
      onPointerUp: endPointer,
      onPointerCancel: endPointer,
      onPointerLeave: endPointer,
    },
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

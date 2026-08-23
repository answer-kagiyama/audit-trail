/**
 * main thread ↔ SQL Worker の postMessage プロトコル。
 *
 * Worker はゲームの概念（Objective / Evidence 等）を一切知らない。
 * 知っているのは「SQLを受けて結果表を返す」ことだけ。
 */
import type { QueryErrorKind, QueryResult } from './types.ts';

export type WorkerRequest =
  | { type: 'init'; id: number }
  | { type: 'load'; id: number; bytes: ArrayBuffer }
  | { type: 'exec'; id: number; sql: string; maxRows: number };

export type WorkerResponse =
  | { type: 'ready'; id: number }
  | { type: 'loaded'; id: number }
  | { type: 'result'; id: number; result: QueryResult }
  | { type: 'error'; id: number; kind: QueryErrorKind; rawMessage: string };

/**
 * main thread 側が Worker に求める最小の口。
 *
 * 実物の Worker と、テスト用の偽 Worker の両方がこれを満たす。
 * これがあるおかげで、タイムアウトと再起動の状態遷移を
 * 実ブラウザなしで（＝Vitest の node 環境で）テストできる。
 */
export interface WorkerLike {
  postMessage(message: WorkerRequest, transfer?: Transferable[]): void;
  terminate(): void;
  addEventListener(type: 'message', listener: (event: { data: WorkerResponse }) => void): void;
  addEventListener(type: 'error', listener: (event: unknown) => void): void;
}

export type WorkerFactory = () => WorkerLike;

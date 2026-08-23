/// <reference lib="webworker" />
/**
 * SQL 実行 Worker。
 *
 * main thread で sql.js を動かすと、クエリ実行中 UI が完全に固まる。
 * プレイヤーは試行錯誤の中で必ず事故クエリを書くので、
 * 中断できる場所（= Worker）に隔離することは必須の安全機構である。
 *
 * @see docs/architecture.md#なぜ-web-worker-か
 */
import wasmUrl from 'sql.js/dist/sql-wasm.wasm?url';
import { SqlJsCore } from './sqlJsCore.ts';
import type { WorkerRequest, WorkerResponse } from './protocol.ts';
import { isSqlExecutionError } from './types.ts';

const core = new SqlJsCore({ locateFile: () => wasmUrl });

function reply(message: WorkerResponse): void {
  self.postMessage(message);
}

function replyError(id: number, e: unknown): void {
  if (isSqlExecutionError(e)) {
    reply({ type: 'error', id, kind: e.kind, rawMessage: e.rawMessage });
    return;
  }
  reply({
    type: 'error',
    id,
    kind: 'unknown',
    rawMessage: e instanceof Error ? e.message : String(e),
  });
}

self.addEventListener('message', (event: MessageEvent<WorkerRequest>) => {
  const request = event.data;
  void (async () => {
    try {
      switch (request.type) {
        case 'init':
          await core.init();
          reply({ type: 'ready', id: request.id });
          break;
        case 'load':
          core.loadDatabase(new Uint8Array(request.bytes));
          reply({ type: 'loaded', id: request.id });
          break;
        case 'exec':
          reply({
            type: 'result',
            id: request.id,
            result: core.execute(request.sql, request.maxRows),
          });
          break;
      }
    } catch (e) {
      replyError(request.id, e);
    }
  })();
});

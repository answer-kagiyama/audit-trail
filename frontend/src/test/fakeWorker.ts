/**
 * WorkerLike のテスト用実装。
 *
 * 実物の Worker の代わりにこれを注入することで、
 * タイムアウトと再起動の状態遷移をブラウザなしで検証できる。
 * SQL 実行自体は本物の SqlJsCore が行うので、絵に描いた餅にはならない。
 */
import type { WorkerLike, WorkerRequest, WorkerResponse } from '../engine/protocol.ts';
import { SqlJsCore } from '../engine/sqlJsCore.ts';
import { isSqlExecutionError } from '../engine/types.ts';
import { nodeLocateFile } from './nodeSqlJs.ts';

export interface FakeWorkerOptions {
  /** true を返す SQL には応答しない（＝暴走クエリを模す）。 */
  hangOn?: (sql: string) => boolean;
}

export class FakeWorker implements WorkerLike {
  readonly core = new SqlJsCore({ locateFile: nodeLocateFile });
  terminated = false;

  private readonly listeners: ((event: { data: WorkerResponse }) => void)[] = [];

  private readonly options: FakeWorkerOptions;

  constructor(options: FakeWorkerOptions = {}) {
    this.options = options;
  }

  postMessage(message: WorkerRequest): void {
    if (this.terminated) return;
    // 実 Worker と同じく非同期に応答する。
    void (async () => {
      try {
        switch (message.type) {
          case 'init':
            await this.core.init();
            this.emit({ type: 'ready', id: message.id });
            break;
          case 'load':
            this.core.loadDatabase(new Uint8Array(message.bytes));
            this.emit({ type: 'loaded', id: message.id });
            break;
          case 'exec': {
            if (this.options.hangOn?.(message.sql)) return; // 応答しない
            const result = this.core.execute(message.sql, message.maxRows);
            this.emit({ type: 'result', id: message.id, result });
            break;
          }
        }
      } catch (e) {
        this.emit({
          type: 'error',
          id: message.id,
          kind: isSqlExecutionError(e) ? e.kind : 'unknown',
          rawMessage: e instanceof Error ? e.message : String(e),
        });
      }
    })();
  }

  terminate(): void {
    this.terminated = true;
    this.core.dispose();
  }

  addEventListener(type: 'message' | 'error', listener: unknown): void {
    if (type === 'message') {
      this.listeners.push(listener as (event: { data: WorkerResponse }) => void);
    }
  }

  private emit(data: WorkerResponse): void {
    if (this.terminated) return;
    for (const listener of this.listeners) listener({ data });
  }
}

/** 生成された FakeWorker を全部覚えておくファクトリ。再起動の検証に使う。 */
export function trackingFactory(options: FakeWorkerOptions = {}): {
  factory: () => WorkerLike;
  instances: FakeWorker[];
} {
  const instances: FakeWorker[] = [];
  return {
    instances,
    factory: () => {
      const worker = new FakeWorker(options);
      instances.push(worker);
      return worker;
    },
  };
}

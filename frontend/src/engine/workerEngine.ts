/**
 * SqlEngine の実装。Worker を所有し、タイムアウトと再起動を担当する。
 *
 * ゲーム側はこのクラスの型ではなく SqlEngine インターフェースだけを見る。
 *
 * @see docs/architecture.md#5-sql実行フロー
 */
import type { WorkerFactory, WorkerLike, WorkerRequest, WorkerResponse } from './protocol.ts';
import type { ExecuteOptions, QueryResult, SqlEngine } from './types.ts';
import { DEFAULT_MAX_ROWS, DEFAULT_TIMEOUT_MS, SqlExecutionError } from './types.ts';

interface Pending {
  resolve: (response: WorkerResponse) => void;
  reject: (error: unknown) => void;
}

export class WorkerSqlEngine implements SqlEngine {
  private worker: WorkerLike | null = null;
  private nextId = 1;
  private readonly pending = new Map<number, Pending>();

  /**
   * 読み込み済みDBの原本。
   *
   * Worker を terminate した後の再ロードに必要。DBは読み取り専用なので、
   * 再ロードすれば状態は完全に元通りになる（復元すべき差分がない）。
   */
  private dbBytes: ArrayBuffer | null = null;

  private readonly createWorker: WorkerFactory;

  constructor(createWorker: WorkerFactory) {
    this.createWorker = createWorker;
  }

  async init(): Promise<void> {
    if (this.worker) return;
    this.spawn();
    await this.send({ type: 'init', id: this.takeId() });
  }

  async loadDatabase(bytes: ArrayBuffer): Promise<void> {
    // postMessage で transfer すると元の ArrayBuffer は detach される。
    // 再起動時に再ロードできるよう、原本は必ず手元に残す。
    this.dbBytes = bytes.slice(0);
    await this.sendLoad();
  }

  async execute(sql: string, opts: ExecuteOptions = {}): Promise<QueryResult> {
    const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const maxRows = opts.maxRows ?? DEFAULT_MAX_ROWS;
    const id = this.takeId();

    const response = await this.withTimeout(
      this.send({ type: 'exec', id, sql, maxRows }),
      timeoutMs,
      sql,
    );

    if (response.type !== 'result') {
      throw new SqlExecutionError('unknown', `unexpected response: ${response.type}`);
    }
    return response.result;
  }

  async dispose(): Promise<void> {
    this.killWorker(new SqlExecutionError('unknown', 'engine disposed'));
    this.dbBytes = null;
    return Promise.resolve();
  }

  // --- internals ---------------------------------------------------------

  private takeId(): number {
    return this.nextId++;
  }

  private spawn(): void {
    const worker = this.createWorker();
    worker.addEventListener('message', (event: { data: WorkerResponse }) => {
      const response = event.data;
      const pending = this.pending.get(response.id);
      if (!pending) return;
      this.pending.delete(response.id);
      if (response.type === 'error') {
        pending.reject(new SqlExecutionError(response.kind, response.rawMessage));
      } else {
        pending.resolve(response);
      }
    });
    worker.addEventListener('error', (event: unknown) => {
      this.killWorker(new SqlExecutionError('unknown', `worker error: ${String(event)}`));
    });
    this.worker = worker;
  }

  private send(request: WorkerRequest, transfer?: Transferable[]): Promise<WorkerResponse> {
    const worker = this.worker;
    if (!worker) {
      return Promise.reject(new SqlExecutionError('unknown', 'engine is not initialized'));
    }
    return new Promise<WorkerResponse>((resolve, reject) => {
      this.pending.set(request.id, { resolve, reject });
      worker.postMessage(request, transfer);
    });
  }

  private async sendLoad(): Promise<void> {
    const bytes = this.dbBytes;
    if (!bytes) throw new SqlExecutionError('unknown', 'no database to load');
    // 原本は残し、コピーを転送する。
    const copy = bytes.slice(0);
    await this.send({ type: 'load', id: this.takeId(), bytes: copy }, [copy]);
  }

  /**
   * タイムアウトしたら Worker を殺し、新しい Worker を起動して DB を再ロードする。
   *
   * sql.js の実行は同期的で、走り出したクエリを中断する手段は terminate() しかない。
   * だからここは「性能上の配慮」ではなく、暴走クエリからの唯一の復帰経路である。
   */
  private async withTimeout(
    promise: Promise<WorkerResponse>,
    timeoutMs: number,
    sql: string,
  ): Promise<WorkerResponse> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        reject(new SqlExecutionError('timeout', `query exceeded ${timeoutMs}ms: ${sql}`));
      }, timeoutMs);
    });

    try {
      return await Promise.race([promise, timeout]);
    } catch (e) {
      if (e instanceof SqlExecutionError && e.kind === 'timeout') {
        await this.restart();
      }
      throw e;
    } finally {
      clearTimeout(timer);
    }
  }

  private async restart(): Promise<void> {
    this.killWorker(new SqlExecutionError('timeout', 'worker was restarted'));
    this.spawn();
    await this.send({ type: 'init', id: this.takeId() });
    if (this.dbBytes) await this.sendLoad();
  }

  private killWorker(reason: unknown): void {
    for (const pending of this.pending.values()) pending.reject(reason);
    this.pending.clear();
    this.worker?.terminate();
    this.worker = null;
  }
}

/** ブラウザ用のファクトリ。Vite が Worker をバンドルする。 */
export function browserWorkerFactory(): WorkerLike {
  return new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
}

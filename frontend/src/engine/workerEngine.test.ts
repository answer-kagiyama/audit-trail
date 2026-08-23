import { describe, expect, it } from 'vitest';
import { WorkerSqlEngine } from './workerEngine.ts';
import { SqlExecutionError, isSqlExecutionError } from './types.ts';
import { trackingFactory } from '../test/fakeWorker.ts';
import { readFixture } from '../test/nodeSqlJs.ts';

async function fixtureBytes(): Promise<ArrayBuffer> {
  const bytes = await readFixture();
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

const HANGING_SQL = 'SELECT 1 -- runaway';

describe('WorkerSqlEngine', () => {
  it('init → loadDatabase → execute が通しで動く', async () => {
    const { factory } = trackingFactory();
    const engine = new WorkerSqlEngine(factory);
    await engine.init();
    await engine.loadDatabase(await fixtureBytes());

    const result = await engine.execute('SELECT name FROM employees WHERE id = 12');
    expect(result.rows).toEqual([['田中 誠']]);
    await engine.dispose();
  });

  it('SQLエラーは SqlExecutionError として reject される', async () => {
    const { factory } = trackingFactory();
    const engine = new WorkerSqlEngine(factory);
    await engine.init();
    await engine.loadDatabase(await fixtureBytes());

    await expect(engine.execute('SELECT * FROM nope')).rejects.toThrow(SqlExecutionError);
    await engine.dispose();
  });

  it('タイムアウトすると Worker を terminate し、新しい Worker で遊び続けられる', async () => {
    const { factory, instances } = trackingFactory({ hangOn: (sql) => sql === HANGING_SQL });
    const engine = new WorkerSqlEngine(factory);
    await engine.init();
    await engine.loadDatabase(await fixtureBytes());
    expect(instances).toHaveLength(1);

    // 暴走クエリはタイムアウトで中断される。
    await expect(engine.execute(HANGING_SQL, { timeoutMs: 30 })).rejects.toMatchObject({
      kind: 'timeout',
    });

    // 古い Worker は殺され、新しい Worker が立ち上がっている。
    expect(instances[0]?.terminated).toBe(true);
    expect(instances).toHaveLength(2);
    expect(instances[1]?.terminated).toBe(false);

    // ★ ここが本質: 暴走した後も、DBが再ロードされて続けて実行できる。
    const result = await engine.execute('SELECT name FROM employees WHERE id = 7');
    expect(result.rows).toEqual([['山田 咲']]);

    await engine.dispose();
  });

  it('タイムアウトを何度繰り返しても復帰できる', async () => {
    const { factory, instances } = trackingFactory({ hangOn: (sql) => sql === HANGING_SQL });
    const engine = new WorkerSqlEngine(factory);
    await engine.init();
    await engine.loadDatabase(await fixtureBytes());

    for (let i = 0; i < 3; i += 1) {
      await expect(engine.execute(HANGING_SQL, { timeoutMs: 20 })).rejects.toMatchObject({
        kind: 'timeout',
      });
      const ok = await engine.execute('SELECT COUNT(*) AS c FROM employees');
      expect(ok.rows).toEqual([[4]]);
    }
    expect(instances).toHaveLength(4);
    await engine.dispose();
  });

  it('原本の ArrayBuffer を転送で失わない（再起動時に再ロードできる）', async () => {
    const { factory } = trackingFactory({ hangOn: (sql) => sql === HANGING_SQL });
    const engine = new WorkerSqlEngine(factory);
    await engine.init();

    const bytes = await fixtureBytes();
    await engine.loadDatabase(bytes);
    // 呼び出し側の ArrayBuffer は detach されていない。
    expect(bytes.byteLength).toBeGreaterThan(0);

    await expect(engine.execute(HANGING_SQL, { timeoutMs: 20 })).rejects.toThrow();
    await expect(
      engine.execute('SELECT id FROM employees ORDER BY id LIMIT 1'),
    ).resolves.toMatchObject({ rows: [[1]] });
    await engine.dispose();
  });

  it('ガード違反は Worker に送られず forbidden で失敗する', async () => {
    const { factory, instances } = trackingFactory();
    const engine = new WorkerSqlEngine(factory);
    await engine.init();
    await engine.loadDatabase(await fixtureBytes());

    await expect(engine.execute('DELETE FROM employees')).rejects.toMatchObject({
      kind: 'forbidden',
    });
    // Worker は生きたまま（terminate も再起動もしていない）。
    expect(instances).toHaveLength(1);
    expect(instances[0]?.terminated).toBe(false);

    // DBも無傷。
    await expect(engine.execute('SELECT COUNT(*) AS c FROM employees')).resolves.toMatchObject({
      rows: [[4]],
    });
    await engine.dispose();
  });

  it('init 前の execute は失敗する', async () => {
    const { factory } = trackingFactory();
    const engine = new WorkerSqlEngine(factory);
    await expect(engine.execute('SELECT 1')).rejects.toSatisfy(isSqlExecutionError);
  });

  it('dispose すると Worker が terminate される', async () => {
    const { factory, instances } = trackingFactory();
    const engine = new WorkerSqlEngine(factory);
    await engine.init();
    await engine.dispose();
    expect(instances[0]?.terminated).toBe(true);
  });
});

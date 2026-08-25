import { describe, expect, it } from 'vitest';
import {
  CENTER_MIN,
  DATABASE_MAX,
  DATABASE_MIN,
  HANDLE,
  RAIL,
  STORY_MAX,
  STORY_MIN,
  centerWidth,
  clampColumns,
  defaultColumns,
  gridTemplate,
} from './columns.ts';

/** `.wide` の左右余白（var(--space-3) × 2）を引いた、カラムに使える幅。 */
const usable = (viewport: number) => viewport - 24;

const open = (available: number) => ({
  available,
  storyCollapsed: false,
  databaseCollapsed: false,
});

/** ER図の描画倍率。図は 852x441、枠の余白が横 28px / 縦 127px。 */
const erScale = (databaseWidth: number, columnHeight: number) =>
  Math.min((databaseWidth - 28) / 852, (columnHeight - 127) / 441);

describe('defaultColumns', () => {
  it('Story は 352px から始まる', () => {
    expect(defaultColumns(usable(1920)).story).toBe(352);
  });

  it('既定が収まらない狭い画面では、既定のほうを詰める', () => {
    // Story 352 + Database 288 + 真ん中 448 + 掴み手 12 = 1100px 要る。
    expect(defaultColumns(usable(900))).toEqual({ story: STORY_MIN, database: DATABASE_MIN });
    expect(defaultColumns(usable(1124)).story).toBe(352);
  });

  it('Database は残りの 45%', () => {
    // (1896 - 352 - 12) * 0.45 = 689.4
    expect(defaultColumns(usable(1920)).database).toBe(689);
  });

  it('等倍（880px）で頭打ちになる。それ以上広げても図は大きくならない', () => {
    expect(defaultColumns(usable(2560)).database).toBe(DATABASE_MAX);
    expect(defaultColumns(usable(3840)).database).toBe(DATABASE_MAX);
  });

  it('狭い画面でも下限を割らない', () => {
    expect(defaultColumns(usable(900)).database).toBe(DATABASE_MIN);
  });

  it('既定でも、いまの縦積み（0.21倍）より確実に大きい', () => {
    // 縦積みの Database は 224px 高で 0.21倍だった（docs/ui-layout.md §5.3）。
    for (const [viewport, height] of [
      [1280, 539],
      [1440, 639],
      [1920, 779],
      [2560, 1219],
    ] as const) {
      const { database } = defaultColumns(usable(viewport));
      expect(erScale(database, height)).toBeGreaterThan(0.21 * 1.5);
    }
  });
});

describe('clampColumns', () => {
  it('下限と上限で止める', () => {
    const context = open(usable(2560));
    expect(clampColumns({ story: 10, database: 10 }, context)).toEqual({
      story: STORY_MIN,
      database: DATABASE_MIN,
    });
    expect(clampColumns({ story: 9999, database: 9999 }, context)).toEqual({
      story: STORY_MAX,
      database: DATABASE_MAX,
    });
  });

  it('真ん中が下限を割りそうなら Database から削る', () => {
    // Story は動かさず、Database だけが削られる。
    const context = open(1400);
    const result = clampColumns({ story: 352, database: DATABASE_MAX }, context);
    expect(result.story).toBe(352);
    expect(result.database).toBe(1400 - 352 - HANDLE * 2 - CENTER_MIN);
    expect(centerWidth(result, context)).toBe(CENTER_MIN);
  });

  it('Database を下限まで削っても足りなければ、次に Story を削る', () => {
    const context = open(1150);
    const result = clampColumns({ story: STORY_MAX, database: DATABASE_MAX }, context);
    expect(result.database).toBe(DATABASE_MIN);
    expect(result.story).toBeGreaterThan(STORY_MIN);
    expect(result.story).toBeLessThan(STORY_MAX);
    expect(centerWidth(result, context)).toBe(CENTER_MIN);
  });

  it('両方を下限まで詰めても足りないときは、真ん中に譲る', () => {
    // 900px の画面（ここより下はタブ表示）でも、両端は下限を保つ。
    const context = open(usable(900));
    const result = clampColumns({ story: 352, database: 400 }, context);
    expect(result).toEqual({ story: STORY_MIN, database: DATABASE_MIN });
    expect(centerWidth(result, context)).toBeGreaterThan(0);
  });

  it('畳んだカラムは 0 幅になり、その分だけ真ん中が広がる', () => {
    const available = usable(1280);
    const both = clampColumns(
      { story: 352, database: 400 },
      { available, storyCollapsed: false, databaseCollapsed: false },
    );
    const context = { available, storyCollapsed: true, databaseCollapsed: false };
    const collapsed = clampColumns({ story: 352, database: 400 }, context);

    expect(collapsed.story).toBe(0);
    expect(collapsed.database).toBe(400);
    expect(centerWidth(collapsed, context)).toBeGreaterThan(
      centerWidth(both, { available, storyCollapsed: false, databaseCollapsed: false }),
    );
  });

  it('Database を畳むと、掴み手ではなくレールの幅になる', () => {
    const context = { available: usable(1280), storyCollapsed: false, databaseCollapsed: true };
    const widths = clampColumns({ story: 352, database: 400 }, context);
    expect(widths.database).toBe(0);
    expect(centerWidth(widths, context)).toBe(usable(1280) - 352 - HANDLE - RAIL);
  });

  it('広い画面では望んだ幅がそのまま通る', () => {
    const context = open(usable(2560));
    expect(clampColumns({ story: 400, database: 700 }, context)).toEqual({
      story: 400,
      database: 700,
    });
  });

  it('既定の幅は、どの画面でもそのまま通る（自分で自分を削らない）', () => {
    for (const viewport of [900, 1024, 1280, 1440, 1920, 2560]) {
      const context = open(usable(viewport));
      const want = defaultColumns(usable(viewport));
      expect(clampColumns(want, context)).toEqual(want);
    }
  });
});

describe('gridTemplate', () => {
  it('開いているときは 5トラック（Story / 掴み手 / 中央 / 掴み手 / Database）', () => {
    expect(gridTemplate({ story: 352, database: 400 }, open(1896))).toBe(
      '352px 6px minmax(0, 1fr) 6px 400px',
    );
  });

  it('畳んだ側は掴み手が消えてレールになる', () => {
    expect(
      gridTemplate(
        { story: 0, database: 400 },
        { available: 1896, storyCollapsed: true, databaseCollapsed: false },
      ),
    ).toBe('28px 0px minmax(0, 1fr) 6px 400px');
  });
});

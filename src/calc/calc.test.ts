import { describe, expect, it } from 'vitest';
import type { Cardinal, CenterRecord, LineReading, PlumbLine } from '../model/types';
import { DEFAULT_CONFIG, DEFAULT_LABELS, demoData } from '../model/defaults';
import { centersFromA, centersFromPlumb, latestPerElevation } from './center';
import { compareObs } from './compare';
import { describeOffset, lineDisplacement } from './direction';
import { importCenterRecords, importReadings } from './csv';
import { linear, offsetToSvg, planPxPerM, profileDomain } from '../charts/geometry';
import { validateReadings } from './validate';

const L = DEFAULT_LABELS;
const PX = planPxPerM(12.5, 210);

function recA(x: number | null, y: number | null, elevation = 10): CenterRecord {
  return { id: 'r' + Math.random(), siloId: 'A1', time: '2026-09-10T08:00', elevation, x, y, note: '' };
}

/** 构造一条铅垂线：读数为线至仓壁距离，读数增大方向与测点所在侧相反 */
function line(side: Cardinal, id = side): PlumbLine {
  const pos = ({ E: 'W', W: 'E', N: 'S', S: 'N' } as const)[side];
  return { id, siloId: 'B1', name: side, side, azimuthText: '', basePosition: '', positiveDir: pos, positiveText: '', baseReading: 100, note: '' };
}
function rd(lineId: string, reading: number, elevation = 10): LineReading {
  return { id: lineId + elevation + reading, lineId, time: '2026-09-12T09:00', elevation, reading, note: '' };
}

/** 平面图箭头方向：返回 SVG 位移符号 */
function arrowSign(x: number, y: number) {
  const { dx, dy } = offsetToSvg(x, y, PX, 50);
  return { right: Math.sign(dx), down: Math.sign(dy) };
}

describe('1. X、Y 均为零', () => {
  it('合成为 0，箭头长度为 0，文字为无偏移', () => {
    const [o] = centersFromA([recA(0, 0)]);
    expect(o.resultant).toBe(0);
    expect(offsetToSvg(0, 0, PX, 100)).toEqual({ dx: 0, dy: 0 });
    expect(describeOffset(0, 0, L)).toContain('无偏移');
  });
});

describe('2. 东、西、南、北单方向偏移（方式 A）', () => {
  const cases: [string, number, number, string, { right: number; down: number }][] = [
    ['东', 10, 0, '向东 10.0 mm', { right: 1, down: 0 }],
    ['西', -10, 0, '向西 10.0 mm', { right: -1, down: 0 }],
    ['北', 0, 10, '向北 10.0 mm', { right: 0, down: -1 }],
    ['南', 0, -10, '向南 10.0 mm', { right: 0, down: 1 }],
  ];
  for (const [name, x, y, text, sign] of cases) {
    it(`向${name}`, () => {
      const [o] = centersFromA([recA(x, y)]);
      expect(o.resultant).toBeCloseTo(10);
      expect(describeOffset(o.x, o.y, L)).toContain(text);
      expect(arrowSign(x, y)).toEqual(sign);
      // 立面图：正值在零线右侧
      const s = linear([-20, 20], [0, 400]);
      if (x !== 0) expect(Math.sign(s(x) - s(0))).toBe(Math.sign(x));
      if (y !== 0) expect(Math.sign(s(y) - s(0))).toBe(Math.sign(y));
    });
  }
});

describe('2b. 东、西、南、北单方向偏移（方式 B 铅垂线）', () => {
  const lines = (['E', 'W', 'N', 'S'] as Cardinal[]).map((s) => line(s));
  // 整体向东平移 10 mm：东侧线距减小 10 → 读数 90；西侧线距增大 10 → 读数 110；南北不变
  it('整体向东 10 mm', () => {
    const [o] = centersFromPlumb(lines, [rd('E', 90), rd('W', 110), rd('N', 100), rd('S', 100)]);
    expect(o.x).toBeCloseTo(10);
    expect(o.y).toBeCloseTo(0);
    expect(o.diamX).toBeCloseTo(0);
    expect(o.status).toBe('complete');
  });
  it('整体向西 10 mm', () => {
    const [o] = centersFromPlumb(lines, [rd('E', 110), rd('W', 90), rd('N', 100), rd('S', 100)]);
    expect(o.x).toBeCloseTo(-10);
  });
  it('整体向北 10 mm', () => {
    const [o] = centersFromPlumb(lines, [rd('E', 100), rd('W', 100), rd('N', 90), rd('S', 110)]);
    expect(o.y).toBeCloseTo(10);
    expect(o.x).toBeCloseTo(0);
  });
  it('整体向南 10 mm', () => {
    const [o] = centersFromPlumb(lines, [rd('E', 100), rd('W', 100), rd('N', 110), rd('S', 90)]);
    expect(o.y).toBeCloseTo(-10);
  });
  it('中心不动、X 向直径增大 6 mm：中心 0，尺寸变化 +6', () => {
    const [o] = centersFromPlumb(lines, [rd('E', 97), rd('W', 97), rd('N', 100), rd('S', 100)]);
    expect(o.x).toBeCloseTo(0);
    expect(o.diamX).toBeCloseTo(6);
  });
});

describe('3. 东北方向组合偏移', () => {
  it('X=+30、Y=+40 → 合成 50，箭头右上', () => {
    const [o] = centersFromA([recA(30, 40)]);
    expect(o.resultant).toBeCloseTo(50);
    expect(describeOffset(30, 40, L)).toBe('向东 30.0 mm、向北 40.0 mm');
    expect(arrowSign(30, 40)).toEqual({ right: 1, down: -1 });
  });
});

describe('4. 只有单侧读数', () => {
  it('仅东侧：保留测点位移，中心偏移数据不足', () => {
    const l = line('E');
    const obs = centersFromPlumb([l], [rd('E', 94)]);
    expect(obs).toHaveLength(1);
    expect(obs[0].x).toBeNull();
    expect(obs[0].y).toBeNull();
    expect(obs[0].resultant).toBeNull();
    expect(obs[0].status).toBe('insufficient');
    // 测点本身：读数减小 6 → 向东 6
    const d = lineDisplacement(l, rd('E', 94))!;
    expect(d.along).toBe(-6);
    expect(d.dx).toBe(6);
  });
});

describe('5. 有一组相对测点但缺少另一组', () => {
  it('只有东西两侧：X 可算，Y 为 null，合成为 null', () => {
    const [o] = centersFromPlumb([line('E'), line('W')], [rd('E', 95), rd('W', 105)]);
    expect(o.x).toBeCloseTo(5);
    expect(o.y).toBeNull();
    expect(o.resultant).toBeNull();
    expect(o.status).toBe('x-only');
  });
  it('四线齐全但某标高南侧缺失：该标高仅 X', () => {
    const d = demoData();
    const obs = centersFromPlumb(d.lines, d.readings).filter((o) => o.siloId === '15');
    const at30 = obs.find((o) => o.elevation === 30)!;
    expect(at30.status).toBe('x-only');
    expect(at30.y).toBeNull();
    const at36 = obs.find((o) => o.elevation === 36)!;
    expect(at36.status).toBe('complete');
    expect(at36.x).toBeCloseTo(9, 0); // 演示模型 0.25×36
    expect(at36.y).toBeCloseTo(-5.4, 0); // 演示模型 −0.15×36
  });
});

describe('6. 不同标高记录缺失', () => {
  it('只输出已测标高，不插值', () => {
    const obs = centersFromA([recA(1, 1, 0), recA(3, 2, 20)]);
    expect(obs.map((o) => o.elevation)).toEqual([0, 20]);
    expect(latestPerElevation(obs)).toHaveLength(2);
  });
});

describe('7. 修改坐标方向名称', () => {
  it('文字随名称变化，数值与箭头不变', () => {
    const custom = { posX: '①轴右', negX: '①轴左', posY: 'A轴上', negY: 'A轴下', xName: 'U', yName: 'V' };
    expect(describeOffset(12, -5, custom)).toBe('向①轴右 12.0 mm、向A轴下 5.0 mm');
    const [o] = centersFromA([recA(12, -5)]);
    expect(o.x).toBe(12);
    expect(o.y).toBe(-5);
    expect(arrowSign(12, -5)).toEqual({ right: 1, down: 1 });
  });
});

describe('8. 修改显示放大倍数', () => {
  it('只改变显示长度，按倍数线性放大；计算结果不变', () => {
    const a = offsetToSvg(12, 5, PX, 1);
    const b = offsetToSvg(12, 5, PX, 100);
    expect(b.dx / a.dx).toBeCloseTo(100);
    expect(b.dy / a.dy).toBeCloseTo(100);
    // 1× 时 12 mm 在 12.5 m 圆上仅约 0.4 px —— 放大前几乎不可见
    expect(Math.abs(a.dx)).toBeLessThan(1);
    const [o] = centersFromA([recA(12, 5)]);
    expect(o.resultant).toBeCloseTo(13);
  });
});

describe('比较：合成偏移量变化 ≠ 中心移动', () => {
  it('(+10,0) → (0,+10)：中心移动 14.1，合成变化 0', () => {
    const [p] = centersFromA([recA(10, 0)]);
    const [c] = centersFromA([recA(0, 10)]);
    const cmp = compareObs(c, p);
    expect(cmp.move).toBeCloseTo(14.142, 2);
    expect(cmp.dResultant).toBeCloseTo(0);
  });
});

describe('导入与校验', () => {
  it('单位混用：不换算，附提示', () => {
    const { items, messages } = importCenterRecords('筒仓编号,观测时间,标高,X,Y,备注\nA1,2026/9/10 8:00,40.5,0.012m,5,\n');
    expect(items).toHaveLength(1);
    expect(items[0].x).toBe(0.012);
    expect(items[0].time).toBe('2026-09-10T08:00');
    expect(messages[0]).toContain('单位混用');
    expect(items[0].flags?.[0]).toContain('单位混用');
  });
  it('读数突变提示', () => {
    const l = line('E');
    const d = { ...demoData(), lines: [l], config: DEFAULT_CONFIG };
    const issues = validateReadings([rd('E', 100, 0), rd('E', 140, 5)], d);
    expect(issues.some((i) => i.message.includes('突变'))).toBe(true);
  });
  it('读数导入找不到观测线时不导入', () => {
    const r = importReadings('B9,不存在,2026-09-12 09:00,10,100,', [line('E')]);
    expect(r.items).toHaveLength(0);
    expect(r.messages[0]).toContain('未找到');
  });
});

describe('立面图范围', () => {
  it('对称且覆盖所有值与阈值', () => {
    const [a, b] = profileDomain([3, -12], [15], false);
    expect(a).toBe(-b);
    expect(b).toBeGreaterThanOrEqual(15);
  });
});

import { levelOf, thresholdsReady } from './compare';
import { EMPTY_THRESHOLDS } from '../model/defaults';

describe('阈值', () => {
  it('未填写来源/版本/设置人时不启用判断', () => {
    const t = { ...EMPTY_THRESHOLDS, resultantWarning: 10 };
    expect(thresholdsReady(t)).toBe(false);
    expect(levelOf(50, 10, 20, thresholdsReady(t))).toBe('none');
  });
  it('填写完整后按预警 / 控制分级；数据缺失不判断', () => {
    const t = { ...EMPTY_THRESHOLDS, resultantWarning: 10, resultantControl: 20, source: '专项方案', version: 'v1', setBy: '张工' };
    const ok = thresholdsReady(t);
    expect(levelOf(8, 10, 20, ok)).toBe('none');
    expect(levelOf(15, 10, 20, ok)).toBe('warn');
    expect(levelOf(25, 10, 20, ok)).toBe('control');
    expect(levelOf(null, 10, 20, ok)).toBe('none');
  });
});

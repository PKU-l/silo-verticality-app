import { describe, expect, it } from 'vitest';
import type { DistPoint, DistReading, DrawSide, Indicator } from '../model/distTypes';
import {
  calcReading, checkIndicator, combineCorner, defaultDesignChange, describeDrawing, describeProject, drawingToProject,
  pickReadings, pointStatus, previousReading,
} from './distance';
import { demoData, DEFAULT_LABELS } from '../model/defaults';

function pt(side: DrawSide, o: Partial<DistPoint> = {}): DistPoint {
  const n = { up: '上', down: '下', left: '左', right: '右' }[side];
  return {
    id: `16-${n}`, siloId: '16', side, baseElevation: 0.5, baseDistance: 150, baseConfirmed: true, directionConfirmed: true,
    lineDesc: '', surveyor: '', reviewer: '', reviewedAt: '', note: '', active: true, ...o,
  };
}
function rd(pointId: string, distance: number | null, o: Partial<DistReading> = {}): DistReading {
  return {
    id: pointId + Math.random(), pointId, roundId: 'r', time: '2026-09-20T08:00', elevation: 10, distance, designChange: 0, designBasis: '',
    validity: 'valid', surveyor: '', reviewer: '', reviewedAt: '', note: '', ...o,
  };
}

describe('1. 零变化', () => {
  it('本次距离 = 基准距离 → 差值 0，分量 0，文字“无变化”', () => {
    const p = pt('left');
    const c = calcReading(p, rd(p.id, 150));
    expect(c.raw).toBe(0);
    expect(c.corrected).toBe(0);
    expect(c.component).toBe(0);
    expect(describeDrawing(c.axis, c.component)).toBe('无变化');
  });
});

describe('2. 正负方向（基准线在仓壁外侧）', () => {
  const cases: [DrawSide, number, 'u' | 'v', number, string][] = [
    ['left', 153, 'u', 3, '向图纸右 3.0 mm'], // 距离增大 → 仓壁离开左侧基准线 → 向右
    ['left', 147, 'u', -3, '向图纸左 3.0 mm'],
    ['right', 153, 'u', -3, '向图纸左 3.0 mm'],
    ['right', 147, 'u', 3, '向图纸右 3.0 mm'],
    ['up', 153, 'v', -3, '向图纸下 3.0 mm'],
    ['up', 147, 'v', 3, '向图纸上 3.0 mm'],
    ['down', 153, 'v', 3, '向图纸上 3.0 mm'],
    ['down', 147, 'v', -3, '向图纸下 3.0 mm'],
  ];
  for (const [side, dist, axis, comp, text] of cases) {
    it(`${side} 点，本次 ${dist}`, () => {
      const p = pt(side);
      const c = calcReading(p, rd(p.id, dist));
      expect(c.raw).toBe(dist - 150);
      expect(c.axis).toBe(axis);
      expect(c.component).toBe(comp);
      expect(describeDrawing(c.axis, c.component)).toBe(text);
    });
  }
});

describe('3. 只有单侧读数', () => {
  it('角仓只有一个点有数据：只给一个分量，不生成组合', () => {
    const up = pt('up'), left = pt('left');
    const picked = new Map([[up.id, rd(up.id, 147)], [left.id, null]]);
    const r = combineCorner('16', [up, left], picked, 0);
    expect(r.v).toBe(3);
    expect(r.u).toBeNull();
    expect(r.magnitude).toBeNull();
    expect(r.notes[0]).toContain('只有一个方向');
  });
});

describe('4. 基准值缺失', () => {
  it('缺底部基准距离：不计算差值，状态为数据不完整', () => {
    const p = pt('left', { baseDistance: null, baseConfirmed: false });
    const r = rd(p.id, 153);
    const c = calcReading(p, r);
    expect(c.raw).toBeNull();
    expect(c.component).toBeNull();
    expect(pointStatus(p, r, null, 20).status).toBe('incomplete');
  });
  it('空白本次距离不当作 0', () => {
    const p = pt('left');
    const c = calcReading(p, rd(p.id, null));
    expect(c.raw).toBeNull();
    expect(c.component).toBeNull();
  });
});

describe('5. 设计修正值', () => {
  it('非零：修正后 = 原始 − 设计', () => {
    const p = pt('left');
    const c = calcReading(p, rd(p.id, 157, { designChange: 4, elevation: 35 }));
    expect(c.raw).toBe(7);
    expect(c.corrected).toBe(3);
    expect(c.component).toBe(3);
  });
  it('缺少设计修正：显示原始差值，不输出方向', () => {
    const p = pt('left');
    const r = rd(p.id, 157, { designChange: null, elevation: 35 });
    const c = calcReading(p, r);
    expect(c.raw).toBe(7);
    expect(c.corrected).toBeNull();
    expect(c.component).toBeNull();
    expect(pointStatus(p, r, null, 20).status).toBe('incomplete');
  });
  it('仅在已确认的竖直仓壁范围内默认设计修正为 0', () => {
    const vw = { confirmed: true, from: 0, to: 30, basis: '设计图' };
    expect(defaultDesignChange(vw, 0.5, 20).value).toBe(0);
    expect(defaultDesignChange(vw, 0.5, 35).value).toBeNull();
    expect(defaultDesignChange({ ...vw, confirmed: false }, 0.5, 20).value).toBeNull();
  });
});

describe('方向未确认', () => {
  it('只显示原始距离与差值，不输出方向分量，状态为方向待确认', () => {
    const p = pt('right', { directionConfirmed: false });
    const r = rd(p.id, 153);
    const c = calcReading(p, r);
    expect(c.raw).toBe(3);
    expect(c.corrected).toBe(3);
    expect(c.component).toBeNull();
    expect(pointStatus(p, r, null, 20).status).toBe('dir-pending');
  });
});

describe('6. 八点标高不一致', () => {
  const d = demoData();
  it('按目标标高筛选：标高不符的点不被选入（不插值）', () => {
    const m = pickReadings(d.distPoints, d.distReadings, { kind: 'elevation', elevation: 20, tolerance: 0 });
    expect(m.get('10-上')!.elevation).toBe(20);
    expect(m.get('10-右')).toBeNull(); // 实测在 20.5 m
    expect(m.get('16-下')).toBeNull(); // 第 2 轮未测
  });
  it('按轮次：两点标高不同 → 显示各自标高，不组合', () => {
    const m = pickReadings(d.distPoints, d.distReadings, { kind: 'round', roundId: 'demo-d2' });
    const r = combineCorner('10', d.distPoints, m, 0);
    expect(r.u).not.toBeNull();
    expect(r.v).not.toBeNull();
    expect(r.sameElevation).toBe(false);
    expect(r.magnitude).toBeNull();
    expect(r.notes[0]).toContain('20.5 m / 20 m');
  });
  it('同标高两点有效 → 组合位移量 = SQRT(u² + v²)', () => {
    const m = pickReadings(d.distPoints, d.distReadings, { kind: 'round', roundId: 'demo-d2' });
    const r = combineCorner('12', d.distPoints, m, 0);
    expect(r.u).toBeCloseTo(3, 6);
    expect(r.v).toBeCloseTo(2, 6);
    expect(r.magnitude).toBeCloseTo(Math.sqrt(13), 6);
  });
});

describe('7. 图纸方向与项目北向不一致', () => {
  const l = DEFAULT_LABELS; // +X 东、+Y 北
  it('θ = 0：图纸右 = 东', () => {
    expect(describeProject(3, 0, 0, l)).toBe('向东 3.0 mm');
  });
  it('θ = 90°（项目 +Y 指向图纸右）：图纸右 = 北，图纸上 = 西', () => {
    expect(drawingToProject(3, 0, 90).y).toBeCloseTo(3);
    expect(describeProject(3, 0, 90, l)).toBe('向北 3.0 mm');
    expect(describeProject(0, 2, 90, l)).toBe('向西 2.0 mm');
  });
});

describe('8. 指标', () => {
  const ind: Indicator = {
    id: 'i', name: '测试', ratioPermil: 1, cap: 30, startElevation: 0, target: 'corner-combo', source: '批准文件', version: '1',
    status: 'approved', approvedBy: '甲', approvedAt: '2026-09-01', note: '',
  };
  it('未批准：不显示对照', () => {
    const c = checkIndicator({ ...ind, status: 'draft' }, 'corner-combo', 10, 20);
    expect(c.applicable).toBe(false);
    expect(c.reason).toContain('未批准');
  });
  it('H = 39.5 m、封顶 30 mm → 允许偏移 30 mm', () => {
    const c = checkIndicator(ind, 'corner-combo', 12, 39.5);
    expect(c.H).toBeCloseTo(39.5);
    expect(c.allowed).toBe(30);
    expect(c.exceeds).toBe(false);
  });
  it('H = 20 m → 允许偏移 20 mm（未到封顶）', () => {
    expect(checkIndicator(ind, 'corner-combo', 25, 20).allowed).toBe(20);
    expect(checkIndicator(ind, 'corner-combo', 25, 20).exceeds).toBe(true);
  });
  it('适用对象不同不得混用', () => {
    const c = checkIndicator(ind, 'point-change', 5, 20);
    expect(c.applicable).toBe(false);
    expect(checkIndicator(ind, 'platform-center', 5, 20).applicable).toBe(false);
  });
  it('演示指标为未批准', () => {
    expect(demoData().indicators[0].status).toBe('draft');
  });
});

describe('突变与状态', () => {
  it('前后距离变化相差超过提示值 → 待复核', () => {
    const p = pt('left');
    const a = rd(p.id, 150, { time: '2026-09-15T08:00' });
    const b = rd(p.id, 175, { time: '2026-09-22T08:00' });
    expect(previousReading([a, b], b)).toBe(a);
    expect(pointStatus(p, b, a, 20).status).toBe('review');
  });
  it('演示：16-右 方向待确认，18-左 基准缺失', () => {
    const d = demoData();
    const m = pickReadings(d.distPoints, d.distReadings, { kind: 'round', roundId: 'demo-d1' });
    const st = (id: string) => pointStatus(d.distPoints.find((p) => p.id === id)!, m.get(id)!, null, 20).status;
    expect(st('16-右')).toBe('dir-pending');
    expect(st('18-左')).toBe('incomplete');
    expect(st('12-上')).toBe('done');
  });
});

import { indicatorFlag, indicatorText } from './distance';

describe('指标按测量对象分别对照（垂准仪 / 八点不混用）', () => {
  const base: Indicator = {
    id: 'p', name: '平台指标', ratioPermil: 1, cap: 30, startElevation: 0, target: 'platform-center', source: '批准文件', version: '1',
    status: 'approved', approvedBy: '甲', approvedAt: '2026-09-01', note: '',
  };
  it('平台中心偏移指标只作用于垂准仪结果', () => {
    expect(indicatorFlag([base], 'platform-center', 25, 20).level).toBe('control'); // 允许 20
    expect(indicatorFlag([base], 'platform-center', 15, 20).level).toBe('none');
    expect(indicatorFlag([base], 'corner-combo', 25, 20).chk.applicable).toBe(false);
    expect(indicatorFlag([base], 'point-change', 25, 20).chk.applicable).toBe(false);
  });
  it('角仓组合指标不影响垂准仪结果', () => {
    const corner = { ...base, id: 'c', target: 'corner-combo' as const };
    expect(indicatorFlag([corner], 'platform-center', 25, 20).level).toBe('none');
    expect(indicatorText('platform-center', indicatorFlag([corner], 'platform-center', 25, 20), 25)).toContain('未配置适用的指标');
  });
  it('未批准时不标红', () => {
    expect(indicatorFlag([{ ...base, status: 'draft' }], 'platform-center', 99, 20).level).toBe('none');
  });
  it('多个已批准指标取最近批准的一个', () => {
    const newer = { ...base, id: 'n', cap: 10, approvedAt: '2026-09-20' };
    expect(indicatorFlag([base, newer], 'platform-center', 15, 20).chk.allowed).toBe(10);
  });
});

import { migrateLayout, normalize } from '../model/store';
import { positionLabel } from './layout';

describe('仓号排列调整后的数据迁移', () => {
  it('旧点号按图纸位置改为新点号，读数与轮次顺序随之更新，仓位置按新图纸', () => {
    const old = {
      distPoints: [
        { ...pt('up'), id: '16-上', siloId: '16', baseDistance: 150 },
        { ...pt('left'), id: '16-左', siloId: '16', baseDistance: 148 },
        { ...pt('down'), id: '12-下', siloId: '12', baseDistance: 151 },
      ],
      distReadings: [rd('16-上', 153), rd('12-下', 149)],
      rounds: [{ id: 'r', name: '', createdAt: '', order: ['16-上', '16-左', '12-下'], note: '', mode: 'distance' as const }],
      silos: demoData().silos.map((s) => ({ ...s, row: 0 as const, col: 0 as const })),
    };
    const m = normalize(migrateLayout(old) as never);
    expect(m.distPoints.map((p) => p.id)).toEqual(['12-上', '12-左', '16-下']);
    expect(m.distPoints[0].siloId).toBe('12');
    expect(m.distPoints[0].baseDistance).toBe(150); // 基准值不变
    expect(m.distReadings.map((r) => r.pointId)).toEqual(['12-上', '16-下']);
    expect(m.rounds[0].order).toEqual(['12-上', '12-左', '16-下']);
    const at = (id: string) => m.silos.find((s) => s.id === id)!;
    expect(positionLabel(at('12'))).toBe('上排左列');
    expect(positionLabel(at('16'))).toBe('下排右列');
    // 计算结果不变：上侧点 150 → 153，v = −3
    const c = calcReading(m.distPoints[0], m.distReadings[0]);
    expect(c.component).toBe(-3);
  });
  it('新版数据不再迁移', () => {
    const d = demoData();
    const m = normalize(d);
    expect(m.distPoints.map((p) => p.id)).toEqual(['12-上', '12-左', '10-上', '10-右', '18-下', '18-左', '16-下', '16-右']);
  });
});

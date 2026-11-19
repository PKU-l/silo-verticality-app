import { describe, expect, it } from 'vitest';
import type { Cardinal, Dir, PlumbObs } from '../model/types';
import { solveOuter } from './outer';
import { measures, platformCenters, roundStatus } from './plumb';
import { demoData, demoPoints, outerObsFor, OUTER_DEMO_SIDES } from '../model/defaults';
import { overviewCells } from './overview';

const U: Record<Cardinal, [number, number]> = { E: [1, 0], W: [-1, 0], N: [0, 1], S: [0, -1] };

/** 按物理模型生成读数：q = e − (t + θ·r·v)，v = k×u */
function pt(side: Cardinal, t: [number, number], thetaDeg: number, opt: { r?: number; e?: [number, number]; noise?: [number, number]; drop?: 'x' | 'y' } = {}): PlumbObs {
  const r = (opt.r ?? 7) * 1000;
  const e = opt.e ?? [0, 0];
  const u = U[side], v = [-u[1], u[0]];
  const th = (thetaDeg * Math.PI) / 180;
  const n = opt.noise ?? [0, 0];
  const q = [e[0] - (t[0] + th * r * v[0]) + n[0], e[1] - (t[1] + th * r * v[1]) + n[1]];
  const d = (x: number): Dir => (x < 0 ? 'neg' : 'pos');
  return {
    id: side + Math.random(), siloId: '16', roundId: 'r', time: '2026-09-20T08:00', elevation: 20, plateId: 'p' + side,
    qx: opt.drop === 'x' ? null : Math.abs(q[0]), qxDir: opt.drop === 'x' ? null : d(q[0]),
    qy: opt.drop === 'y' ? null : Math.abs(q[1]), qyDir: opt.drop === 'y' ? null : d(q[1]),
    bx: e[0], by: e[1], bConfirmed: true, quality: 'clear', surveyor: '', note: '',
    kind: 'outer', groupId: 'g', side, radius: opt.r ?? 7,
  };
}

describe('外侧垂准点：两点联合解算', () => {
  it('纯平移（向 +X 5、+Y 3），扭转为 0', () => {
    const s = solveOuter([pt('N', [5, 3], 0), pt('W', [5, 3], 0)]);
    expect(s.mode).toBe('full');
    expect(s.x).toBeCloseTo(5, 6);
    expect(s.y).toBeCloseTo(3, 6);
    expect(s.rotationDeg).toBeCloseTo(0, 6);
    expect(s.residualMax).toBeCloseTo(0, 6);
  });
  it('纯扭转 0.1°（逆时针）：平移为 0，不被误判为中心偏移', () => {
    const s = solveOuter([pt('N', [0, 0], 0.1), pt('W', [0, 0], 0.1)]);
    expect(s.x).toBeCloseTo(0, 6);
    expect(s.y).toBeCloseTo(0, 6);
    expect(s.rotationDeg).toBeCloseTo(0.1, 6);
    // 单看切向读数约 12 mm
    expect(Math.abs(s.points[0].wx!)).toBeCloseTo(7000 * 0.1 * Math.PI / 180, 3);
  });
  it('平移 + 扭转同时存在', () => {
    const s = solveOuter([pt('N', [-4, 6], -0.02), pt('W', [-4, 6], -0.02)]);
    expect(s.x).toBeCloseTo(-4, 6);
    expect(s.y).toBeCloseTo(6, 6);
    expect(s.rotationDeg).toBeCloseTo(-0.02, 6);
  });
  it('四个角仓的测点组合都能正确解算', () => {
    const combos: Record<string, Cardinal[]> = OUTER_DEMO_SIDES;
    for (const [silo, sides] of Object.entries(combos)) {
      const s = solveOuter(sides.map((sd) => pt(sd, [7, -2], 0.04)));
      expect(s.x, silo).toBeCloseTo(7, 6);
      expect(s.y, silo).toBeCloseTo(-2, 6);
      expect(s.rotationDeg, silo).toBeCloseTo(0.04, 6);
    }
  });
  it('测站偏差 e 参与计算', () => {
    const s = solveOuter([pt('N', [2, 1], 0.01, { e: [3, -2] }), pt('W', [2, 1], 0.01, { e: [-1, 4] })]);
    expect(s.x).toBeCloseTo(2, 6);
    expect(s.y).toBeCloseTo(1, 6);
  });
  it('读数有误时给出校核残差', () => {
    const s = solveOuter([pt('N', [0, 0], 0), pt('W', [0, 0], 0, { noise: [0, 4] })]);
    expect(s.residualMax!).toBeGreaterThan(1.5);
  });
  it('两点但其中一点只读了径向：恰好可解，无多余校核', () => {
    const s = solveOuter([pt('N', [3, 2], 0.03), pt('W', [3, 2], 0.03, { drop: 'y' })]);
    expect(s.mode).toBe('full');
    expect(s.x).toBeCloseTo(3, 6);
    expect(s.residualMax).toBeNull();
  });
});

describe('外侧垂准点：单点与缺失', () => {
  it('只有上方（+Y）一个点：只输出 Y，X 与扭转为 null', () => {
    const s = solveOuter([pt('N', [5, 3], 0.1)]);
    expect(s.mode).toBe('partial');
    expect(s.y).toBeCloseTo(3, 6); // 径向可靠，不受 0.1° 扭转影响
    expect(s.x).toBeNull();
    expect(s.rotationDeg).toBeNull();
    expect(s.resultant).toBeNull();
  });
  it('只有左侧（−X）一个点：只输出 X', () => {
    const s = solveOuter([pt('W', [5, 3], 0.1)]);
    expect(s.x).toBeCloseTo(5, 6);
    expect(s.y).toBeNull();
  });
  it('测站未确认：该点不参与；全部未确认时为基准待确认', () => {
    const a = pt('N', [1, 1], 0);
    const s = solveOuter([{ ...a, bConfirmed: false }]);
    expect(s.basePending).toBe(true);
    expect(s.x).toBeNull();
    expect(s.y).toBeNull();
  });
});

describe('外侧垂准点样例（手动启用时）', () => {
  const pts = demoPoints(true);
  const obs12 = outerObsFor('12', 'r1', '2026-09-20T10:00', 20, [-4, 6], -0.02, pts);
  const obs10 = outerObsFor('10', 'r1', '2026-09-20T10:00', 20, [0, 0], 0, pts, { E: [0, 4] }); // 10 号仓为右上角仓：上侧、右侧两点
  const obs16 = outerObsFor('16', 'r1', '2026-09-20T08:00', 20, [4, 3], 0.03, pts);
  const round = { id: 'r1', name: '', createdAt: '', order: ['16', '10', '12'], note: '' };
  it('角仓以两点解算，12 号仓 (−4, +6)、扭转 −0.02°', () => {
    const m = measures(obs12)[0];
    expect(m.kind).toBe('outer');
    expect(m.records).toHaveLength(2);
    expect(m.x).toBeCloseTo(-4, 0);
    expect(m.y).toBeCloseTo(6, 0);
    expect(m.rotationDeg!).toBeCloseTo(-0.02, 2);
  });
  it('10 号仓一点读数有误 → 待复核（校核残差）', () => {
    const r = roundStatus(round, '10', obs10, 20, [0, 40.5]);
    expect(r.status).toBe('review');
    expect(r.reasons.some((x) => x.includes('校核残差'))).toBe(true);
  });
  it('总览中角仓为一次观测、一个箭头', () => {
    const d = demoData();
    const cells = overviewCells(d.silos, platformCenters(obs16), { kind: 'elevation', elevation: 20, tolerance: 0 });
    const c16 = cells.find((c) => c.silo.id === '16')!;
    expect(c16.state).toBe('ok');
    expect(c16.obs!.recordIds).toHaveLength(2);
    expect(c16.obs!.rotationDeg!).toBeCloseTo(0.03, 2);
  });
});

import { importPlumbObs } from './csv';
import { DEFAULT_LABELS } from '../model/defaults';

describe('外侧垂准点 CSV 导入', () => {
  it('同仓、同时间、同标高的两行自动成为一次观测，并能解算', () => {
    const d = { ...demoData(), points: demoPoints(true) };
    const text = [
      '16,2026-09-25 08:00,26.0,O16-E,5,西,5,南,张工,光斑清晰稳定,',
      '16,2026-09-25 08:00,26.0,O16-S,5,西,5,南,张工,光斑清晰稳定,',
    ].join('\n');
    const r = importPlumbObs(text, d.points, d.silos, DEFAULT_LABELS);
    expect(r.items).toHaveLength(2);
    expect(r.items[0].groupId).toBeDefined();
    expect(r.items[0].groupId).toBe(r.items[1].groupId);
    const m = measures(r.items)[0];
    expect(m.kind).toBe('outer');
    // 平台整体平移 (+5, +5)：两块投影板都随平台移动 (+5, +5)，光斑相对刻度原点都在“西 5、南 5”
    expect(m.x).toBeCloseTo(5, 6);
    expect(m.y).toBeCloseTo(5, 6);
    expect(m.rotationDeg).toBeCloseTo(0, 6);
  });
});

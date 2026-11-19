/**
 * 默认参数与“演示数据”。演示数据全部带 demo: true，可一键清空。
 */
import type { AppData, Cardinal, CenterRecord, Dir, LayoutConfig, LineReading, MeasurePoint, PlumbLine, PlumbObs, ProjectConfig, Round, SiloDef, ThresholdSet } from './types';
import { DEFAULT_GRID } from '../calc/layout';
import type { DistPoint, DistReading, Indicator, VerticalWallConfig } from './distTypes';
import { DEFAULT_POINT_LAYOUT, SIDE_FULL, SIDE_SIGN, axisOfSide, pointIdOf } from '../calc/distance';

export const DEFAULT_LABELS = { posX: '东', negX: '西', posY: '北', negY: '南', xName: 'X', yName: 'Y' };

export function presetSiloIds(): string[] {
  return ['10', '11', '12', '13', '14', '15', '16', '17', '18'];
}

export function defaultSilos(): SiloDef[] {
  const out: SiloDef[] = [];
  DEFAULT_GRID.forEach((row, r) => row.forEach((id, c) => out.push({
    id, group: '', row: r as 0 | 1 | 2, col: c as 0 | 1 | 2, centerX: null, centerY: null,
    outerDiameter: 12.5, innerDiameter: 12.0, elevMin: 0, elevMax: 40.5, note: '',
  })));
  return out.sort((a, b) => Number(a.id) - Number(b.id));
}

export const DEFAULT_LAYOUT: LayoutConfig = {
  spacingX: null, spacingY: null, axisRotationDeg: 0, orientationConfirmed: false, sameElevTolerance: 0,
  bgImage: null, bgOpacity: 0.35, bgScale: 1, bgOffsetX: 0, bgOffsetY: 0,
};

export const DEFAULT_CONFIG: ProjectConfig = {
  projectName: '圆形筒仓群',
  outerDiameter: 12.5,
  innerDiameter: 12.0,
  wallHeight: 40.5,
  siloIds: presetSiloIds(),
  labels: { ...DEFAULT_LABELS },
  northAngleDeg: 0,
  jumpThresholdMm: 20,
};

export const EMPTY_THRESHOLDS: ThresholdSet = {
  resultantWarning: null,
  resultantControl: null,
  componentWarning: null,
  componentControl: null,
  source: '',
  version: '',
  setBy: '',
  setAt: '',
};

let seq = 0;
const did = (p: string) => `demo-${p}-${++seq}`;
const r1 = (v: number) => Math.round(v * 10) / 10;
/* 演示数据的仓壁观测分配：14 方式 A；15 四线；16 仅东侧；17 仅东西 */
const W_A = '14', W_B4 = '15', W_B1 = '16', W_B2 = '17';

function demoCenterRecords(): CenterRecord[] {
  const out: CenterRecord[] = [];
  // 14 号仓第一批：已浇筑至 18 m
  const e1 = [0, 4.5, 9, 13.5, 18];
  const x1 = [0, 1.2, 2.5, 3.6, 4.3];
  const y1 = [0, 1.0, 1.9, 2.6, 3.2];
  e1.forEach((e, i) =>
    out.push({ id: did('a'), siloId: W_A, time: '2026-09-03T08:30', elevation: e, x: x1[i], y: y1[i], note: i === 0 ? '初滑后首次观测' : '', demo: true }),
  );
  // 14 号仓第二批：全高复测，整体向东北方向缓慢偏移
  const e2 = [0, 4.5, 9, 13.5, 18, 22.5, 27, 31.5, 36, 40.5];
  const x2 = [0, 1.5, 2.8, 4.1, 5.0, 6.8, 8.2, 9.5, 11.0, 12.4];
  const y2 = [0, 0.8, 1.6, 2.9, 3.5, 4.4, 5.6, 6.3, 7.5, 8.1];
  e2.forEach((e, i) =>
    out.push({ id: did('a'), siloId: W_A, time: '2026-09-10T08:30', elevation: e, x: x2[i], y: y2[i], note: i === 9 ? '晴，早间观测' : '', demo: true }),
  );
  return out;
}

/**
 * 铅垂线读数 = 线到仓壁外表面的水平距离。
 * 东侧：仓壁向东移动 → 距离减小，故“读数增大方向”为西；其余同理。
 */
const LINE_DEFS: { side: Cardinal; pos: Cardinal; base: number; name: string }[] = [
  { side: 'E', pos: 'W', base: 150.0, name: 'E1 +X侧铅垂线' },
  { side: 'W', pos: 'E', base: 148.0, name: 'W1 −X侧铅垂线' },
  { side: 'N', pos: 'S', base: 152.0, name: 'N1 +Y侧铅垂线' },
  { side: 'S', pos: 'N', base: 150.5, name: 'S1 −Y侧铅垂线' },
];

function makeLine(siloId: string, d: (typeof LINE_DEFS)[number]): PlumbLine {
  const sideName = { E: '+X', W: '−X', N: '+Y', S: '−Y' }[d.side];
  return {
    id: did('l'), siloId, name: d.name, side: d.side, azimuthText: '',
    basePosition: `${sideName}侧仓壁外悬挂铅垂线，读数为线至仓壁外表面水平距离`,
    positiveDir: d.pos, positiveText: '', baseReading: d.base, note: '', demo: true,
  };
}

/** 由“真实”中心偏移与尺寸变化反推各侧读数（仅用于生成演示数据） */
function readingFor(side: Cardinal, base: number, cx: number, cy: number, dX: number, dY: number): number {
  // 各侧测点位移（X/Y 分量）
  const disp = { E: cx + dX / 2, W: cx - dX / 2, N: cy + dY / 2, S: cy - dY / 2 }[side];
  // 读数增大方向：E 侧为 W(−)，W 侧为 E(+)，N 侧为 S(−)，S 侧为 N(+)
  const sign = side === 'E' || side === 'N' ? -1 : 1;
  return r1(base + sign * disp);
}

function demoPlumb(): { lines: PlumbLine[]; readings: LineReading[] } {
  const lines: PlumbLine[] = [];
  const readings: LineReading[] = [];
  // 15 号仓：东西南北四条铅垂线；30 m 处南侧读数缺失
  const a2 = LINE_DEFS.map((d) => makeLine(W_B4, d));
  lines.push(...a2);
  const elevs = [0, 6, 12, 18, 24, 30, 36, 40.5];
  for (const e of elevs) {
    const cx = 0.25 * e, cy = -0.15 * e;
    const dX = 2 * Math.sin(e / 8), dY = -1.5 * Math.sin(e / 10);
    a2.forEach((l, i) => {
      const d = LINE_DEFS[i];
      if (e === 30 && d.side === 'S') return;
      readings.push({
        id: did('r'), lineId: l.id, time: '2026-09-12T09:00', elevation: e,
        reading: readingFor(d.side, d.base, cx, cy, dX, dY),
        note: e === 30 && d.side === 'N' ? '−Y 侧测点被遮挡，未取得读数' : '', demo: true,
      });
    });
  }
  // 16 号仓：只有东侧一条铅垂线 → 仅能显示该测点位移
  const a3 = makeLine(W_B1, LINE_DEFS[0]);
  lines.push(a3);
  [0, 10, 20, 30, 40].forEach((e) =>
    readings.push({ id: did('r'), lineId: a3.id, time: '2026-09-12T10:30', elevation: e, reading: r1(150 - 0.3 * e), note: '', demo: true }),
  );
  // 17 号仓：只有东西一组 → 仅能换算 X 方向中心偏移
  const a4 = [makeLine(W_B2, LINE_DEFS[0]), makeLine(W_B2, LINE_DEFS[1])];
  lines.push(...a4);
  [0, 10, 20, 30, 40].forEach((e) => {
    const cx = -0.2 * e;
    readings.push({ id: did('r'), lineId: a4[0].id, time: '2026-09-12T11:00', elevation: e, reading: readingFor('E', 150, cx, 0, 1, 0), note: '', demo: true });
    readings.push({ id: did('r'), lineId: a4[1].id, time: '2026-09-12T11:00', elevation: e, reading: readingFor('W', 148, cx, 0, 1, 0), note: '', demo: true });
  });
  return { lines, readings };
}

/* ---------- 垂准仪演示数据 ---------- */
/** 角仓外侧垂准点方位（按项目坐标；图纸方向 = 项目方向时：12 上+左，10 上+右，18 左+下，16 右+下） */
export const OUTER_DEMO_SIDES: Record<string, Cardinal[]> = { '12': ['N', 'W'], '10': ['N', 'E'], '18': ['W', 'S'], '16': ['E', 'S'] };
const OUTER_RADIUS = 7.0; // m：投影板刻度原点到平台中心（外挑架上）
const SIDE_TEXT: Record<Cardinal, string> = { E: '+X', W: '−X', N: '+Y', S: '−Y' };

export function demoPoints(withOuter = false): MeasurePoint[] {
  const out: MeasurePoint[] = [];
  for (const id of presetSiloIds()) {
    out.push({
      id: `demo-M${id}`, code: `M${id}`, siloId: id, type: 'platform-mark', azimuth: '平台中心', relation: '平台中心标记（十字刻线）',
      offsetX: null, offsetY: null, offsetConfirmed: false, active: true, posX: 0, posY: 0, note: '', demo: true,
    });
    const sides = withOuter ? OUTER_DEMO_SIDES[id] : undefined;
    if (sides) {
      // 角仓：两个互相垂直的外侧垂准点
      sides.forEach((sd, k) => {
        const v = { E: [1, 0], W: [-1, 0], N: [0, 1], S: [0, -1] }[sd];
        out.push({
          id: `demo-O${id}-${k + 1}`, code: `O${id}-${sd}`, siloId: id, type: 'outer-plumb', side: sd, radius: OUTER_RADIUS,
          azimuth: `仓外 ${SIDE_TEXT[sd]} 侧`, relation: `地面测站位于投影板设计位置正下方；投影板装在外挑架上，距平台中心 ${OUTER_RADIUS} m`,
          offsetX: 0, offsetY: 0, offsetConfirmed: true, active: true, posX: v[0] * OUTER_RADIUS, posY: v[1] * OUTER_RADIUS, note: '', demo: true,
        });
      });
    } else {
      // 平台中心垂准仪；12 号仓刻度原点有固定偏置；11 号仓偏置未确认
      const b = id === '12' ? [35, -20] : [0, 0];
      out.push({
        id: `demo-P${id}`, code: `P${id}-1`, siloId: id, type: 'plumb-plate', azimuth: id === '12' ? '平台中心 +X 侧' : '平台中心',
        relation: id === '12' ? '刻度原点位于平台中心标记 +X 35 mm、−Y 20 mm' : '刻度原点与平台中心标记重合',
        offsetX: id === '11' ? null : b[0], offsetY: id === '11' ? null : b[1], offsetConfirmed: id !== '11', active: true,
        posX: id === '12' ? 0.035 : 0, posY: id === '12' ? -0.02 : 0, note: id === '11' ? '投影板重新安装，偏置待复测' : '', demo: true,
      });
    }
  }
  return out;
}

/** 由“平台中心偏移 P”反推中心垂准仪光斑读数 q = −P − b（仅用于生成演示数据） */
function obsFor(siloId: string, roundId: string, time: string, elevation: number, P: [number | null, number | null],
  pts: MeasurePoint[], extra: Partial<PlumbObs> = {}): PlumbObs {
  const plate = pts.find((p) => p.siloId === siloId && p.type === 'plumb-plate')!;
  const bx = plate.offsetX ?? 0, by = plate.offsetY ?? 0;
  const mk = (p: number | null, b: number): [number | null, Dir | null] => {
    if (p === null) return [null, null];
    const q = r1(-p - b);
    return [Math.abs(q), q < 0 ? 'neg' : 'pos'];
  };
  const [qx, qxDir] = mk(P[0], bx);
  const [qy, qyDir] = mk(P[1], by);
  return {
    id: did('p'), siloId, roundId, time, elevation, plateId: plate.id, qx, qxDir, qy, qyDir, kind: 'center',
    bx: plate.offsetX, by: plate.offsetY, bConfirmed: plate.offsetConfirmed, quality: 'clear', surveyor: '演示', note: '', demo: true, ...extra,
  };
}

/**
 * 由平台平移 t（mm）与扭转 θ（°，逆时针为正）反推外侧各点读数：q = e − (t + θ·r·v)。
 * noise：给某点的某分量叠加读数误差，用于演示“校核残差”。
 */
export function outerObsFor(siloId: string, roundId: string, time: string, elevation: number, t: [number, number], thetaDeg: number,
  pts: MeasurePoint[], noise: Record<string, [number, number]> = {}): PlumbObs[] {
  const gid = did('g');
  const th = (thetaDeg * Math.PI) / 180;
  return pts.filter((p) => p.siloId === siloId && p.type === 'outer-plumb').map((p) => {
    const u = { E: [1, 0], W: [-1, 0], N: [0, 1], S: [0, -1] }[p.side as Cardinal];
    const v = [-u[1], u[0]];
    const r = (p.radius as number) * 1000;
    const n = noise[p.side as string] ?? [0, 0];
    const q = [r1((p.offsetX ?? 0) - (t[0] + th * r * v[0]) + n[0]), r1((p.offsetY ?? 0) - (t[1] + th * r * v[1]) + n[1])];
    const d = (x: number): Dir => (x < 0 ? 'neg' : 'pos');
    return {
      id: did('p'), siloId, roundId, time, elevation, plateId: p.id, kind: 'outer' as const, groupId: gid, side: p.side, radius: p.radius,
      qx: Math.abs(q[0]), qxDir: d(q[0]), qy: Math.abs(q[1]), qyDir: d(q[1]),
      bx: p.offsetX, by: p.offsetY, bConfirmed: p.offsetConfirmed, quality: 'clear' as const, surveyor: '演示', note: '', demo: true,
    };
  });
}

function demoPlatform(pts: MeasurePoint[]): { rounds: Round[]; obs: PlumbObs[] } {
  const order = ['12', '11', '10', '13', '14', '15', '16', '17', '18'];
  const rounds: Round[] = [
    { id: 'demo-round-1', name: '垂准仪 第 1 轮（演示）', createdAt: '2026-09-20T08:00', order, note: '', mode: 'plumb', demo: true },
    { id: 'demo-round-2', name: '垂准仪 第 2 轮（演示）', createdAt: '2026-09-24T08:00', order, note: '', mode: 'plumb', demo: true },
  ];
  const P1: Record<string, [number | null, number | null]> = {
    '16': [4, 3], '17': [-3, 2], '15': [2, -5], '14': [8, -5], '13': [-2, null], '10': [0, 0], '11': [5, 5], '12': [-4, 6],
  };
  const obs: PlumbObs[] = [];
  order.forEach((id, i) => {
    if (!P1[id]) return; // 18 号仓第 1 轮未观测
    const t = `2026-09-20T${String(8 + Math.floor(i / 3)).padStart(2, '0')}:${String((i % 3) * 20).padStart(2, '0')}`;
    obs.push(obsFor(id, 'demo-round-1', t, 20.0, P1[id], pts, id === '15' ? { quality: 'doubtful', note: '光斑边缘模糊，读数存疑' } : id === '13' ? { note: 'Y 向刻度被遮挡，未读' } : {}));
  });
  const P2: Record<string, [number, number]> = { '16': [6, 4], '17': [-4, 3], '15': [3, -6], '14': [11, -7] };
  ['16', '17', '15', '14'].forEach((id, i) => {
    obs.push(obsFor(id, 'demo-round-2', `2026-09-24T08:${String(i * 15).padStart(2, '0')}`, id === '15' ? 23.0 : 23.5, P2[id], pts));
  });
  return { rounds, obs };
}

/* ---------- 八点仓壁距离差：默认点位与演示数据 ---------- */

export const DEFAULT_VERTICAL_WALL: VerticalWallConfig = { confirmed: false, from: 0, to: 40.5, basis: '' };

/** 默认八个观测点（空白基准，未确认） */
export function defaultDistPoints(): DistPoint[] {
  return DEFAULT_POINT_LAYOUT.map(({ siloId, side }) => ({
    id: pointIdOf(siloId, side), siloId, side, baseElevation: null, baseDistance: null, baseConfirmed: false, directionConfirmed: false,
    lineDesc: '', surveyor: '', reviewer: '', reviewedAt: '', note: '', active: true,
  }));
}

/** 演示用：各角仓真实图纸位移 (u, v)，mm，随标高 h 变化 */
const TRUE_UV: Record<string, (h: number) => [number, number]> = {
  '12': (h) => (h <= 10 ? [0, 0.1 * h] : [0.3 * (h - 10), 0.1 * h]),
  '10': (h) => [-0.1 * h, 0.2 * h],
  '18': (h) => [0.2 * h, -0.05 * h],
  '16': (h) => [-0.15 * h, -0.15 * h],
};

function demoDist(): { points: DistPoint[]; readings: DistReading[]; rounds: Round[]; indicators: Indicator[]; vw: VerticalWallConfig } {
  const base: Record<string, number | null> = {
    '12-上': 150.0, '12-左': 148.0, '10-上': 152.0, '10-右': 150.5, '18-下': 149.0, '18-左': null, '16-下': 151.0, '16-右': 147.5,
  };
  const points: DistPoint[] = defaultDistPoints().map((p) => ({
    ...p,
    baseElevation: 0.5,
    baseDistance: base[p.id],
    baseConfirmed: base[p.id] !== null,
    directionConfirmed: p.id !== '16-右',
    lineDesc: `${p.siloId} 号仓${SIDE_FULL[p.side]}仓壁外侧铅垂基准线（演示）`,
    surveyor: '演示', reviewer: base[p.id] !== null ? '演示复核' : '', reviewedAt: base[p.id] !== null ? '2026-09-10T17:00' : '',
    note: p.id === '18-左' ? '底部基准距离尚未测定' : p.id === '16-右' ? '基准线位置待现场复核' : '',
    demo: true,
  }));
  const vw: VerticalWallConfig = { confirmed: true, from: 0, to: 30, basis: '设计图：0～30 m 仓壁竖直（演示）' };
  const pointOrder = points.map((p) => p.id);
  const rounds: Round[] = [
    { id: 'demo-d1', name: '第 1 轮 · 10 m（演示）', createdAt: '2026-09-15T08:00', order: pointOrder, note: '', mode: 'distance', demo: true },
    { id: 'demo-d2', name: '第 2 轮 · 20 m（演示）', createdAt: '2026-09-22T08:00', order: pointOrder, note: '', mode: 'distance', demo: true },
    { id: 'demo-d3', name: '第 3 轮 · 35 m（演示）', createdAt: '2026-09-26T08:00', order: pointOrder, note: '', mode: 'distance', demo: true },
  ];
  const readings: DistReading[] = [];
  const mk = (p: DistPoint, roundId: string, time: string, h: number, design: number | null, extra: Partial<DistReading> = {}) => {
    const [u, v] = TRUE_UV[p.siloId](h);
    const comp = axisOfSide(p.side) === 'u' ? u : v;
    const b = p.baseDistance ?? 150;
    const dist = Math.round((b + (design ?? 0) + SIDE_SIGN[p.side] * comp) * 2) / 2;
    readings.push({
      id: did('d'), pointId: p.id, roundId, time, elevation: h, distance: dist, designChange: design,
      designBasis: design === 0 ? `${vw.from}～${vw.to} m 设计仓壁位置不变（已确认：${vw.basis}）` : design === null ? '' : '设计图：35 m 处仓壁收分（演示）',
      validity: 'valid', surveyor: '演示', reviewer: '', reviewedAt: '', note: '', demo: true, ...extra,
    });
  };
  points.forEach((p, i) => mk(p, 'demo-d1', `2026-09-15T08:${String(i * 5).padStart(2, '0')}`, 10, 0, { reviewer: '演示复核', reviewedAt: '2026-09-15T17:00' }));
  points.forEach((p, i) => {
    if (p.id === '16-下') return; // 16 号仓第 2 轮只有右侧点 → 单侧
    const h = p.id === '10-右' ? 20.5 : 20; // 10 号仓两点标高不一致
    mk(p, 'demo-d2', `2026-09-22T${p.id === '10-右' ? '10' : '08'}:${String(i * 5).padStart(2, '0')}`, h, 0);
  });
  // 第 3 轮：30 m 以上须录入设计修正；12 号仓两点设计修正 +4 mm；10-上 读数存疑；10-右 未录入设计修正
  for (const id of ['12-上', '12-左']) mk(points.find((p) => p.id === id)!, 'demo-d3', '2026-09-26T08:10', 35, 4);
  mk(points.find((p) => p.id === '10-上')!, 'demo-d3', '2026-09-26T08:30', 35, 0, { validity: 'doubtful', note: '基准线晃动，读数存疑', designBasis: '设计图：35 m 处仓壁位置不变（演示）' });
  mk(points.find((p) => p.id === '10-右')!, 'demo-d3', '2026-09-26T08:40', 35, null, { note: '设计修正值待设计单位确认' });
  const indicators: Indicator[] = [{
    id: 'demo-ind-1', name: '演示指标：1‰ 且不超过 30 mm（未批准）', ratioPermil: 1, cap: 30, startElevation: 0.5, target: 'corner-combo',
    source: '演示数据，非项目批准文件', version: '演示', status: 'draft', approvedBy: '', approvedAt: '', note: '仅用于演示界面，正式使用前请按批准文件重新填写并批准', demo: true,
  }];
  return { points, readings, rounds, indicators, vw };
}

export function demoData(config: ProjectConfig = DEFAULT_CONFIG): AppData {
  const p = demoPlumb();
  const points = demoPoints();
  const plat = demoPlatform(points);
  const dist = demoDist();
  return {
    config: { ...config, labels: { ...config.labels } },
    centerRecords: demoCenterRecords(),
    lines: p.lines,
    readings: p.readings,
    thresholds: { ...EMPTY_THRESHOLDS },
    silos: defaultSilos(),
    layout: { ...DEFAULT_LAYOUT },
    points,
    plumbObs: plat.obs,
    rounds: [...plat.rounds, ...dist.rounds],
    sync: { endpoint: '' },
    distPoints: dist.points,
    distReadings: dist.readings,
    indicators: dist.indicators,
    verticalWall: dist.vw,
  };
}

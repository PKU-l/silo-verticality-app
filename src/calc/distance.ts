/**
 * 八点仓壁距离差：计算函数（纯函数，不含界面）。
 *
 * 1. 原始距离变化   = 本次距离 − 该点底部基准距离
 * 2. 修正后距离变化 = 原始距离变化 − 设计距离变化
 * 3. 图纸坐标（u 向右为正，v 向上为正），基准线位于仓壁外侧、读数为“仓壁至基准线距离”时：
 *      左侧点：u 位移 = +修正后距离变化
 *      右侧点：u 位移 = −修正后距离变化
 *      上侧点：v 位移 = −修正后距离变化
 *      下侧点：v 位移 = +修正后距离变化
 *    （以左侧点为例：基准线在仓壁左外侧，仓壁向右移动时距离变大，因此距离增大 = 向右）
 * 4. 同一角仓两个正交点在相同目标标高都有有效方向分量时：
 *      组合位移量 = SQRT(u 位移 × u 位移 + v 位移 × v 位移)，称“角仓两测点组合位移示意”。
 */
import type { AxisLabels } from '../model/types';
import type { DistPoint, DistReading, DrawSide, Indicator, IndicatorTarget, VerticalWallConfig } from '../model/distTypes';
import { fmtAbs } from './direction';

export const SIDE_NAME: Record<DrawSide, string> = { up: '上', down: '下', left: '左', right: '右' };
export const SIDE_FULL: Record<DrawSide, string> = { up: '上侧', down: '下侧', left: '左侧', right: '右侧' };

/** 默认八个观测点：四个角仓的外侧（左上 12、右上 10、左下 18、右下 16） */
export const DEFAULT_POINT_LAYOUT: { siloId: string; side: DrawSide }[] = [
  { siloId: '12', side: 'up' }, { siloId: '12', side: 'left' },
  { siloId: '10', side: 'up' }, { siloId: '10', side: 'right' },
  { siloId: '18', side: 'down' }, { siloId: '18', side: 'left' },
  { siloId: '16', side: 'down' }, { siloId: '16', side: 'right' },
];

/** 旧版点号（按旧仓号排列定义）→ 新点号：图纸位置不变，仅随新仓号改名 */
export const LEGACY_POINT_IDS: Record<string, string> = {
  '16-上': '12-上', '16-左': '12-左', '18-上': '10-上', '18-右': '10-右',
  '10-下': '18-下', '10-左': '18-左', '12-下': '16-下', '12-右': '16-右',
};

export function pointIdOf(siloId: string, side: DrawSide): string {
  return `${siloId}-${SIDE_NAME[side]}`;
}

export function axisOfSide(side: DrawSide): 'u' | 'v' {
  return side === 'left' || side === 'right' ? 'u' : 'v';
}

/** 修正后距离变化 → 图纸方向分量的符号 */
export const SIDE_SIGN: Record<DrawSide, 1 | -1> = { left: 1, right: -1, up: -1, down: 1 };

const clean = (n: number) => (Math.abs(n) < 1e-9 ? 0 : n);

export interface ReadingCalc {
  raw: number | null; // 原始距离变化
  design: number | null; // 设计距离变化
  corrected: number | null; // 修正后距离变化
  axis: 'u' | 'v';
  /** 方向分量（图纸坐标，mm）；未满足条件时为 null */
  component: number | null;
  /** 不能输出方向结论的原因 */
  blocked: string[];
}

export function calcReading(p: DistPoint, r: DistReading): ReadingCalc {
  const blocked: string[] = [];
  const raw = r.distance !== null && p.baseDistance !== null ? clean(r.distance - p.baseDistance) : null;
  if (p.baseDistance === null) blocked.push('缺少底部基准距离');
  if (r.distance === null) blocked.push('缺少本次距离');
  const design = r.designChange;
  if (design === null) blocked.push('缺少设计距离变化（设计修正值）');
  const corrected = raw !== null && design !== null ? clean(raw - design) : null;
  if (!p.baseConfirmed) blocked.push('基准关系未确认');
  if (!p.directionConfirmed) blocked.push('基准线位置与读数方向未确认');
  if (r.validity === 'invalid') blocked.push('读数标记为无效');
  const axis = axisOfSide(p.side);
  const ok = corrected !== null && p.baseConfirmed && p.directionConfirmed && r.validity !== 'invalid';
  const component = ok ? clean(SIDE_SIGN[p.side] * (corrected as number)) : null;
  return { raw, design, corrected, axis, component, blocked };
}

/* ---------------- 方向文字 ---------------- */

const DRAW_WORD = { u: ['图纸右', '图纸左'], v: ['图纸上', '图纸下'] } as const;

/** 图纸方向分量的文字：如“向图纸右 3.0 mm” */
export function describeDrawing(axis: 'u' | 'v', value: number | null, digits = 1): string {
  if (value === null) return '方向待定';
  if (Math.abs(value) < 0.05) return '无变化';
  return `向${DRAW_WORD[axis][value > 0 ? 0 : 1]} ${fmtAbs(value, digits)} mm`;
}

/** 图纸位移 (u, v) → 项目坐标 (x, y)。θ = 项目 +Y 相对图纸上方的顺时针角度 */
export function drawingToProject(u: number, v: number, thetaDeg: number): { x: number; y: number } {
  const t = (thetaDeg * Math.PI) / 180;
  const c = Math.cos(t), s = Math.sin(t);
  return { x: clean(u * c - v * s), y: clean(u * s + v * c) };
}

/** 项目方向文字（仅在方向配置已确认时使用） */
export function describeProject(u: number, v: number, thetaDeg: number, l: AxisLabels, digits = 1): string {
  const { x, y } = drawingToProject(u, v, thetaDeg);
  const parts: string[] = [];
  if (Math.abs(x) >= 0.05) parts.push(`向${x > 0 ? l.posX : l.negX} ${fmtAbs(x, digits)} mm`);
  if (Math.abs(y) >= 0.05) parts.push(`向${y > 0 ? l.posY : l.negY} ${fmtAbs(y, digits)} mm`);
  return parts.length ? parts.join('、') : '无变化';
}

/* ---------------- 设计修正 ---------------- */

/** 按“竖直仓壁已确认”给出默认设计修正；范围外返回 null（须人工录入） */
export function defaultDesignChange(vw: VerticalWallConfig, baseElevation: number | null, elevation: number | null): { value: number | null; basis: string } {
  if (!vw.confirmed || elevation === null || baseElevation === null) return { value: null, basis: '' };
  const lo = Math.min(baseElevation, elevation), hi = Math.max(baseElevation, elevation);
  if (lo >= vw.from && hi <= vw.to) return { value: 0, basis: `${vw.from}～${vw.to} m 设计仓壁位置不变（已确认：${vw.basis || '未注明依据'}）` };
  return { value: null, basis: '' };
}

/* ---------------- 状态 ---------------- */

export type PointStatus = 'todo' | 'done' | 'incomplete' | 'dir-pending' | 'review';
export const POINT_STATUS_TEXT: Record<PointStatus, string> = {
  todo: '待录入', done: '已录入', incomplete: '数据不完整', 'dir-pending': '方向待确认', review: '待复核',
};

/** 同一点按时间的上一条记录 */
export function previousReading(all: DistReading[], r: DistReading): DistReading | null {
  let best: DistReading | null = null;
  for (const x of all) {
    if (x.pointId !== r.pointId || x.id === r.id || x.time >= r.time) continue;
    if (!best || x.time > best.time) best = x;
  }
  return best;
}

/** 复核原因（只提示，不改数据） */
export function readingReasons(p: DistPoint, r: DistReading, prev: DistReading | null, jumpMm: number, elevRange?: [number, number]): string[] {
  const out: string[] = [];
  const c = calcReading(p, r);
  if (r.validity === 'doubtful') out.push('读数存疑');
  if (r.validity === 'invalid') out.push('读数标记为无效');
  if (r.elevation === null) out.push('缺少观测标高');
  else if (elevRange && (r.elevation < elevRange[0] || r.elevation > elevRange[1])) out.push(`标高 ${r.elevation} m 超出该仓范围 ${elevRange[0]}～${elevRange[1]} m`);
  if (p.baseElevation !== null && r.elevation !== null && r.elevation < p.baseElevation) out.push('观测标高低于基准标高');
  if (prev) {
    const cp = calcReading(p, prev);
    if (c.raw !== null && cp.raw !== null && Math.abs(c.raw - cp.raw) > jumpMm)
      out.push(`距离变化较上次（${prev.time.replace('T', ' ')}）相差 ${(c.raw - cp.raw).toFixed(1)} mm，超过突变提示值 ${jumpMm} mm`);
  }
  return out;
}

export function pointStatus(p: DistPoint, r: DistReading | null, prev: DistReading | null, jumpMm: number, elevRange?: [number, number]): { status: PointStatus; reasons: string[] } {
  if (!r) return { status: 'todo', reasons: [] };
  const c = calcReading(p, r);
  const reasons = readingReasons(p, r, prev, jumpMm, elevRange);
  if (c.raw === null || c.corrected === null || r.elevation === null) {
    return { status: 'incomplete', reasons: [...c.blocked.filter((b) => b.startsWith('缺少')), ...reasons] };
  }
  if (!p.baseConfirmed || !p.directionConfirmed) return { status: 'dir-pending', reasons: [...c.blocked, ...reasons] };
  if (reasons.length) return { status: 'review', reasons };
  return { status: 'done', reasons };
}

/* ---------------- 选取与组合 ---------------- */

export type PickMode = { kind: 'round'; roundId: string } | { kind: 'elevation'; elevation: number; tolerance: number } | { kind: 'latest' };

/** 每个点按筛选条件选出一条记录（不插值、不补造） */
export function pickReadings(points: DistPoint[], readings: DistReading[], mode: PickMode): Map<string, DistReading | null> {
  const out = new Map<string, DistReading | null>();
  for (const p of points) {
    let list = readings.filter((r) => r.pointId === p.id);
    if (mode.kind === 'round') list = list.filter((r) => r.roundId === mode.roundId);
    if (mode.kind === 'elevation') list = list.filter((r) => r.elevation !== null && Math.abs(r.elevation - mode.elevation) <= mode.tolerance + 1e-9);
    list.sort((a, b) => b.time.localeCompare(a.time));
    out.set(p.id, list[0] ?? null);
  }
  return out;
}

export interface CornerResult {
  siloId: string;
  uPoint: DistPoint | null;
  vPoint: DistPoint | null;
  uReading: DistReading | null;
  vReading: DistReading | null;
  u: number | null;
  v: number | null;
  /** 组合位移量（仅两点同一目标标高都有方向分量时） */
  magnitude: number | null;
  sameElevation: boolean;
  notes: string[];
}

/** 角仓两测点组合位移示意 */
export function combineCorner(siloId: string, points: DistPoint[], picked: Map<string, DistReading | null>, tolerance: number): CornerResult {
  const mine = points.filter((p) => p.siloId === siloId);
  const uPoint = mine.find((p) => axisOfSide(p.side) === 'u') ?? null;
  const vPoint = mine.find((p) => axisOfSide(p.side) === 'v') ?? null;
  const uReading = uPoint ? picked.get(uPoint.id) ?? null : null;
  const vReading = vPoint ? picked.get(vPoint.id) ?? null : null;
  const u = uPoint && uReading ? calcReading(uPoint, uReading).component : null;
  const v = vPoint && vReading ? calcReading(vPoint, vReading).component : null;
  const notes: string[] = [];
  const e1 = uReading?.elevation ?? null, e2 = vReading?.elevation ?? null;
  const sameElevation = e1 !== null && e2 !== null && Math.abs(e1 - e2) <= tolerance + 1e-9;
  let magnitude: number | null = null;
  if (u !== null && v !== null) {
    if (sameElevation) magnitude = Math.sqrt(u * u + v * v);
    else notes.push(`两点观测标高不同（${e1} m / ${e2} m），不组合为同一截面`);
  } else if (u !== null || v !== null) {
    notes.push('只有一个方向有有效分量，不生成组合箭头');
  }
  if (uReading && vReading && uReading.time.slice(0, 16) !== vReading.time.slice(0, 16) && magnitude !== null)
    notes.push(`两点观测时间不同（${uReading.time.replace('T', ' ')} / ${vReading.time.replace('T', ' ')}）`);
  return { siloId, uPoint, vPoint, uReading, vReading, u, v, magnitude, sameElevation, notes };
}

/* ---------------- 指标对照 ---------------- */

export const TARGET_TEXT: Record<IndicatorTarget, string> = {
  'point-change': '单点距离变化（修正后位移分量）',
  'corner-combo': '角仓两测点组合位移',
  'platform-center': '滑模平台中心偏移（垂准仪）',
  'structure-vertical': '成型结构垂直度',
};

export interface IndicatorCheck {
  applicable: boolean;
  reason: string;
  H: number | null;
  allowed: number | null;
  exceeds: boolean | null;
}

/**
 * 允许偏移 = MIN(H × 比例, 封顶值)，H = 观测标高 − 起算标高（m），比例以 ‰ 计（1‰ × 1 m = 1 mm）。
 * 仅当指标已批准、适用对象一致、输入完整时才给出对照。
 */
export function checkIndicator(ind: Indicator | null, target: IndicatorTarget, value: number | null, elevation: number | null): IndicatorCheck {
  const no = (reason: string): IndicatorCheck => ({ applicable: false, reason, H: null, allowed: null, exceeds: null });
  if (!ind) return no('未配置适用的指标');
  if (ind.status !== 'approved') return no('指标未批准，不显示对照');
  if (ind.target !== target) return no(`指标适用对象为“${TARGET_TEXT[ind.target]}”，与本结果不同`);
  if (ind.ratioPermil === null || ind.startElevation === null) return no('指标比例或起算标高未填写');
  if (value === null || elevation === null) return no('观测值或标高不完整');
  const H = elevation - ind.startElevation;
  if (H <= 0) return no('观测标高未高于起算标高');
  const byRatio = H * ind.ratioPermil;
  const allowed = ind.cap === null ? byRatio : Math.min(byRatio, ind.cap);
  return { applicable: true, reason: '', H, allowed, exceeds: Math.abs(value) > allowed };
}

/** 取某对象当前唯一的已批准指标（多个时取最近批准的一个） */
export function activeIndicator(list: Indicator[], target: IndicatorTarget): Indicator | null {
  const ok = list.filter((i) => i.status === 'approved' && i.target === target).sort((a, b) => b.approvedAt.localeCompare(a.approvedAt));
  return ok[0] ?? null;
}

/** 取适用指标并对照；超过对照值时给出 'control' 等级供图形标红（仅限指标已批准且对象一致） */
export function indicatorFlag(list: Indicator[], target: IndicatorTarget, value: number | null, elevation: number | null): { level: 'none' | 'control'; chk: IndicatorCheck; ind: Indicator | null } {
  const ind = activeIndicator(list, target);
  const chk = checkIndicator(ind, target, value, elevation);
  return { level: chk.applicable && chk.exceeds ? 'control' : 'none', chk, ind };
}

/** 指标对照文字（统一格式） */
export function indicatorText(target: IndicatorTarget, f: { chk: IndicatorCheck; ind: Indicator | null }, value: number | null): string {
  if (!f.chk.applicable || !f.ind) return `指标对照（${TARGET_TEXT[target]}）：${f.chk.reason}`;
  const v = value === null ? '—' : Math.abs(value).toFixed(1);
  return `指标对照（${f.ind.name}）：H = ${f.chk.H!.toFixed(2)} m，允许 = MIN(H × ${f.ind.ratioPermil}‰, ${f.ind.cap ?? '不封顶'}) = ${f.chk.allowed!.toFixed(1)} mm；本值 ${v} mm，${f.chk.exceeds ? '超过对照值' : '未超过对照值'}（须人工复核签认）`;
}

/**
 * 垂准仪观测：平台中心相对设计中心的偏移。
 *
 * 三个点必须区分：
 *   D：设计中心的竖直投影点（光斑所代表的位置）
 *   O：投影板刻度原点
 *   M：平台中心标记
 * q = 光斑相对 O 的有符号读数 = D − O
 * b = O 相对 M 的固定偏置     = O − M
 * 平台中心相对设计中心：M − D = −(q + b)，X、Y 分别计算。
 *
 * 固定偏置未确认 → “基准待确认”，不输出平台偏移；
 * 缺少某方向读数 → 该方向为 null，不补零、不计算合成值。
 */
import type { CenterObs, ObsStatus, PlumbObs, Round, SpotQuality } from '../model/types';
import { clean, resultant, signed } from './direction';
import { solveOuter, type OuterSolution } from './outer';
export { signed };
import { sessionOf, statusOf } from './center';

export const QUALITY_TEXT: Record<SpotQuality, string> = {
  clear: '光斑清晰稳定',
  unstable: '光斑晃动/模糊',
  doubtful: '读数存疑',
};


export interface PlatformResult {
  qx: number | null;
  qy: number | null;
  bx: number | null;
  by: number | null;
  /** 平台中心相对设计中心偏移（mm），基准待确认时为 null */
  x: number | null;
  y: number | null;
  resultant: number | null;
  basePending: boolean;
  status: ObsStatus | 'base-pending';
}

export function platformOffset(o: Pick<PlumbObs, 'qx' | 'qxDir' | 'qy' | 'qyDir' | 'bx' | 'by' | 'bConfirmed'>): PlatformResult {
  const qx = signed(o.qx, o.qxDir);
  const qy = signed(o.qy, o.qyDir);
  const basePending = !o.bConfirmed || o.bx === null || o.by === null;
  if (basePending) {
    return { qx, qy, bx: o.bx, by: o.by, x: null, y: null, resultant: null, basePending, status: 'base-pending' };
  }
  const x = qx === null ? null : clean(-(qx + (o.bx as number)));
  const y = qy === null ? null : clean(-(qy + (o.by as number)));
  return { qx, qy, bx: o.bx, by: o.by, x, y, resultant: resultant(x, y), basePending, status: statusOf(x, y) };
}

/* ================= 一次观测（中心垂准仪 1 条记录，或外侧垂准点同组多条记录） ================= */

export interface PlatformMeasure {
  id: string; // 中心：记录 id；外侧：'G:' + groupId
  siloId: string;
  kind: 'center' | 'outer';
  records: PlumbObs[];
  time: string;
  elevation: number | null;
  roundId: string | null;
  x: number | null;
  y: number | null;
  resultant: number | null;
  basePending: boolean;
  rotationDeg: number | null;
  residual: number | null;
  center?: PlatformResult;
  outer?: OuterSolution;
}

export function groupKey(o: PlumbObs): string {
  return o.kind === 'outer' && o.groupId ? 'G:' + o.groupId : o.id;
}

export function measureFrom(records: PlumbObs[]): PlatformMeasure {
  const first = records[0];
  const time = records.reduce((m, r) => (r.time > m ? r.time : m), first.time);
  if (first.kind === 'outer') {
    const sol = solveOuter(records);
    return {
      id: groupKey(first), siloId: first.siloId, kind: 'outer', records, time, elevation: first.elevation, roundId: first.roundId,
      x: sol.x, y: sol.y, resultant: sol.resultant, basePending: sol.basePending,
      rotationDeg: sol.rotationDeg, residual: sol.residualMax, outer: sol,
    };
  }
  const r = platformOffset(first);
  return {
    id: first.id, siloId: first.siloId, kind: 'center', records, time, elevation: first.elevation, roundId: first.roundId,
    x: r.x, y: r.y, resultant: r.resultant, basePending: r.basePending, rotationDeg: null, residual: null, center: r,
  };
}

/** 全部记录按“一次观测”分组 */
export function measures(all: PlumbObs[]): PlatformMeasure[] {
  const m = new Map<string, PlumbObs[]>();
  for (const o of all) {
    const k = groupKey(o);
    if (!m.has(k)) m.set(k, []);
    m.get(k)!.push(o);
  }
  return [...m.values()].map(measureFrom).sort((a, b) => a.time.localeCompare(b.time));
}

export function measureOf(all: PlumbObs[], o: PlumbObs): PlatformMeasure {
  const k = groupKey(o);
  return measureFrom(all.filter((x) => groupKey(x) === k));
}

/** 同一仓按时间的上一次观测 */
export function previousMeasure(all: PlumbObs[], m: PlatformMeasure): PlatformMeasure | null {
  const list = measures(all.filter((o) => o.siloId === m.siloId)).filter((x) => x.id !== m.id && x.time < m.time);
  return list.length ? list[list.length - 1] : null;
}

/** 需要复核的原因（只提示，不修改数据）。以“缺少”开头的归为“数据不完整” */
export function measureReasons(m: PlatformMeasure, prev: PlatformMeasure | null, jumpMm: number, elevRange?: [number, number], residualMm = 3): string[] {
  const r: string[] = [];
  const q = new Set(m.records.map((o) => o.quality));
  if (q.has('doubtful')) r.push('读数存疑');
  if (q.has('unstable')) r.push('光斑晃动/模糊');
  if (m.elevation === null) r.push('缺少平台标高');
  else if (elevRange && (m.elevation < elevRange[0] || m.elevation > elevRange[1]))
    r.push(`标高 ${m.elevation} m 超出该仓观测范围 ${elevRange[0]}～${elevRange[1]} m`);
  if (m.kind === 'center') {
    const o = m.records[0];
    if (m.basePending) r.push('固定偏置未确认（基准待确认）');
    if (o.qx === null || o.qxDir === null) r.push('缺少 X 方向读数或方向');
    if (o.qy === null || o.qyDir === null) r.push('缺少 Y 方向读数或方向');
  } else {
    const sol = m.outer!;
    for (const n of new Set(sol.notes)) if (!n.startsWith('只有一个')) r.push(n);
    for (const o of m.records) {
      if (o.qx === null || o.qxDir === null || o.qy === null || o.qyDir === null) r.push('缺少部分测点读数或方向');
    }
    if (sol.mode !== 'full') {
      if (m.x === null) r.push('缺少可解算 X 向平移的测点');
      if (m.y === null) r.push('缺少可解算 Y 向平移的测点');
      r.push('缺少第二个测点，无法解算平台扭转');
    }
    if (sol.residualMax !== null && sol.residualMax > residualMm)
      r.push(`测点校核残差 ${sol.residualMax.toFixed(1)} mm，超过提示值 ${residualMm} mm（可能读数有误或平台变形）`);
  }
  if (prev && !m.basePending) {
    for (const [k, a, b] of [['X', m.x, prev.x], ['Y', m.y, prev.y]] as const) {
      if (a !== null && b !== null && Math.abs(a - b) > jumpMm)
        r.push(`${k} 较上次（${prev.time.replace('T', ' ')}）变化 ${(a - b).toFixed(1)} mm，超过突变提示值 ${jumpMm} mm`);
    }
  }
  return [...new Set(r)];
}

/** 兼容：单条中心垂准仪记录的复核原因 */
export function reviewReasons(o: PlumbObs, prev: PlumbObs | null, jumpMm: number, elevRange?: [number, number]): string[] {
  return measureReasons(measureFrom([o]), prev ? measureFrom([prev]) : null, jumpMm, elevRange);
}

/** 同一仓按时间排列的上一条记录（中心垂准仪） */
export function previousObs(all: PlumbObs[], o: PlumbObs): PlumbObs | null {
  let best: PlumbObs | null = null;
  for (const x of all) {
    if (x.siloId !== o.siloId || x.id === o.id || x.time >= o.time) continue;
    if (!best || x.time > best.time) best = x;
  }
  return best;
}

export type RoundStatus = 'todo' | 'done' | 'incomplete' | 'review';
export const ROUND_STATUS_TEXT: Record<RoundStatus, string> = {
  todo: '待录入',
  done: '已录入',
  incomplete: '数据不完整',
  review: '待复核',
};

/** 本轮中某仓的状态（取本轮该仓最新一次观测） */
export function roundStatus(round: Round, siloId: string, all: PlumbObs[], jumpMm: number, elevRange?: [number, number], residualMm = 3): { status: RoundStatus; obs: PlumbObs | null; measure: PlatformMeasure | null; reasons: string[] } {
  const list = measures(all.filter((o) => o.roundId === round.id && o.siloId === siloId));
  const m = list[list.length - 1] ?? null;
  if (!m) return { status: 'todo', obs: null, measure: null, reasons: [] };
  const reasons = measureReasons(m, previousMeasure(all, m), jumpMm, elevRange, residualMm);
  const obs = m.records[0];
  const missing = reasons.some((x) => x.startsWith('缺少'));
  const other = reasons.filter((x) => !x.startsWith('缺少'));
  if (other.length) return { status: 'review', obs, measure: m, reasons };
  if (missing) return { status: 'incomplete', obs, measure: m, reasons };
  return { status: 'done', obs, measure: m, reasons };
}

/** 本轮按用户顺序的下一座待录入仓 */
export function nextPending(round: Round, all: PlumbObs[], after?: string): string | null {
  const done = new Set(all.filter((o) => o.roundId === round.id).map((o) => o.siloId));
  const order = round.order;
  const start = after ? order.indexOf(after) + 1 : 0;
  for (let i = 0; i < order.length; i++) {
    const id = order[(start + i) % order.length];
    if (!done.has(id)) return id;
  }
  return null;
}

/** 垂准仪观测 → 通用观测点（供立面图、总览使用）。基准待确认不生成偏移值 */
export function platformCenters(all: PlumbObs[]): CenterObs[] {
  const out: CenterObs[] = [];
  for (const m of measures(all)) {
    if (m.elevation === null) continue;
    const problems: string[] = [];
    if (m.basePending) problems.push('基准待确认：固定偏置或测站未确认，不输出平台中心偏移');
    else if (m.kind === 'outer' && m.outer!.mode === 'partial') problems.push('外侧单点：只输出径向方向平移');
    out.push({
      key: 'P:' + m.id,
      siloId: m.siloId,
      source: 'P',
      time: m.time,
      session: sessionOf(m.time),
      elevation: m.elevation,
      x: m.basePending ? null : m.x,
      y: m.basePending ? null : m.y,
      resultant: m.basePending ? null : m.resultant,
      status: m.basePending ? 'insufficient' : statusOf(m.x, m.y),
      problems,
      rotationDeg: m.rotationDeg,
      residual: m.residual,
      recordIds: m.records.map((r) => r.id),
      note: m.records.map((r) => r.note).filter(Boolean).join('；'),
    });
  }
  return out;
}

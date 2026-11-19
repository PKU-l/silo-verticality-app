/**
 * 符号方向换算：把“读数 / 分量”与“方位名称”互相转换。
 * 本文件只做纯计算，不依赖任何界面代码。
 */
import type { AxisLabels, Cardinal, Dir, LineReading, PlumbLine, Side } from '../model/types';

/** 各方位在内部坐标中的单位向量（X 右 / 东为正，Y 上 / 北为正） */
export const CARDINAL_VEC: Record<Cardinal, { x: number; y: number }> = {
  E: { x: 1, y: 0 },
  W: { x: -1, y: 0 },
  N: { x: 0, y: 1 },
  S: { x: 0, y: -1 },
};

export const CARDINALS: Cardinal[] = ['E', 'W', 'N', 'S'];

export function axisOf(c: Cardinal): 'X' | 'Y' {
  return c === 'E' || c === 'W' ? 'X' : 'Y';
}

export function opposite(c: Cardinal): Cardinal {
  return ({ E: 'W', W: 'E', N: 'S', S: 'N' } as const)[c];
}

/** 方位的显示名称（随用户设置同步） */
export function cardinalLabel(c: Cardinal, l: AxisLabels): string {
  return { E: l.posX, W: l.negX, N: l.posY, S: l.negY }[c];
}

export function sideLabel(s: Side, l: AxisLabels): string {
  return s === 'OTHER' ? '其他方位' : cardinalLabel(s, l) + '侧';
}

/** 读数增大方向只允许与测点方位同轴（东西侧 → 东/西；南北侧 → 南/北） */
export function allowedPositiveDirs(side: Side): Cardinal[] {
  if (side === 'E' || side === 'W') return ['E', 'W'];
  if (side === 'N' || side === 'S') return ['N', 'S'];
  return [];
}

/** 观测线定义是否足以把读数换算为 X/Y 位移 */
export function lineIsResolvable(line: PlumbLine): boolean {
  return (
    line.side !== 'OTHER' &&
    line.positiveDir !== null &&
    allowedPositiveDirs(line.side).includes(line.positiveDir) &&
    line.baseReading !== null &&
    Number.isFinite(line.baseReading)
  );
}

export interface Displacement {
  /** 读数 − 基准读数，沿“读数增大方向”的有符号位移，mm */
  along: number;
  /** 换算后的 X、Y 分量；方位未定义时为 null */
  dx: number | null;
  dy: number | null;
}

/**
 * 单个读数 → 测点有符号水平位移。
 *   along = 读数 − 基准读数
 *   (dx, dy) = along × 单位向量(读数增大方向)
 */
export function lineDisplacement(line: PlumbLine, r: LineReading): Displacement | null {
  if (r.reading === null || line.baseReading === null) return null;
  if (!Number.isFinite(r.reading) || !Number.isFinite(line.baseReading)) return null;
  const along = r.reading - line.baseReading;
  if (!lineIsResolvable(line)) return { along, dx: null, dy: null };
  const v = CARDINAL_VEC[line.positiveDir as Cardinal];
  return { along, dx: clean(v.x * along), dy: clean(v.y * along) };
}

/** 避免出现 −0 */
export function clean(n: number): number {
  return n === 0 ? 0 : n;
}

export function fmtAbs(v: number, digits = 1): string {
  return Math.abs(v).toFixed(digits);
}

/** 单个分量的方向解释，如 “向东 12.0 mm” */
export function describeComponent(v: number | null, axis: 'X' | 'Y', l: AxisLabels, digits = 1): string {
  if (v === null || !Number.isFinite(v)) return `${axis === 'X' ? l.xName : l.yName} 无数据`;
  if (Math.abs(v) < 0.05) return `${axis === 'X' ? l.xName : l.yName} 方向无偏移`;
  const name = axis === 'X' ? (v > 0 ? l.posX : l.negX) : v > 0 ? l.posY : l.negY;
  return `向${name} ${fmtAbs(v, digits)} mm`;
}

/** X、Y 合起来的方向解释，如 “向东 12.0 mm、向南 5.0 mm” */
export function describeOffset(x: number | null, y: number | null, l: AxisLabels, digits = 1): string {
  const zx = x !== null && Math.abs(x) < 0.05;
  const zy = y !== null && Math.abs(y) < 0.05;
  if (zx && zy) return '无偏移（与设计中心重合）';
  return `${describeComponent(x, 'X', l, digits)}、${describeComponent(y, 'Y', l, digits)}`;
}

/** 合成偏移量 √(X²+Y²)，任一分量缺失返回 null */
export function resultant(x: number | null, y: number | null): number | null {
  if (x === null || y === null || !Number.isFinite(x) || !Number.isFinite(y)) return null;
  return Math.sqrt(x * x + y * y);
}

/** 带符号格式化：+12.0 / −5.0 */
export function fmtSigned(v: number | null, digits = 1): string {
  if (v === null || !Number.isFinite(v)) return '—';
  if (Math.abs(v) < Math.pow(10, -digits) / 2) return (0).toFixed(digits);
  return (v > 0 ? '+' : '−') + Math.abs(v).toFixed(digits);
}

export function fmt(v: number | null, digits = 1): string {
  if (v === null || !Number.isFinite(v)) return '—';
  return v.toFixed(digits);
}

/** 读数大小 + 方向 → 有符号值；任一缺失返回 null（空白不视为零） */
export function signed(mag: number | null, dir: Dir | null): number | null {
  if (mag === null || dir === null || !Number.isFinite(mag)) return null;
  return clean(dir === 'pos' ? mag : -mag);
}

/**
 * 图形坐标换算（纯函数，便于单元测试）。
 * SVG 坐标 y 向下为正，因此 +Y（北）需要取负号。
 */

export interface Scale {
  (v: number): number;
  domain: [number, number];
  range: [number, number];
}

export function linear(domain: [number, number], range: [number, number]): Scale {
  const [d0, d1] = domain, [r0, r1] = range;
  const k = d1 === d0 ? 0 : (r1 - r0) / (d1 - d0);
  const f = ((v: number) => r0 + (v - d0) * k) as Scale;
  f.domain = domain;
  f.range = range;
  return f;
}

export function niceStep(span: number, count = 5): number {
  if (span <= 0) return 1;
  const raw = span / count;
  const p = Math.pow(10, Math.floor(Math.log10(raw)));
  const n = raw / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p;
}

export function ticks(min: number, max: number, count = 5): number[] {
  const step = niceStep(max - min, count);
  const out: number[] = [];
  for (let v = Math.ceil(min / step) * step; v <= max + 1e-9; v += step) out.push(Math.round(v * 1e6) / 1e6);
  return out;
}

/** 平面图：每米对应的像素（设计外圆按真实比例绘制） */
export function planPxPerM(outerDiameter: number, outerRadiusPx: number): number {
  return outerRadiusPx / (outerDiameter / 2);
}

/**
 * 偏移（mm）→ 平面图上相对设计中心的 SVG 位移（px）。
 * 放大倍数只作用于显示，不改变 x、y 数值本身。
 */
export function offsetToSvg(xMm: number, yMm: number, pxPerM: number, mag: number): { dx: number; dy: number } {
  const k = (pxPerM * mag) / 1000;
  const dx = xMm * k;
  const dy = -yMm * k;
  return { dx: dx === 0 ? 0 : dx, dy: dy === 0 ? 0 : dy };
}

/** 立面图横轴范围：对称（分量）或从 0 开始（合成偏移量） */
export function profileDomain(values: number[], extra: number[], nonNegative: boolean): [number, number] {
  const m = Math.max(5, ...values.map(Math.abs), ...extra.map(Math.abs));
  const step = niceStep(m * 1.15, 4);
  const top = Math.ceil((m * 1.15) / step) * step;
  return nonNegative ? [0, top] : [-top, top];
}

/** 真北箭头：相对 +Y 顺时针旋转 angleDeg 后的单位向量（SVG 坐标） */
export function northVector(angleDeg: number): { dx: number; dy: number } {
  const a = (angleDeg * Math.PI) / 180;
  return { dx: Math.sin(a), dy: -Math.cos(a) };
}

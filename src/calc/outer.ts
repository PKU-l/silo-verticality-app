/**
 * 外侧垂准点：平台平移 + 扭转联合解算。
 *
 * 布置：地面测站 G 在仓外，光束竖直向上打到平台外挑架上的投影板（刻度原点 O）。
 * 设平台中心相对设计中心平移 t，绕中心扭转 θ（逆时针为正，弧度，小角度），
 * 投影板刻度原点设计位置在平台中心外 r·u 处（u 为测点方位单位向量，r 为半径）。
 *
 *   O = D + t + r·u + θ·r·v        （v = k×u，逆时针切向单位向量）
 *   G = D + r·u + e                （e：测站相对刻度原点设计位置竖直投影的偏差，通常为 0）
 *   q = G − O                      （光斑相对刻度原点的读数）
 *   ⇒ w ≡ e − q = t + θ·r·v
 *
 * 每个测点的径向分量 u·w = u·t 与扭转无关，可靠；切向分量 v·w = v·t + θ·r 混有扭转。
 *  - 同一仓 ≥2 个不同方位的测点：最小二乘解 (tX, tY, θ)，多余观测给出校核残差；
 *  - 只有一个测点：只输出其径向那一个方向的平移，不输出另一方向，也不输出扭转角。
 */
import type { Cardinal, PlumbObs } from '../model/types';
import { CARDINAL_VEC, clean, resultant, signed } from './direction';

export interface OuterPointInfo {
  obs: PlumbObs;
  side: Cardinal;
  radiusMm: number;
  /** 光斑读数 q（mm，项目坐标） */
  qx: number | null;
  qy: number | null;
  /** w = e − q */
  wx: number | null;
  wy: number | null;
  /** 该点径向给出的平移分量（沿 X 或 Y 轴） */
  radialAxis: 'X' | 'Y';
  radialValue: number | null;
  /** 解算后的残差（mm） */
  resX: number | null;
  resY: number | null;
}

export interface OuterSolution {
  x: number | null;
  y: number | null;
  resultant: number | null;
  rotationRad: number | null;
  rotationDeg: number | null;
  /** 最大校核残差（mm），无多余观测时为 null */
  residualMax: number | null;
  mode: 'full' | 'partial' | 'none';
  basePending: boolean;
  points: OuterPointInfo[];
  notes: string[];
}

function tangent(u: { x: number; y: number }) {
  return { x: -u.y, y: u.x };
}

/** 3×3 线性方程组（高斯消元，部分主元），奇异时返回 null */
function solve3(A: number[][], b: number[]): number[] | null {
  const M = A.map((row, i) => [...row, b[i]]);
  for (let c = 0; c < 3; c++) {
    let p = c;
    for (let r = c + 1; r < 3; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    if (Math.abs(M[p][c]) < 1e-9) return null;
    [M[c], M[p]] = [M[p], M[c]];
    for (let r = 0; r < 3; r++) {
      if (r === c) continue;
      const f = M[r][c] / M[c][c];
      for (let k = c; k < 4; k++) M[r][k] -= f * M[c][k];
    }
  }
  return [M[0][3] / M[0][0], M[1][3] / M[1][1], M[2][3] / M[2][2]];
}

export function solveOuter(records: PlumbObs[]): OuterSolution {
  const notes: string[] = [];
  const points: OuterPointInfo[] = [];
  let pending = 0;
  for (const o of records) {
    if (!o.side || o.radius === null || o.radius === undefined || !(o.radius > 0)) {
      notes.push('测点方位或半径未登记，不参与解算');
      pending++;
      continue;
    }
    if (!o.bConfirmed || o.bx === null || o.by === null) {
      notes.push('测站偏差未确认（基准待确认），该点不参与解算');
      pending++;
      continue;
    }
    const qx = signed(o.qx, o.qxDir), qy = signed(o.qy, o.qyDir);
    const u = CARDINAL_VEC[o.side];
    const axis: 'X' | 'Y' = u.x !== 0 ? 'X' : 'Y';
    const wx = qx === null ? null : clean(o.bx - qx);
    const wy = qy === null ? null : clean(o.by - qy);
    points.push({
      obs: o, side: o.side, radiusMm: o.radius * 1000, qx, qy, wx, wy, radialAxis: axis,
      radialValue: axis === 'X' ? wx : wy, resX: null, resY: null,
    });
  }
  const basePending = points.length === 0 && pending > 0;

  // 首选：两个轴向都有径向读数时，平移只取径向分量（与扭转无关），扭转由各点切向分量分别求出；
  // 各点扭转估计之差即“校核闭合差”，能完整反映单个读数的错误。
  const radial: Record<'X' | 'Y', number[]> = { X: [], Y: [] };
  for (const p of points) if (p.radialValue !== null) radial[p.radialAxis].push(p.radialValue);
  const mean = (a: number[]) => a.reduce((x, y) => x + y, 0) / a.length;
  if (radial.X.length && radial.Y.length) {
    const tx = clean(mean(radial.X)), ty = clean(mean(radial.Y));
    const rMean = points.reduce((a, p) => a + p.radiusMm, 0) / points.length;
    const thetas: number[] = [];
    for (const p of points) {
      const v = tangent(CARDINAL_VEC[p.side]);
      const wt = v.x !== 0 ? p.wx : p.wy; // 切向分量
      if (wt === null) continue;
      const vt = v.x !== 0 ? v.x * tx : v.y * ty;
      const vw = v.x !== 0 ? v.x * wt : v.y * wt;
      const th = (vw - vt) / p.radiusMm;
      thetas.push(th);
      if (v.x !== 0) p.resX = null; else p.resY = null;
    }
    const theta = thetas.length ? mean(thetas) : null;
    // 残差：各点切向（扭转估计与均值之差，折算到平均半径）与同轴径向读数之差
    let residualMax: number | null = null;
    if (thetas.length > 1) residualMax = (Math.max(...thetas) - Math.min(...thetas)) * rMean;
    for (const ax of ['X', 'Y'] as const) {
      if (radial[ax].length > 1) residualMax = Math.max(residualMax ?? 0, Math.max(...radial[ax]) - Math.min(...radial[ax]));
    }
    for (const p of points) {
      const v = tangent(CARDINAL_VEC[p.side]);
      if (theta !== null) {
        const pred = { x: tx + theta * p.radiusMm * v.x, y: ty + theta * p.radiusMm * v.y };
        p.resX = p.wx === null ? null : clean(p.wx - pred.x);
        p.resY = p.wy === null ? null : clean(p.wy - pred.y);
      }
    }
    if (theta === null) notes.push('各测点均无切向读数，无法解算平台扭转');
    return {
      x: tx, y: ty, resultant: resultant(tx, ty), rotationRad: theta, rotationDeg: theta === null ? null : (theta * 180) / Math.PI,
      residualMax, mode: theta === null ? 'partial' : 'full', basePending: false, points, notes,
    };
  }

  // 组装方程：w_c = t_c + φ·(r/s)·v_c，φ = θ·s（s 为平均半径，改善数值条件）
  const s = points.length ? points.reduce((a, p) => a + p.radiusMm, 0) / points.length : 1;
  const rows: { a: number[]; w: number; p: OuterPointInfo; c: 'x' | 'y' }[] = [];
  for (const p of points) {
    const v = tangent(CARDINAL_VEC[p.side]);
    if (p.wx !== null) rows.push({ a: [1, 0, (p.radiusMm / s) * v.x], w: p.wx, p, c: 'x' });
    if (p.wy !== null) rows.push({ a: [0, 1, (p.radiusMm / s) * v.y], w: p.wy, p, c: 'y' });
  }
  let sol: number[] | null = null;
  if (rows.length >= 3) {
    const N = [0, 1, 2].map((i) => [0, 1, 2].map((j) => rows.reduce((acc, r) => acc + r.a[i] * r.a[j], 0)));
    const rhs = [0, 1, 2].map((i) => rows.reduce((acc, r) => acc + r.a[i] * r.w, 0));
    sol = solve3(N, rhs);
  }

  if (sol) {
    const [tx, ty, phi] = sol;
    let resMax = 0;
    for (const r of rows) {
      const res = r.w - (r.a[0] * tx + r.a[1] * ty + r.a[2] * phi);
      if (r.c === 'x') r.p.resX = clean(res); else r.p.resY = clean(res);
      resMax = Math.max(resMax, Math.abs(res));
    }
    const theta = phi / s;
    const x = clean(Math.round(tx * 1000) / 1000), y = clean(Math.round(ty * 1000) / 1000);
    return {
      x, y, resultant: resultant(x, y), rotationRad: theta, rotationDeg: (theta * 180) / Math.PI,
      residualMax: rows.length > 3 ? resMax : null, mode: 'full', basePending: false, points, notes,
    };
  }

  // 秩不足：只用各点的径向分量（与扭转无关）
  const byAxis: Record<'X' | 'Y', number[]> = { X: [], Y: [] };
  for (const p of points) if (p.radialValue !== null) byAxis[p.radialAxis].push(p.radialValue);
  const avg = (a: number[]) => (a.length ? clean(a.reduce((x, y) => x + y, 0) / a.length) : null);
  const x = avg(byAxis.X), y = avg(byAxis.Y);
  let residualMax: number | null = null;
  for (const ax of ['X', 'Y'] as const) {
    if (byAxis[ax].length > 1) residualMax = Math.max(residualMax ?? 0, Math.max(...byAxis[ax]) - Math.min(...byAxis[ax]));
  }
  if (points.length === 1) notes.push('只有一个外侧测点：只输出其径向方向的平移，另一方向与扭转角无法确定');
  return {
    x, y, resultant: resultant(x, y), rotationRad: null, rotationDeg: null, residualMax,
    mode: x === null && y === null ? 'none' : 'partial', basePending, points, notes,
  };
}

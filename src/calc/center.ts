/**
 * 截面中心计算。
 *
 * 方式 A：记录本身即中心偏移。
 * 方式 B：同一筒仓、同一观测批次（日期）、同一标高的读数归为一组：
 *   X 中心偏移 = (东侧测点 X 位移 + 西侧测点 X 位移) / 2
 *   X 向尺寸变化 = 东侧测点 X 位移 − 西侧测点 X 位移
 *   Y 同理（北、南）。
 *   任一对测点缺一侧，则该方向中心偏移为 null（“数据不足”），不做任何假设。
 */
import type { Cardinal, CenterObs, CenterRecord, LineReading, ObsStatus, PlumbLine, SideDetail } from '../model/types';
import { clean, lineDisplacement, lineIsResolvable, resultant } from './direction';

export function sessionOf(time: string): string {
  return (time || '').slice(0, 10);
}

export function elevKey(e: number): string {
  return e.toFixed(3);
}

export function statusOf(x: number | null, y: number | null): ObsStatus {
  if (x !== null && y !== null) return 'complete';
  if (x !== null) return 'x-only';
  if (y !== null) return 'y-only';
  return 'insufficient';
}

export const STATUS_TEXT: Record<ObsStatus, string> = {
  complete: 'X、Y 完整',
  'x-only': '仅 X 方向，Y 数据不足',
  'y-only': '仅 Y 方向，X 数据不足',
  insufficient: '中心偏移数据不足',
};

export function centersFromA(records: CenterRecord[]): CenterObs[] {
  const out: CenterObs[] = [];
  for (const r of records) {
    if (!r.siloId || r.elevation === null || !Number.isFinite(r.elevation)) continue;
    const x = r.x !== null && Number.isFinite(r.x) ? r.x : null;
    const y = r.y !== null && Number.isFinite(r.y) ? r.y : null;
    out.push({
      key: 'A:' + r.id,
      siloId: r.siloId,
      source: 'A',
      time: r.time,
      session: sessionOf(r.time),
      elevation: r.elevation,
      x,
      y,
      resultant: resultant(x, y),
      status: statusOf(x, y),
      recordIds: [r.id],
      note: r.note,
    });
  }
  return out;
}

/** 两侧测点合成一个方向的中心偏移与尺寸变化 */
export function pairCenter(
  pos: SideDetail | undefined,
  neg: SideDetail | undefined,
  axis: 'X' | 'Y',
): { center: number | null; diam: number | null } {
  if (!pos || !neg) return { center: null, diam: null };
  const a = axis === 'X' ? pos.dx : pos.dy;
  const b = axis === 'X' ? neg.dx : neg.dy;
  return { center: clean((a + b) / 2), diam: clean(a - b) };
}

export function centersFromPlumb(lines: PlumbLine[], readings: LineReading[]): CenterObs[] {
  const lineById = new Map(lines.map((l) => [l.id, l]));
  type Group = { siloId: string; session: string; elevation: number; items: { line: PlumbLine; r: LineReading }[] };
  const groups = new Map<string, Group>();
  for (const r of readings) {
    const line = lineById.get(r.lineId);
    if (!line || r.elevation === null || !Number.isFinite(r.elevation)) continue;
    const session = sessionOf(r.time);
    const k = `${line.siloId}|${session}|${elevKey(r.elevation)}`;
    if (!groups.has(k)) groups.set(k, { siloId: line.siloId, session, elevation: r.elevation, items: [] });
    groups.get(k)!.items.push({ line, r });
  }

  const out: CenterObs[] = [];
  for (const [k, g] of groups) {
    const sides: Partial<Record<Cardinal, SideDetail>> = {};
    const dup = new Set<Cardinal>();
    const problems: string[] = [];
    let time = '';
    const notes: string[] = [];
    for (const { line, r } of g.items) {
      if (r.time > time) time = r.time;
      if (r.note) notes.push(`${line.name}：${r.note}`);
      if (!lineIsResolvable(line)) continue; // “其他方位”或定义不完整：只进局部视图
      const d = lineDisplacement(line, r);
      if (!d || d.dx === null || d.dy === null) continue;
      const side = line.side as Cardinal;
      if (sides[side]) {
        dup.add(side);
        continue;
      }
      sides[side] = { line, reading: r, along: d.along, dx: d.dx, dy: d.dy };
    }
    if (Object.keys(sides).length === 0) continue; // 该组没有可换算的方位读数
    for (const s of dup) {
      problems.push(`同一标高 ${s} 侧存在多条读数，该方向不计算中心，请核查`);
      delete sides[s];
    }
    const X = pairCenter(sides.E, sides.W, 'X');
    const Y = pairCenter(sides.N, sides.S, 'Y');
    out.push({
      key: 'B:' + k,
      siloId: g.siloId,
      source: 'B',
      time,
      session: g.session,
      elevation: g.elevation,
      x: X.center,
      y: Y.center,
      resultant: resultant(X.center, Y.center),
      status: statusOf(X.center, Y.center),
      diamX: X.diam,
      diamY: Y.diam,
      sides,
      problems,
      recordIds: g.items.map((i) => i.r.id),
      note: notes.join('；'),
    });
  }
  return out;
}

export function allCenters(
  records: CenterRecord[],
  lines: PlumbLine[],
  readings: LineReading[],
): CenterObs[] {
  return [...centersFromA(records), ...centersFromPlumb(lines, readings)].sort(
    (a, b) => a.time.localeCompare(b.time) || a.elevation - b.elevation,
  );
}

/** 每个标高取最新一次观测（用于平面轨迹） */
export function latestPerElevation(obs: CenterObs[]): CenterObs[] {
  const m = new Map<string, CenterObs>();
  for (const o of obs) {
    const k = elevKey(o.elevation);
    const cur = m.get(k);
    if (!cur || o.time > cur.time) m.set(k, o);
  }
  return [...m.values()].sort((a, b) => a.elevation - b.elevation);
}

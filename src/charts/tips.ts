/** 悬停 / 点击提示内容（只做格式化，不做计算） */
import type { AxisLabels, CenterObs, LineReading, PlumbLine } from '../model/types';
import { cardinalLabel, describeComponent, fmt, fmtSigned, lineDisplacement, sideLabel } from '../calc/direction';
import { STATUS_TEXT } from '../calc/center';

export interface Tip {
  title: string;
  rows: [string, string][];
}

export type TipHandler = (tip: Tip | null, ev?: { clientX: number; clientY: number }, pin?: boolean) => void;

const tm = (s: string) => s.replace('T', ' ');

export function obsTip(o: CenterObs, l: AxisLabels): Tip {
  const rows: [string, string][] = [
    ['观测时间', tm(o.time)],
    ['标高', `${fmt(o.elevation, 2)} m`],
    ['来源', o.source === 'A' ? '方式 A：直接录入中心偏移' : '方式 B：铅垂线/固定基准读数换算'],
  ];
  if (o.sides) {
    for (const s of ['E', 'W', 'N', 'S'] as const) {
      const d = o.sides[s];
      if (!d) continue;
      rows.push([
        `${cardinalLabel(s, l)}侧 ${d.line.name}`,
        `读数 ${fmt(d.reading.reading, 1)} − 基准 ${fmt(d.line.baseReading, 1)} = ${fmtSigned(d.along)} mm → 测点${describeComponent(
          s === 'E' || s === 'W' ? d.dx : d.dy, s === 'E' || s === 'W' ? 'X' : 'Y', l)}`,
      ]);
    }
  }
  rows.push([`${l.xName} 中心偏移`, o.x === null ? '数据不足' : `${fmtSigned(o.x)} mm（${describeComponent(o.x, 'X', l)}）`]);
  rows.push([`${l.yName} 中心偏移`, o.y === null ? '数据不足' : `${fmtSigned(o.y)} mm（${describeComponent(o.y, 'Y', l)}）`]);
  rows.push(['合成偏移量', o.resultant === null ? '不计算（X、Y 未同时有效）' : `${fmt(o.resultant)} mm`]);
  if (o.diamX != null) rows.push([`${l.xName} 向尺寸变化`, `${fmtSigned(o.diamX)} mm`]);
  if (o.diamY != null) rows.push([`${l.yName} 向尺寸变化`, `${fmtSigned(o.diamY)} mm`]);
  rows.push(['数据状态', STATUS_TEXT[o.status]]);
  for (const p of o.problems ?? []) rows.push(['核查', p]);
  if (o.note) rows.push(['备注', o.note]);
  return { title: `筒仓 ${o.siloId} · ${fmt(o.elevation, 2)} m`, rows };
}

export function readingTip(line: PlumbLine, r: LineReading, l: AxisLabels, usedInCenter: boolean): Tip {
  const d = lineDisplacement(line, r);
  const rows: [string, string][] = [
    ['观测线', `${line.name}（${line.side === 'OTHER' ? line.azimuthText || '其他方位' : sideLabel(line.side, l)}）`],
    ['观测时间', tm(r.time)],
    ['标高', `${fmt(r.elevation, 2)} m`],
    ['原始读数', `${fmt(r.reading, 1)} mm`],
    ['基准读数', `${fmt(line.baseReading, 1)} mm`],
    ['读数差', d ? `${fmtSigned(d.along)} mm` : '—'],
  ];
  if (d && d.dx !== null && d.dy !== null) {
    const axis = line.side === 'E' || line.side === 'W' ? 'X' : 'Y';
    rows.push(['测点位移', describeComponent(axis === 'X' ? d.dx : d.dy, axis, l)]);
  } else if (line.side === 'OTHER') {
    rows.push(['读数增大方向', line.positiveText || '未说明']);
  }
  rows.push(['中心换算', usedInCenter ? '已与对侧测点组合换算中心' : '无对侧测点，不能换算中心偏移']);
  if (r.note) rows.push(['备注', r.note]);
  return { title: `筒仓 ${line.siloId} · ${line.name}`, rows };
}

/**
 * 数据校验：只产生提示，不修改、不删除任何原始数据。
 */
import type { AppData, CenterRecord, LineReading, PlumbLine } from '../model/types';
import { allowedPositiveDirs } from './direction';
import { elevKey, sessionOf } from './center';

export interface Issue {
  level: 'error' | 'warn';
  kind: 'A' | 'LINE' | 'READING';
  id: string;
  message: string;
}

function numOk(v: number | null): v is number {
  return v !== null && Number.isFinite(v);
}

/** 某仓的观测标高范围（未定义时用项目默认） */
function rangeOf(data: AppData, siloId: string | undefined): [number, number] {
  const s = data.silos?.find((x) => x.id === siloId);
  return s ? [s.elevMin, s.elevMax] : [0, data.config.wallHeight];
}

export function validateCenterRecords(recs: CenterRecord[], data: AppData): Issue[] {
  const { jumpThresholdMm } = data.config;
  const out: Issue[] = [];
  const seen = new Map<string, string>();
  for (const r of recs) {
    const push = (level: Issue['level'], message: string) => out.push({ level, kind: 'A', id: r.id, message });
    if (!r.siloId) push('error', '筒仓编号为空');
    else if (data.silos?.length && !data.silos.some((x) => x.id === r.siloId)) push('error', `仓号 ${r.siloId} 不属于本组筒仓`);
    const [lo, hi] = rangeOf(data, r.siloId);
    if (!r.time) push('error', '观测时间为空');
    if (!numOk(r.elevation)) push('error', '观测标高为空');
    if (!numOk(r.x) && !numOk(r.y)) push('error', 'X、Y 偏移均为空');
    else if (!numOk(r.x) || !numOk(r.y)) push('warn', `${numOk(r.x) ? 'Y' : 'X'} 偏移为空，该记录仅有单方向数据`);
    if (numOk(r.elevation)) {
      if (r.elevation < lo || r.elevation > hi)
        push('warn', `标高 ${r.elevation} m 超出该仓观测范围 ${lo}～${hi} m`);
      if (r.elevation > 1000) push('warn', '标高数值过大，可能以 mm 录入（标高应以 m 为单位）');
    }
    for (const [k, v] of [['X', r.x], ['Y', r.y]] as const) {
      if (!numOk(v)) continue;
      if (Math.abs(v) > 500) push('warn', `${k} 偏移 ${v} mm 异常偏大，请确认单位为 mm`);
      if (v !== 0 && Math.abs(v) < 0.1) push('warn', `${k} 偏移 ${v} 很小，可能以 m 录入（偏移应以 mm 为单位）`);
    }
    for (const f of r.flags ?? []) push('warn', f);
    if (r.siloId && r.time && numOk(r.elevation)) {
      const k = `${r.siloId}|${r.time}|${elevKey(r.elevation)}`;
      if (seen.has(k)) push('warn', '重复记录：同一筒仓、同一时间、同一标高已存在');
      else seen.set(k, r.id);
    }
  }
  // 同一筒仓、同一批次内，相邻标高的中心偏移突变
  const bySession = new Map<string, CenterRecord[]>();
  for (const r of recs) {
    if (!numOk(r.elevation)) continue;
    const k = r.siloId + '|' + sessionOf(r.time);
    if (!bySession.has(k)) bySession.set(k, []);
    bySession.get(k)!.push(r);
  }
  for (const list of bySession.values()) {
    list.sort((a, b) => (a.elevation as number) - (b.elevation as number));
    for (let i = 1; i < list.length; i++) {
      const a = list[i - 1], b = list[i];
      for (const k of ['x', 'y'] as const) {
        const va = a[k], vb = b[k];
        if (numOk(va) && numOk(vb) && Math.abs(vb - va) > jumpThresholdMm)
          out.push({
            level: 'warn', kind: 'A', id: b.id,
            message: `${k.toUpperCase()} 与下方标高 ${a.elevation} m 相差 ${Math.abs(vb - va).toFixed(1)} mm，超过突变提示值 ${jumpThresholdMm} mm，请核查原始记录`,
          });
      }
    }
  }
  return out;
}

export function validateLines(lines: PlumbLine[]): Issue[] {
  const out: Issue[] = [];
  const names = new Set<string>();
  for (const l of lines) {
    const push = (level: Issue['level'], message: string) => out.push({ level, kind: 'LINE', id: l.id, message });
    if (!l.name) push('error', '观测线名称为空');
    if (!l.siloId) push('error', '筒仓编号为空');
    const nk = l.siloId + '|' + l.name;
    if (names.has(nk)) push('warn', `筒仓 ${l.siloId} 中观测线名称“${l.name}”重复`);
    names.add(nk);
    if (!numOk(l.baseReading)) push('error', '基准读数为空，无法换算位移');
    if (l.side !== 'OTHER') {
      if (!l.positiveDir) push('error', '未定义读数增大方向，无法换算位移');
      else if (!allowedPositiveDirs(l.side).includes(l.positiveDir))
        push('error', '读数增大方向必须与测点方位同轴');
    } else {
      push('warn', '“其他方位”观测线仅显示局部读数，不参与中心偏移换算');
    }
  }
  return out;
}

export function validateReadings(readings: LineReading[], data: AppData): Issue[] {
  const { jumpThresholdMm } = data.config;
  const lineById = new Map(data.lines.map((l) => [l.id, l]));
  const out: Issue[] = [];
  const seen = new Set<string>();
  for (const r of readings) {
    const push = (level: Issue['level'], message: string) => out.push({ level, kind: 'READING', id: r.id, message });
    if (!lineById.has(r.lineId)) push('error', '所属观测线不存在');
    if (!r.time) push('error', '观测时间为空');
    if (!numOk(r.elevation)) push('error', '观测标高为空');
    if (!numOk(r.reading)) push('error', '读数为空');
    const [lo, hi] = rangeOf(data, lineById.get(r.lineId)?.siloId);
    if (numOk(r.elevation) && (r.elevation < lo || r.elevation > hi))
      push('warn', `标高 ${r.elevation} m 超出该仓观测范围 ${lo}～${hi} m`);
    if (numOk(r.elevation) && r.elevation > 1000) push('warn', '标高数值过大，可能以 mm 录入');
    for (const f of r.flags ?? []) push('warn', f);
    if (numOk(r.elevation)) {
      const k = `${r.lineId}|${r.time}|${elevKey(r.elevation)}`;
      if (seen.has(k)) push('warn', '重复记录：同一观测线、同一时间、同一标高已存在');
      seen.add(k);
    }
  }
  // 同一测点前后读数突变（按观测时间、标高排序后相邻比较）
  const byLine = new Map<string, LineReading[]>();
  for (const r of readings) {
    if (!numOk(r.reading)) continue;
    if (!byLine.has(r.lineId)) byLine.set(r.lineId, []);
    byLine.get(r.lineId)!.push(r);
  }
  for (const [lineId, list] of byLine) {
    list.sort((a, b) => a.time.localeCompare(b.time) || (a.elevation ?? 0) - (b.elevation ?? 0));
    for (let i = 1; i < list.length; i++) {
      const d = (list[i].reading as number) - (list[i - 1].reading as number);
      if (Math.abs(d) > jumpThresholdMm)
        out.push({
          level: 'warn', kind: 'READING', id: list[i].id,
          message: `观测线“${lineById.get(lineId)?.name ?? ''}”读数较前一次变化 ${d.toFixed(1)} mm，超过突变提示值 ${jumpThresholdMm} mm，请核查原始记录`,
        });
    }
  }
  return out;
}

export function validateAll(data: AppData): Issue[] {
  return [
    ...validateCenterRecords(data.centerRecords, data),
    ...validateLines(data.lines),
    ...validateReadings(data.readings, data),
  ];
}

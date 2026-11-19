/**
 * CSV / 批量粘贴解析与导出。
 * 数值中若带有与规定不一致的单位（如偏移写成 “0.012m”），不做自动换算：
 * 按原数字导入，并在记录上附加提示，供用户核对原始记录。
 */
import type { AxisLabels, Cardinal, CenterObs, CenterRecord, LineReading, PlumbLine, Side } from '../model/types';
import { cardinalLabel, fmt, lineDisplacement } from './direction';

export function uid(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}

/** 解析逗号或制表符分隔的文本（支持双引号） */
export function parseDelimited(text: string): string[][] {
  const t = text.replace(/^﻿/, '').replace(/\r\n?/g, '\n');
  const first = t.split('\n', 1)[0] ?? '';
  const delim = first.includes('\t') ? '\t' : first.includes(',') ? ',' : first.includes('，') ? '，' : ',';
  const rows: string[][] = [];
  let row: string[] = [], cell = '', q = false;
  for (let i = 0; i < t.length; i++) {
    const ch = t[i];
    if (q) {
      if (ch === '"' && t[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') q = false;
      else cell += ch;
    } else if (ch === '"') q = true;
    else if (ch === delim) { row.push(cell.trim()); cell = ''; }
    else if (ch === '\n') { row.push(cell.trim()); rows.push(row); row = []; cell = ''; }
    else cell += ch;
  }
  if (cell.length || row.length) { row.push(cell.trim()); rows.push(row); }
  return rows.filter((r) => r.some((c) => c !== ''));
}

export interface NumParse { value: number | null; flag?: string }

const UNIT_RE = /^([+\-−]?\d+(?:\.\d+)?)\s*(mm|cm|m|毫米|厘米|米)?$/i;

/** 解析带可选单位的数值。expected 为规定单位 */
export function parseNum(cell: string, expected: 'mm' | 'm', field: string): NumParse {
  const s = (cell ?? '').trim().replace(/\s+/g, '');
  if (s === '') return { value: null };
  const m = UNIT_RE.exec(s.replace('−', '-'));
  if (!m) return { value: null, flag: `${field} “${cell}” 不是有效数值` };
  const value = parseFloat(m[1]);
  const unitRaw = (m[2] ?? '').toLowerCase();
  const unit = unitRaw === '毫米' ? 'mm' : unitRaw === '厘米' ? 'cm' : unitRaw === '米' ? 'm' : unitRaw;
  if (unit && unit !== expected)
    return { value, flag: `单位混用：${field} 原始值 “${cell}”，规定单位为 ${expected}，已按数字 ${value} 导入，未换算，请核查` };
  return { value };
}

export function normTime(s: string): string {
  const t = (s ?? '').trim().replace(/\//g, '-').replace(' ', 'T');
  const m = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:T(\d{1,2}):(\d{2}))?/.exec(t);
  if (!m) return t;
  const p = (x: string) => x.padStart(2, '0');
  return `${m[1]}-${p(m[2])}-${p(m[3])}T${p(m[4] ?? '00')}:${m[5] ?? '00'}`;
}

function isHeader(row: string[], numCol: number): boolean {
  const c = row[numCol] ?? '';
  return c !== '' && !/^[+\-−]?\d/.test(c);
}

export interface ImportResult<T> { items: T[]; messages: string[] }

/** 方式 A：筒仓编号, 观测时间, 标高(m), X(mm), Y(mm), 备注 */
export function importCenterRecords(text: string): ImportResult<CenterRecord> {
  const rows = parseDelimited(text);
  const items: CenterRecord[] = [];
  const messages: string[] = [];
  rows.forEach((row, i) => {
    if (i === 0 && isHeader(row, 2)) return;
    const flags: string[] = [];
    const e = parseNum(row[2], 'm', '标高');
    const x = parseNum(row[3], 'mm', 'X');
    const y = parseNum(row[4], 'mm', 'Y');
    for (const p of [e, x, y]) if (p.flag) flags.push(p.flag);
    if (flags.length) messages.push(`第 ${i + 1} 行：${flags.join('；')}`);
    items.push({
      id: uid(), siloId: (row[0] ?? '').trim(), time: normTime(row[1] ?? ''),
      elevation: e.value, x: x.value, y: y.value, note: row[5] ?? '', flags: flags.length ? flags : undefined,
    });
  });
  return { items, messages };
}

export function parseSide(s: string, l: AxisLabels): Side | null {
  const t = (s ?? '').trim().replace(/侧$/, '');
  const map: Record<string, Side> = {
    E: 'E', W: 'W', N: 'N', S: 'S', OTHER: 'OTHER', 其他: 'OTHER',
    东: 'E', 西: 'W', 北: 'N', 南: 'S',
    [l.posX]: 'E', [l.negX]: 'W', [l.posY]: 'N', [l.negY]: 'S',
  };
  return map[t.toUpperCase()] ?? map[t] ?? null;
}

/** 观测线：筒仓编号, 名称, 方位, 基准位置, 读数增大方向, 基准读数(mm), 备注 */
export function importLines(text: string, l: AxisLabels): ImportResult<PlumbLine> {
  const rows = parseDelimited(text);
  const items: PlumbLine[] = [];
  const messages: string[] = [];
  rows.forEach((row, i) => {
    if (i === 0 && isHeader(row, 5)) return;
    const side = parseSide(row[2], l);
    const pos = parseSide(row[4], l);
    const base = parseNum(row[5], 'mm', '基准读数');
    if (!side) messages.push(`第 ${i + 1} 行：方位 “${row[2]}” 无法识别，已记为“其他方位”`);
    if (base.flag) messages.push(`第 ${i + 1} 行：${base.flag}`);
    const s = side ?? 'OTHER';
    items.push({
      id: uid(), siloId: (row[0] ?? '').trim(), name: (row[1] ?? '').trim(), side: s,
      azimuthText: s === 'OTHER' ? row[2] ?? '' : '', basePosition: row[3] ?? '',
      positiveDir: s !== 'OTHER' && pos && pos !== 'OTHER' ? (pos as Cardinal) : null,
      positiveText: s === 'OTHER' ? row[4] ?? '' : '', baseReading: base.value, note: row[6] ?? '',
    });
  });
  return { items, messages };
}

/** 读数：筒仓编号, 观测线名称, 观测时间, 标高(m), 读数(mm), 备注 */
export function importReadings(text: string, lines: PlumbLine[]): ImportResult<LineReading> {
  const rows = parseDelimited(text);
  const items: LineReading[] = [];
  const messages: string[] = [];
  rows.forEach((row, i) => {
    if (i === 0 && isHeader(row, 3)) return;
    const line = lines.find((l) => l.siloId === (row[0] ?? '').trim() && l.name === (row[1] ?? '').trim());
    if (!line) {
      messages.push(`第 ${i + 1} 行：未找到观测线 “${row[0]} / ${row[1]}”，请先定义观测线，该行未导入`);
      return;
    }
    const flags: string[] = [];
    const e = parseNum(row[3], 'm', '标高');
    const r = parseNum(row[4], 'mm', '读数');
    for (const p of [e, r]) if (p.flag) flags.push(p.flag);
    if (flags.length) messages.push(`第 ${i + 1} 行：${flags.join('；')}`);
    items.push({
      id: uid(), lineId: line.id, time: normTime(row[2] ?? ''), elevation: e.value, reading: r.value,
      note: row[5] ?? '', flags: flags.length ? flags : undefined,
    });
  });
  return { items, messages };
}

function esc(v: string | number | null | undefined): string {
  const s = v === null || v === undefined ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(rows: (string | number | null | undefined)[][]): string {
  return '﻿' + rows.map((r) => r.map(esc).join(',')).join('\r\n');
}

const t = (s: string) => s.replace('T', ' ');

export function exportCenterRecords(recs: CenterRecord[]): string {
  return toCsv([
    ['筒仓编号', '观测时间', '标高_m', 'X_mm', 'Y_mm', '备注'],
    ...recs.map((r) => [r.siloId, t(r.time), r.elevation, r.x, r.y, r.note]),
  ]);
}

export function exportLines(lines: PlumbLine[], l: AxisLabels): string {
  return toCsv([
    ['筒仓编号', '观测线名称', '方位', '基准位置', '读数增大方向', '基准读数_mm', '备注'],
    ...lines.map((x) => [
      x.siloId, x.name, x.side === 'OTHER' ? x.azimuthText || '其他' : cardinalLabel(x.side, l),
      x.basePosition, x.positiveDir ? cardinalLabel(x.positiveDir, l) : x.positiveText, x.baseReading, x.note,
    ]),
  ]);
}

/** 读数导出：原始读数、基准读数与换算结果一并导出 */
export function exportReadings(readings: LineReading[], lines: PlumbLine[], l: AxisLabels): string {
  const byId = new Map(lines.map((x) => [x.id, x]));
  return toCsv([
    ['筒仓编号', '观测线名称', '观测时间', '标高_m', '读数_mm', '备注', '基准读数_mm', '读数差_mm', `${l.xName}位移_mm`, `${l.yName}位移_mm`],
    ...readings.map((r) => {
      const line = byId.get(r.lineId);
      const d = line ? lineDisplacement(line, r) : null;
      const along = d ? d.along : null;
      const dx = d ? d.dx : null, dy = d ? d.dy : null;
      return [line?.siloId, line?.name, t(r.time), r.elevation, r.reading, r.note, line?.baseReading,
        along === null ? '' : fmt(along, 2), dx === null ? '' : fmt(dx, 2), dy === null ? '' : fmt(dy, 2)];
    }),
  ]);
}

export function exportCenters(obs: CenterObs[], l: AxisLabels): string {
  return toCsv([
    ['筒仓编号', '观测批次', '观测时间', '标高_m', '来源', `${l.xName}中心偏移_mm`, `${l.yName}中心偏移_mm`, '合成偏移_mm', `${l.xName}向尺寸变化_mm`, `${l.yName}向尺寸变化_mm`, '数据状态'],
    ...obs.map((o) => [
      o.siloId, o.session, t(o.time), o.elevation, o.source === 'A' ? '方式A' : '方式B',
      o.x === null ? '' : fmt(o.x, 2), o.y === null ? '' : fmt(o.y, 2), o.resultant === null ? '' : fmt(o.resultant, 2),
      o.diamX == null ? '' : fmt(o.diamX, 2), o.diamY == null ? '' : fmt(o.diamY, 2),
      { complete: '完整', 'x-only': '仅X', 'y-only': '仅Y', insufficient: '中心偏移数据不足' }[o.status],
    ]),
  ]);
}

export function download(name: string, content: string | Blob, type = 'text/csv;charset=utf-8') {
  const blob = content instanceof Blob ? content : new Blob([content], { type });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
}

/* ---------------- 九仓：仓号校验与垂准仪记录 ---------------- */
import type { Dir, MeasurePoint, PlumbObs, SiloDef, SpotQuality } from '../model/types';
import { isValidSiloId } from './layout';
import { QUALITY_TEXT, type PlatformMeasure } from './plumb';

function checkSilo<T>(res: ImportResult<T>, silos: SiloDef[], get: (t: T) => string): ImportResult<T> {
  const valid = silos.map((s) => s.id).join('、');
  const items: T[] = [];
  const messages = [...res.messages];
  res.items.forEach((it) => {
    const id = get(it);
    if (isValidSiloId(id, silos)) items.push(it);
    else messages.push(`仓号 “${id}” 不属于本组筒仓（${valid}），该行未导入，请核对`);
  });
  return { items, messages };
}

export function importCenterRecordsChecked(text: string, silos: SiloDef[]) {
  return checkSilo(importCenterRecords(text), silos, (r) => r.siloId);
}

export function importLinesChecked(text: string, l: AxisLabels, silos: SiloDef[]) {
  return checkSilo(importLines(text, l), silos, (r) => r.siloId);
}

function parseDir(s: string, l: AxisLabels, axis: 'X' | 'Y'): Dir | null {
  const t = (s ?? '').trim();
  const pos = axis === 'X' ? ['+', '正', 'E', '东', l.posX] : ['+', '正', 'N', '北', l.posY];
  const neg = axis === 'X' ? ['-', '−', '负', 'W', '西', l.negX] : ['-', '−', '负', 'S', '南', l.negY];
  if (pos.includes(t) || pos.includes(t.toUpperCase())) return 'pos';
  if (neg.includes(t) || neg.includes(t.toUpperCase())) return 'neg';
  return null;
}

/** 垂准仪：仓号, 观测时间, 平台标高(m), 投影板编号, X读数(mm), X方向, Y读数(mm), Y方向, 测量人员, 光斑状态, 备注 */
export function importPlumbObs(text: string, points: MeasurePoint[], silos: SiloDef[], l: AxisLabels): ImportResult<PlumbObs> {
  const rows = parseDelimited(text);
  const items: PlumbObs[] = [];
  const messages: string[] = [];
  rows.forEach((row, i) => {
    if (i === 0 && isHeader(row, 2)) return;
    const siloId = (row[0] ?? '').trim();
    if (!isValidSiloId(siloId, silos)) { messages.push(`第 ${i + 1} 行：仓号 “${siloId}” 不属于本组筒仓，未导入`); return; }
    const plate = points.find((p) => (p.type === 'plumb-plate' || p.type === 'outer-plumb') && p.siloId === siloId && p.code === (row[3] ?? '').trim());
    if (!plate) { messages.push(`第 ${i + 1} 行：${siloId} 号仓没有编号为 “${row[3]}” 的投影板或外侧垂准点，未导入`); return; }
    const flags: string[] = [];
    const e = parseNum(row[2], 'm', '平台标高');
    const x = parseNum(row[4], 'mm', 'X 读数');
    const y = parseNum(row[6], 'mm', 'Y 读数');
    for (const p of [e, x, y]) if (p.flag) flags.push(p.flag);
    let qx = x.value, qy = y.value;
    let qxDir = parseDir(row[5], l, 'X'), qyDir = parseDir(row[7], l, 'Y');
    // 读数本身带符号时，按符号确定方向
    if (qx !== null && qx < 0) { qx = -qx; qxDir = qxDir ?? 'neg'; }
    if (qy !== null && qy < 0) { qy = -qy; qyDir = qyDir ?? 'neg'; }
    if (flags.length) messages.push(`第 ${i + 1} 行：${flags.join('；')}`);
    const q = (row[9] ?? '').trim();
    const quality = (Object.entries(QUALITY_TEXT).find(([, v]) => v === q)?.[0] ?? (q.includes('存疑') ? 'doubtful' : 'clear')) as SpotQuality;
    items.push({
      id: uid(), siloId, roundId: null, time: normTime(row[1] ?? ''), elevation: e.value, plateId: plate.id,
      qx, qxDir: qx === null ? null : qxDir, qy, qyDir: qy === null ? null : qyDir,
      bx: plate.offsetX, by: plate.offsetY, bConfirmed: plate.offsetConfirmed, quality, surveyor: row[8] ?? '',
      note: [row[10] ?? '', ...flags].filter(Boolean).join('；'),
      ...(plate.type === 'outer-plumb' ? { kind: 'outer' as const, side: plate.side ?? null, radius: plate.radius ?? null } : { kind: 'center' as const }),
    });
  });
  // 外侧垂准点：同仓、同时间、同标高的行归为一次观测
  const groups = new Map<string, string>();
  for (const it of items) {
    if (it.kind !== 'outer') continue;
    const k = `${it.siloId}|${it.time}|${it.elevation}`;
    if (!groups.has(k)) groups.set(k, uid());
    it.groupId = groups.get(k);
  }
  return { items, messages };
}

export interface RoundRow { siloId: string; position: string; status: string; measure: PlatformMeasure | null; reasons: string[]; codeOf: (plateId: string) => string }

/** 本轮记录表：九仓状态、标高、时间、原始读数、固定偏置/测站偏差、换算结果、备注（外侧垂准点每个测点一行） */
export function exportRound(rows: RoundRow[], l: AxisLabels, roundName: string): string {
  const d = (v: Dir | null, axis: 'X' | 'Y') => (v === null ? '' : axis === 'X' ? (v === 'pos' ? l.posX : l.negX) : v === 'pos' ? l.posY : l.negY);
  const out: (string | number | null | undefined)[][] = [
    [`观测轮次：${roundName}`],
    ['仓号', '图纸位置', '状态', '测量方式', '观测时间', '平台标高_m', '测点/投影板', '测点方位', '半径_m', 'X读数_mm', 'X读数方向', 'Y读数_mm', 'Y读数方向',
      '偏置或测站偏差X_mm', '偏置或测站偏差Y_mm', '已确认', `平台中心${l.xName}_mm`, `平台中心${l.yName}_mm`, '合成_mm', '平台扭转_度', '校核闭合差_mm',
      '光斑状态', '测量人员', '复核原因', '备注'],
  ];
  for (const r of rows) {
    const m = r.measure;
    if (!m) { out.push([r.siloId, r.position, r.status]); continue; }
    m.records.forEach((o, i) => {
      out.push([
        r.siloId, r.position, r.status, m.kind === 'outer' ? '外侧垂准点' : '中心垂准仪', o.time.replace('T', ' '), o.elevation, r.codeOf(o.plateId),
        o.side ? cardinalLabel(o.side, l) : '', o.radius ?? '', o.qx, d(o.qxDir, 'X'), o.qy, d(o.qyDir, 'Y'), o.bx, o.by, o.bConfirmed ? '是' : '否',
        i === 0 && !m.basePending && m.x !== null ? fmt(m.x, 1) : '', i === 0 && !m.basePending && m.y !== null ? fmt(m.y, 1) : '',
        i === 0 && !m.basePending && m.resultant !== null ? fmt(m.resultant, 1) : '', i === 0 && m.rotationDeg !== null ? m.rotationDeg.toFixed(4) : '',
        i === 0 && m.residual !== null ? fmt(m.residual, 1) : '', QUALITY_TEXT[o.quality], o.surveyor, i === 0 ? r.reasons.join('；') : '', o.note,
      ]);
    });
  }
  return toCsv(out);
}

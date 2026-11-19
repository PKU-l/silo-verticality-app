/** 八点模式 CSV 导入导出（导出含原始读数与换算结果；导入只接受已存在的点号） */
import type { DistPoint, DistReading, Validity } from '../model/distTypes';
import { SIDE_FULL, calcReading } from './distance';
import { fmt } from './direction';
import { normTime, parseDelimited, parseNum, toCsv, uid, type ImportResult } from './csv';

const VAL: Record<Validity, string> = { valid: '有效', doubtful: '存疑', invalid: '无效' };

export function exportDistPoints(points: DistPoint[]): string {
  return toCsv([
    ['点号', '仓号', '方位', '基准标高_m', '底部基准距离_mm', '基准线说明', '基准关系确认', '方向规则确认', '测量人员', '复核人员', '复核时间', '备注'],
    ...points.map((p) => [p.id, p.siloId, SIDE_FULL[p.side], p.baseElevation, p.baseDistance, p.lineDesc, p.baseConfirmed ? '是' : '否', p.directionConfirmed ? '是' : '否',
      p.surveyor, p.reviewer, p.reviewedAt.replace('T', ' '), p.note]),
  ]);
}

export function exportDistReadings(points: DistPoint[], readings: DistReading[], roundName: (id: string | null) => string): string {
  const byId = new Map(points.map((p) => [p.id, p]));
  return toCsv([
    ['点号', '观测时间', '观测标高_m', '本次距离_mm', '设计修正_mm', '修正依据', '有效状态', '测量人员', '备注', '轮次', '复核人员', '复核时间',
      '底部基准距离_mm', '差值_mm', '修正后_mm', '方向分量', '分量_mm'],
    ...readings.map((r) => {
      const p = byId.get(r.pointId);
      const c = p ? calcReading(p, r) : null;
      return [r.pointId, r.time.replace('T', ' '), r.elevation, r.distance, r.designChange, r.designBasis, VAL[r.validity], r.surveyor, r.note, roundName(r.roundId),
        r.reviewer, r.reviewedAt.replace('T', ' '), p?.baseDistance ?? '', c?.raw == null ? '' : fmt(c.raw, 1), c?.corrected == null ? '' : fmt(c.corrected, 1),
        c?.component == null ? '不输出' : c.axis, c?.component == null ? '' : fmt(c.component, 1)];
    }),
  ]);
}

/** 读数：点号, 观测时间, 观测标高(m), 本次距离(mm), 设计修正(mm，可空), 修正依据, 有效状态, 测量人员, 备注 */
export function importDistReadings(text: string, points: DistPoint[], roundId: string | null): ImportResult<DistReading> {
  const rows = parseDelimited(text);
  const items: DistReading[] = [];
  const messages: string[] = [];
  rows.forEach((row, i) => {
    if (i === 0 && (row[2] ?? '') !== '' && !/^[+\-−]?\d/.test(row[2])) return; // 表头
    const pid = (row[0] ?? '').trim();
    if (!points.some((p) => p.id === pid)) { messages.push(`第 ${i + 1} 行：点号 “${pid}” 不存在，未导入（有效点号：${points.map((p) => p.id).join('、')}）`); return; }
    const flags: string[] = [];
    const e = parseNum(row[2], 'm', '观测标高'), dist = parseNum(row[3], 'mm', '本次距离'), des = parseNum(row[4], 'mm', '设计修正');
    for (const x of [e, dist, des]) if (x.flag) flags.push(x.flag);
    if (des.value === 0 && !(row[5] ?? '').trim()) flags.push('设计修正为 0 但未注明依据，请核对');
    if (flags.length) messages.push(`第 ${i + 1} 行：${flags.join('；')}`);
    const v = (row[6] ?? '').trim();
    const validity: Validity = v === '存疑' ? 'doubtful' : v === '无效' ? 'invalid' : 'valid';
    items.push({
      id: uid(), pointId: pid, roundId, time: normTime(row[1] ?? ''), elevation: e.value, distance: dist.value, designChange: des.value,
      designBasis: row[5] ?? '', validity, surveyor: row[7] ?? '', reviewer: '', reviewedAt: '', note: [row[8] ?? '', ...flags].filter(Boolean).join('；'),
    });
  });
  return { items, messages };
}

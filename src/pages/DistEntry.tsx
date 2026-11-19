/**
 * 八点单点录入（手机一屏）：自动显示该点基准资料；输入本次标高与距离；
 * 保存前以“基准值 → 本次值 → 差值 → 修正值 → 方向”核对。不沿用上次读数，空白不视为 0。
 */
import { useEffect, useState } from 'react';
import type { DistReading, Validity } from '../model/distTypes';
import { SIDE_FULL, calcReading, defaultDesignChange, describeDrawing } from '../calc/distance';
import { positionLabel } from '../calc/layout';
import { fmt, fmtSigned } from '../calc/direction';
import { uid } from '../calc/csv';
import { nowLocal, toNum } from '../components/ui';
import { keepVisible } from './EntryPage';
import { CalcChain, statusOf } from './distShared';
import type { Ctx } from './ctx';

interface Form { time: string; elevation: string; distance: string; designMode: 'auto' | 'manual'; design: string; designBasis: string; validity: Validity; surveyor: string; note: string }

const VALIDITY_TEXT: Record<Validity, string> = { valid: '有效', doubtful: '存疑', invalid: '无效' };

export function DistEntry({ ctx, pointId, roundId, recId }: { ctx: Ctx; pointId: string; roundId: string | null; recId: string | null }) {
  const d = ctx.data;
  const point = d.distPoints.find((p) => p.id === pointId);
  const existing = recId ? d.distReadings.find((r) => r.id === recId) ?? null : null;
  const dk = `silo-draft:dist:${roundId ?? '-'}:${pointId}:${recId ?? 'new'}`;
  const initial = (): Form => {
    try { const s = localStorage.getItem(dk); if (s) return JSON.parse(s) as Form; } catch { /* ignore */ }
    if (existing) return {
      time: existing.time, elevation: existing.elevation === null ? '' : String(existing.elevation), distance: existing.distance === null ? '' : String(existing.distance),
      designMode: 'manual', design: existing.designChange === null ? '' : String(existing.designChange), designBasis: existing.designBasis,
      validity: existing.validity, surveyor: existing.surveyor, note: existing.note,
    };
    return { time: nowLocal(), elevation: '', distance: '', designMode: 'auto', design: '', designBasis: '', validity: 'valid', surveyor: localStorage.getItem('silo-ui:surveyor') ?? '', note: '' };
  };
  const [f, setF] = useState<Form>(initial);
  const [restored] = useState(() => !!localStorage.getItem(dk));
  const [touched, setTouched] = useState(false);
  const set = (patch: Partial<Form>) => { setTouched(true); setF((p) => ({ ...p, ...patch })); };
  useEffect(() => { if (touched) try { localStorage.setItem(dk, JSON.stringify(f)); } catch { /* ignore */ } }, [f, dk, touched]);

  if (!point) return <div className="page narrow"><p>点号 “{pointId}” 不存在。有效点号：{d.distPoints.map((p) => p.id).join('、')}</p></div>;
  const silo = d.silos.find((s) => s.id === point.siloId);
  const e = toNum(f.elevation), dist = toNum(f.distance), dm = toNum(f.design);
  const errors: string[] = [];
  if (e === null) errors.push('请填写本次观测标高');
  for (const [k, v] of [['观测标高', e], ['本次距离', dist], ['设计修正', dm]] as const) if (v !== null && Number.isNaN(v)) errors.push(`${k}不是有效数值`);
  const auto = defaultDesignChange(d.verticalWall, point.baseElevation, e !== null && !Number.isNaN(e) ? e : null);
  const designValue = f.designMode === 'auto' ? auto.value : dm !== null && !Number.isNaN(dm) ? dm : null;
  const designBasis = f.designMode === 'auto' ? auto.basis : f.designBasis;
  if (f.designMode === 'manual' && designValue === 0 && !f.designBasis.trim()) errors.push('手动将设计修正设为 0 时，请注明“设计仓壁位置不变”的依据');
  const rec: DistReading = {
    id: existing?.id ?? 'preview', pointId, roundId: existing?.roundId ?? roundId, time: f.time,
    elevation: e !== null && !Number.isNaN(e) ? e : null, distance: dist !== null && !Number.isNaN(dist) ? dist : null,
    designChange: designValue, designBasis, validity: f.validity, surveyor: f.surveyor, reviewer: '', reviewedAt: '', note: f.note,
    history: existing?.history, demo: existing?.demo,
  };
  const calc = calcReading(point, rec);
  const st = statusOf({ ...d, distReadings: [...d.distReadings.filter((r) => r.id !== rec.id), rec] }, point, rec);

  const save = () => {
    if (errors.length) { ctx.notify(errors.join('\n')); return; }
    if (rec.distance === null && !confirm('本次距离为空，保存后状态为“数据不完整”，不会按 0 计算。仍要保存吗？')) return;
    const now = new Date().toISOString();
    const history = existing ? [...(existing.history ?? []), { at: now, snapshot: (({ history: _h, ...x }) => x)(existing) }] : undefined;
    // 修改后需要重新复核签认
    const saved: DistReading = { ...rec, id: existing?.id ?? uid(), history };
    ctx.setData((dd) => ({ ...dd, distReadings: existing ? dd.distReadings.map((r) => (r.id === existing.id ? saved : r)) : [...dd.distReadings, saved] }));
    try { localStorage.removeItem(dk); localStorage.setItem('silo-ui:surveyor', f.surveyor); } catch { /* ignore */ }
    ctx.notify(`已保存 ${pointId}`);
    ctx.go(roundId ? `/dist?saved=${encodeURIComponent(pointId)}&round=${roundId}` : `/point/${encodeURIComponent(pointId)}`);
  };

  return (
    <div className="page entry">
      <header className="entry-head">
        <div>
          <div className="entry-silo">{point.id}</div>
          <div className="muted small">{point.siloId} 号仓{SIDE_FULL[point.side]}点｜{silo ? positionLabel(silo) : ''}{roundId ? ` · ${d.rounds.find((r) => r.id === roundId)?.name ?? ''}` : ''}{existing ? ' · 修改已保存记录' : ''}{restored ? ' · 已恢复草稿' : ''}</div>
        </div>
        <button type="button" onClick={() => ctx.go(roundId ? '/dist' : `/point/${encodeURIComponent(pointId)}`)}>返回</button>
      </header>

      <div className="base-card">
        <b>底部基准</b>（本点只与自己的基准比较）<br />
        基准线：{point.lineDesc || '未填写'}<br />
        基准标高 <b>{fmt(point.baseElevation, 2)} m</b>，基准距离 <b>{fmt(point.baseDistance, 1)} mm</b><br />
        基准关系：{point.baseConfirmed ? '已确认' : <span className="text-warn">未确认</span>}　方向规则：{point.directionConfirmed ? '已确认（基准线在仓壁外侧）' : <span className="text-warn">未确认，只显示原始差值</span>}
        {point.baseDistance === null && <div className="text-warn">底部基准距离缺失：可以保存原始读数，但不计算差值。</div>}
        <button type="button" style={{ marginTop: 6 }} onClick={() => { localStorage.setItem('silo-ui:point-tab', '"base"'); ctx.go(`/point/${encodeURIComponent(point.id)}`); }}>
          {point.baseDistance === null ? '填写底部基准' : '查看 / 修改底部基准'}
        </button>
      </div>

      <div className="entry-row">
        <label className="field"><span className="field-label">本次观测标高（m）</span>
          <span className="num-wrap"><input inputMode="decimal" value={f.elevation} onChange={(ev) => set({ elevation: ev.target.value })} onFocus={keepVisible} /><span className="unit">m</span></span></label>
        <label className="field"><span className="field-label">观测时间</span><input type="datetime-local" value={f.time} onChange={(ev) => set({ time: ev.target.value })} /></label>
      </div>
      <label className="field"><span className="field-label">本次距离：该标高仓壁至同一基准线（mm）</span>
        <span className="num-wrap"><input inputMode="decimal" value={f.distance} onChange={(ev) => set({ distance: ev.target.value })} onFocus={keepVisible} placeholder="空白不按 0 处理" /><span className="unit">mm</span></span></label>

      <div className="field">
        <span className="field-label">设计距离变化（该标高相对基准标高，mm）</span>
        <div className="seg">
          <button type="button" className={f.designMode === 'auto' ? 'active' : ''} onClick={() => set({ designMode: 'auto' })}>按确认的竖直仓壁</button>
          <button type="button" className={f.designMode === 'manual' ? 'active' : ''} onClick={() => set({ designMode: 'manual' })}>手动录入</button>
        </div>
        {f.designMode === 'auto' ? (
          <span className={'field-hint' + (auto.value === null ? ' warn' : '')}>
            {auto.value === 0 ? `设计修正 = 0：${auto.basis}` : e === null ? '先填写标高' : '该标高不在已确认的竖直仓壁范围内，请手动录入设计修正值'}
          </span>
        ) : (
          <>
            <span className="num-wrap"><input inputMode="decimal" value={f.design} onChange={(ev) => set({ design: ev.target.value })} onFocus={keepVisible} placeholder="未提供则不输出方向" /><span className="unit">mm</span></span>
            <input value={f.designBasis} onChange={(ev) => set({ designBasis: ev.target.value })} placeholder="依据，如 设计图 S-xx 第 x 条" style={{ marginTop: 6 }} />
          </>
        )}
      </div>

      <div className="field">
        <span className="field-label">读数有效状态</span>
        <div className="seg">
          {(Object.keys(VALIDITY_TEXT) as Validity[]).map((v) => <button key={v} type="button" className={f.validity === v ? 'active' : ''} onClick={() => set({ validity: v })}>{VALIDITY_TEXT[v]}</button>)}
        </div>
      </div>
      <div className="entry-row">
        <label className="field"><span className="field-label">测量人员</span><input value={f.surveyor} onChange={(ev) => set({ surveyor: ev.target.value })} /></label>
        <label className="field"><span className="field-label">备注</span><input value={f.note} onChange={(ev) => set({ note: ev.target.value })} /></label>
      </div>

      <h4>保存前核对</h4>
      <CalcChain ctx={ctx} point={point} reading={rec} />
      {st.reasons.length > 0 && <div className="recap-warn">保存后标记：{st.reasons.join('；')}</div>}
      <div className="entry-actions">
        <div className="recap">
          <div className="recap-text">{point.id}：{calc.raw === null ? '差值无法计算' : `差值 ${fmtSigned(calc.raw)} mm`}{calc.component !== null ? ` → ${describeDrawing(calc.axis, calc.component)}` : calc.raw !== null ? ' → 不输出方向' : ''}</div>
        </div>
        <div className="entry-btns">
          <button className="primary big" type="button" onClick={save}>保存{roundId ? '并返回清单' : ''}</button>
          <button type="button" onClick={() => { if (confirm('清空本页输入？')) { localStorage.removeItem(dk); setTouched(false); setF(initial()); } }}>清空</button>
        </div>
      </div>
      {existing && <p className="muted small">修改保存后，原记录进入修改历史，复核签认需重新进行。</p>}
    </div>
  );
}

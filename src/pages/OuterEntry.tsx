/**
 * 外侧垂准点一屏录入：同一仓的多个外侧测点一次录入，保存为同一组（groupId）。
 * 平移取各点径向分量；扭转由切向分量求出；两点扭转估计之差作为校核闭合差。
 */
import { useEffect, useState } from 'react';
import type { Cardinal, Dir, PlumbObs, SpotQuality } from '../model/types';
import { siloTitle } from '../calc/layout';
import { indicatorFlag, indicatorText } from '../calc/distance';
import { QUALITY_TEXT, measureFrom, measureReasons, previousMeasure } from '../calc/plumb';
import { cardinalLabel, describeOffset, fmt, fmtSigned } from '../calc/direction';
import { uid } from '../calc/csv';
import { nowLocal, toNum } from '../components/ui';
import { ReadingInput, HistoryList, keepVisible } from './EntryPage';
import type { Ctx } from './ctx';

interface Reading { qx: string; qxDir: Dir | null; qy: string; qyDir: Dir | null }
interface Form { time: string; elevation: string; readings: Record<string, Reading>; quality: SpotQuality; surveyor: string; note: string }

export function rotationText(deg: number | null): string {
  if (deg === null) return '扭转角无法解算';
  if (Math.abs(deg) < 0.0005) return '平台无扭转';
  return `平台扭转 ${Math.abs(deg).toFixed(3)}°（${deg > 0 ? '逆时针' : '顺时针'}，俯视）`;
}

export function OuterEntry({ ctx, siloId, roundId, groupId }: { ctx: Ctx; siloId: string; roundId: string | null; groupId: string | null }) {
  const { data, setData, labels: l } = ctx;
  const silo = data.silos.find((s) => s.id === siloId)!;
  const existing = groupId ? data.plumbObs.filter((o) => o.groupId === groupId) : [];
  const plates = data.points.filter((p) => p.siloId === siloId && p.type === 'outer-plumb' && (p.active || existing.some((o) => o.plateId === p.id)));
  const dk = `silo-draft:${roundId ?? '-'}:${siloId}:outer:${groupId ?? 'new'}`;

  const initial = (): Form => {
    try { const d = localStorage.getItem(dk); if (d) return JSON.parse(d) as Form; } catch { /* ignore */ }
    const readings: Record<string, Reading> = {};
    for (const p of plates) {
      const o = existing.find((x) => x.plateId === p.id);
      readings[p.id] = o
        ? { qx: o.qx === null ? '' : String(o.qx), qxDir: o.qxDir, qy: o.qy === null ? '' : String(o.qy), qyDir: o.qyDir }
        : { qx: '', qxDir: null, qy: '', qyDir: null };
    }
    const e0 = existing[0];
    return {
      time: e0?.time ?? nowLocal(), elevation: e0?.elevation == null ? '' : String(e0.elevation), readings,
      quality: e0?.quality ?? 'clear', surveyor: e0?.surveyor ?? localStorage.getItem('silo-ui:surveyor') ?? '', note: e0?.note ?? '',
    };
  };
  const [f, setF] = useState<Form>(initial);
  const [restored] = useState(() => !!localStorage.getItem(dk));
  const [touched, setTouched] = useState(false);
  const upd = (patch: Partial<Form>) => { setTouched(true); setF((p) => ({ ...p, ...patch })); };
  const updR = (id: string, patch: Partial<Reading>) => { setTouched(true); setF((p) => ({ ...p, readings: { ...p.readings, [id]: { ...p.readings[id], ...patch } } })); };
  useEffect(() => { if (touched) try { localStorage.setItem(dk, JSON.stringify(f)); } catch { /* ignore */ } }, [f, dk, touched]);

  const e = toNum(f.elevation);
  const errors: string[] = [];
  if (plates.length === 0) errors.push('该仓没有登记外侧垂准点，请先在“测点”页登记');
  if (e === null) errors.push('请填写平台标高');
  else if (Number.isNaN(e)) errors.push('平台标高不是有效数值');
  const gid = groupId ?? 'preview';
  const recs: PlumbObs[] = plates.map((p) => {
    const r = f.readings[p.id] ?? { qx: '', qxDir: null, qy: '', qyDir: null };
    const qx = toNum(r.qx), qy = toNum(r.qy);
    for (const [k, v, d] of [['X', qx, r.qxDir], ['Y', qy, r.qyDir]] as const) {
      if (v !== null && Number.isNaN(v)) errors.push(`${p.code} ${k} 读数不是有效数值`);
      else if (v !== null && v < 0) errors.push(`${p.code} ${k} 读数请填大小，用方向按钮选择方向`);
      else if (v !== null && d === null) errors.push(`请选择 ${p.code} 的 ${k} 读数方向`);
    }
    const old = existing.find((o) => o.plateId === p.id);
    const snap = old
      ? { bx: old.bx, by: old.by, bConfirmed: old.bConfirmed, side: old.side, radius: old.radius }
      : { bx: p.offsetX, by: p.offsetY, bConfirmed: p.offsetConfirmed, side: p.side ?? null, radius: p.radius ?? null };
    return {
      id: old?.id ?? 'preview-' + p.id, siloId, roundId: old?.roundId ?? roundId, time: f.time, elevation: e !== null && !Number.isNaN(e) ? e : null,
      plateId: p.id, kind: 'outer', groupId: gid, ...snap,
      qx: qx !== null && !Number.isNaN(qx) && qx >= 0 ? qx : null, qxDir: qx === null ? null : r.qxDir,
      qy: qy !== null && !Number.isNaN(qy) && qy >= 0 ? qy : null, qyDir: qy === null ? null : r.qyDir,
      quality: f.quality, surveyor: f.surveyor, note: f.note, history: old?.history, demo: old?.demo,
    };
  });
  const m = recs.length ? measureFrom(recs) : null;
  const sol = m?.outer;
  const others = data.plumbObs.filter((o) => !(groupId && o.groupId === groupId));
  const prev = m ? previousMeasure([...others, ...recs], m) : null;
  const reasons = m ? measureReasons(m, prev, data.config.jumpThresholdMm, [silo.elevMin, silo.elevMax], data.config.outerResidualMm ?? 3).filter((r) => !r.startsWith('缺少平台标高')) : [];
  const recap = !m || (m.x === null && m.y === null)
    ? (m?.basePending ? `${siloId} 号仓：测站或测点未确认（基准待确认），只保存原始读数` : `${siloId} 号仓：尚未录入可解算的读数`)
    : `${siloId} 号仓平台中心${describeOffset(m.x, m.y, l, 1)}；${rotationText(m.rotationDeg)}`;

  const save = () => {
    if (errors.length) { ctx.notify(errors.join('\n')); return; }
    const g = groupId ?? uid();
    const now = new Date().toISOString();
    const saved = recs.map((r) => {
      const old = existing.find((o) => o.id === r.id);
      const history = old ? [...(old.history ?? []), { at: now, snapshot: (({ history: _h, ...x }) => x)(old) }] : undefined;
      return { ...r, id: old?.id ?? uid(), groupId: g, history };
    });
    setData((d) => ({ ...d, plumbObs: [...d.plumbObs.filter((o) => !(groupId && o.groupId === groupId)), ...saved] }));
    try { localStorage.removeItem(dk); localStorage.setItem('silo-ui:surveyor', f.surveyor); } catch { /* ignore */ }
    ctx.notify(`已保存：${recap}`);
    ctx.go(roundId ? `/round?saved=${siloId}` : `/silo/${siloId}`);
  };

  return (
    <div className="page entry">
      <header className="entry-head">
        <div>
          <div className="entry-silo">{siloTitle(silo)}</div>
          <div className="muted small">外侧垂准点 {plates.length} 个 · {data.rounds.find((r) => r.id === roundId)?.name ?? '不属于任何轮次'}{groupId ? ' · 修改已保存记录' : ''}{restored ? ' · 已恢复未保存草稿' : ''}</div>
        </div>
        <button type="button" onClick={() => ctx.go(roundId ? '/round' : `/silo/${siloId}`)}>返回</button>
      </header>

      <div className="entry-row">
        <label className="field">
          <span className="field-label">平台标高（m）</span>
          <span className="num-wrap"><input inputMode="decimal" value={f.elevation} onChange={(ev) => upd({ elevation: ev.target.value })} onFocus={keepVisible} /><span className="unit">m</span></span>
        </label>
        <label className="field"><span className="field-label">观测时间</span><input type="datetime-local" value={f.time} onChange={(ev) => upd({ time: ev.target.value })} /></label>
      </div>
      <p className="muted small">每个测点：读光斑相对投影板刻度原点的位置，填大小，再点光斑所在方向。没读到的方向留空，不会按 0 处理。</p>

      {plates.map((p) => {
        const r = f.readings[p.id] ?? { qx: '', qxDir: null, qy: '', qyDir: null };
        const pi = sol?.points.find((x) => x.obs.plateId === p.id);
        const radialX = p.side === 'E' || p.side === 'W';
        return (
          <section key={p.id} className="outer-point">
            <div className="op-head">
              <b>{p.code}</b>
              <span className="muted small">{p.side ? cardinalLabel(p.side as Cardinal, l) + '侧' : ''} · r = {fmt(p.radius ?? null, 2)} m · e = ({fmtSigned(p.offsetX)}, {fmtSigned(p.offsetY)}){p.offsetConfirmed ? '' : ' · 未确认'}</span>
            </div>
            <ReadingInput axis="X" label={`${l.xName}${radialX ? '（径向，定平移）' : '（切向，含扭转）'}`} posName={l.posX} negName={l.negX}
              value={r.qx} dir={r.qxDir} onValue={(v) => updR(p.id, { qx: v })} onDir={(d) => updR(p.id, { qxDir: d })} />
            <ReadingInput axis="Y" label={`${l.yName}${!radialX ? '（径向，定平移）' : '（切向，含扭转）'}`} posName={l.posY} negName={l.negY}
              value={r.qy} dir={r.qyDir} onValue={(v) => updR(p.id, { qy: v })} onDir={(d) => updR(p.id, { qyDir: d })} />
            {pi && pi.resX !== null && pi.resY !== null && sol?.residualMax !== null && (
              <div className="muted small">该点残差 ({fmtSigned(pi.resX)}, {fmtSigned(pi.resY)}) mm</div>
            )}
          </section>
        );
      })}

      <div className="field">
        <span className="field-label">光斑状态</span>
        <div className="seg">
          {(Object.keys(QUALITY_TEXT) as SpotQuality[]).map((q) => (
            <button key={q} type="button" className={f.quality === q ? 'active' : ''} onClick={() => upd({ quality: q })}>{QUALITY_TEXT[q]}</button>
          ))}
        </div>
      </div>
      <div className="entry-row">
        <label className="field"><span className="field-label">测量人员</span><input value={f.surveyor} onChange={(ev) => upd({ surveyor: ev.target.value })} /></label>
        <label className="field"><span className="field-label">备注</span><input value={f.note} onChange={(ev) => upd({ note: ev.target.value })} /></label>
      </div>

      <div className="entry-actions">
        <div className="recap">
          <div className="calc small">
            {sol && sol.mode !== 'none' ? (
              <>平移取各点径向读数：{l.xName} {fmtSigned(m!.x)}，{l.yName} {fmtSigned(m!.y)} mm{m!.resultant !== null ? `，合成 ${fmt(m!.resultant)} mm` : ''}
                {sol.residualMax !== null ? `；两点校核闭合差 ${fmt(sol.residualMax)} mm` : ''}</>
            ) : '录入读数后显示解算过程'}
          </div>
          <div className="recap-text">{recap}</div>
          {m && !m.basePending && m.resultant !== null && <div className="muted small">{indicatorText('platform-center', indicatorFlag(data.indicators, 'platform-center', m.resultant, m.elevation), m.resultant)}</div>}
          {reasons.length > 0 && <div className="recap-warn">保存后标记：{reasons.join('；')}</div>}
        </div>
        <div className="entry-btns">
          <button className="primary big" type="button" onClick={save}>保存{roundId ? '并返回本轮' : ''}</button>
          <button type="button" onClick={() => { if (confirm('清空本页输入？')) { localStorage.removeItem(dk); setTouched(false); setF(initial()); } }}>清空</button>
        </div>
      </div>
      {existing.some((o) => o.history?.length) && (
        <details className="history">
          <summary>修改历史</summary>
          {existing.map((o) => <div key={o.id}><b className="small">{data.points.find((p) => p.id === o.plateId)?.code}</b><HistoryList obs={o} /></div>)}
        </details>
      )}
    </div>
  );
}

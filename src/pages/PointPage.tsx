/** 单点详情：原始距离—标高、修正后位移—标高、计算链、记录与复核签认、底部基准维护 */
import { useState } from 'react';
import type { DistPoint, DistReading } from '../model/distTypes';
import { SIDE_FULL, calcReading, describeDrawing } from '../calc/distance';
import { positionLabel } from '../calc/layout';
import { fmt, fmtSigned } from '../calc/direction';
import { ProfileChart, type PPoint } from '../charts/ProfileChart';
import type { TipHandler } from '../charts/tips';
import { ZoomPan } from '../components/ZoomPan';
import { useLocalState } from '../components/useLocalState';
import { Field, numStr, toNum } from '../components/ui';
import { CalcChain, statusOf } from './distShared';
import { POINT_STATUS_TEXT } from '../calc/distance';
import type { Ctx } from './ctx';
import { tm } from './ctx';

type Tab = 'raw' | 'disp' | 'records' | 'base';

export function signReview(ctx: Ctx, kind: 'reading' | 'point', id: string) {
  const name = prompt('复核人员姓名（签认表示已人工核对原始记录与计算）', localStorage.getItem('silo-ui:reviewer') ?? '');
  if (!name || !name.trim()) return;
  localStorage.setItem('silo-ui:reviewer', name.trim());
  const at = new Date().toISOString().slice(0, 16);
  ctx.setData((d) => kind === 'reading'
    ? { ...d, distReadings: d.distReadings.map((r) => (r.id === id ? { ...r, reviewer: name.trim(), reviewedAt: at } : r)) }
    : { ...d, distPoints: d.distPoints.map((p) => (p.id === id ? { ...p, reviewer: name.trim(), reviewedAt: at } : p)) });
  ctx.notify(`已签认：${name.trim()}`);
}

export function PointPage({ ctx, pointId, onTip }: { ctx: Ctx; pointId: string; onTip: TipHandler }) {
  const d = ctx.data;
  const point = d.distPoints.find((p) => p.id === pointId);
  const [tab, setTab] = useLocalState<Tab>('point-tab', 'raw');
  const [selId, setSelId] = useState<string | null>(null);
  if (!point) return <div className="page narrow"><p>点号 “{pointId}” 不存在。</p></div>;
  const silo = d.silos.find((s) => s.id === point.siloId);
  const list = d.distReadings.filter((r) => r.pointId === point.id).sort((a, b) => b.time.localeCompare(a.time));
  const sel = list.find((r) => r.id === selId) ?? list[0] ?? null;
  const axis = point.side === 'left' || point.side === 'right' ? 'u' : 'v';
  const neg = axis === 'u' ? '图纸左' : '图纸下', pos = axis === 'u' ? '图纸右' : '图纸上';

  const tipOf = (r: DistReading) => {
    const c = calcReading(point, r);
    return {
      title: `${point.id} · ${fmt(r.elevation, 2)} m`,
      rows: [['时间', tm(r.time)], ['本次距离', `${fmt(r.distance, 1)} mm`], ['基准距离', `${fmt(point.baseDistance, 1)} mm`], ['差值', c.raw === null ? '—' : `${fmtSigned(c.raw)} mm`],
        ['设计修正', c.design === null ? '未提供' : `${fmtSigned(c.design)} mm`], ['修正后', c.corrected === null ? '—' : `${fmtSigned(c.corrected)} mm`],
        ['方向分量', c.component === null ? '不输出' : `${c.axis} ${fmtSigned(c.component)} mm，${describeDrawing(c.axis, c.component)}`]] as [string, string][],
    };
  };
  const series = (r: DistReading) => r.time.slice(0, 10);
  const rawPts: PPoint[] = list.filter((r) => r.distance !== null && r.elevation !== null).map((r) => ({
    id: r.id, selectKey: r.id, elevation: r.elevation as number, value: r.distance as number, series: series(r), level: 'none', tip: tipOf(r), hollow: r.validity !== 'valid',
  }));
  if (point.baseDistance !== null && point.baseElevation !== null)
    rawPts.push({ id: 'base', selectKey: 'base', elevation: point.baseElevation, value: point.baseDistance, series: '底部基准', level: 'none', hollow: true,
      tip: { title: `${point.id} 底部基准`, rows: [['基准标高', `${fmt(point.baseElevation, 2)} m`], ['基准距离', `${fmt(point.baseDistance, 1)} mm`]] } });
  const vals = rawPts.map((q) => q.value);
  const c0 = point.baseDistance ?? (vals.length ? vals[0] : 0);
  const span = Math.max(5, ...vals.map((v) => Math.abs(v - c0))) * 1.25;
  const dispPts: PPoint[] = list.map((r) => ({ r, c: calcReading(point, r) })).filter((x) => x.c.component !== null && x.r.elevation !== null).map(({ r, c }) => ({
    id: r.id, selectKey: r.id, elevation: r.elevation as number, value: c.component as number, series: series(r), level: 'none', tip: tipOf(r), hollow: r.validity !== 'valid',
  }));
  const allSeries = [...new Set([...rawPts, ...dispPts].map((q) => q.series))];
  const height = silo?.elevMax ?? d.config.wallHeight;

  return (
    <div className="page">
      <header className="silo-head">
        <div>
          <div className="silo-title">{point.id}</div>
          <div className="muted small">{point.siloId} 号仓{SIDE_FULL[point.side]}点｜{silo ? positionLabel(silo) : ''} · 分量方向 {axis}（{axis === 'u' ? '向右为正' : '向上为正'}）</div>
        </div>
        <div className="row gap wrap">
          <button className="primary" type="button" onClick={() => ctx.go(`/dentry/${encodeURIComponent(point.id)}`)}>录入本点</button>
        </div>
      </header>
      <div className="toolbar">
        <div className="seg only-mobile">
          {([['raw', '原始距离'], ['disp', '修正后位移'], ['records', '记录'], ['base', '底部基准']] as [Tab, string][]).map(([k, n]) => (
            <button key={k} type="button" className={tab === k ? 'active' : ''} onClick={() => setTab(k)}>{n}</button>
          ))}
        </div>
      </div>
      <div className={'silo-grid point-grid tab-' + tab}>
        <section className="chart-box sg-raw">
          <ZoomPan>
            <ProfileChart title="原始距离—标高" subtitle={`${point.id} · 仓壁至基准线距离；蓝线为底部基准距离`} points={rawPts} wallHeight={height}
              negLabel="距离减小" posLabel="距离增大" zeroLabel={`基准 ${fmt(point.baseDistance, 1)}`} domain={[c0 - span, c0 + span]} refValue={c0}
              emptyText={rawPts.length ? null : '暂无距离读数'} selectedKey={sel?.id ?? null} onSelect={(k) => k !== 'base' && setSelId(k)} onTip={onTip}
              labelSeries={allSeries} footnote="空心点：底部基准或非“有效”读数；连线仅为趋势示意" />
          </ZoomPan>
        </section>
        <section className="chart-box sg-disp">
          <ZoomPan>
            <ProfileChart title={`修正后位移（${axis} 分量）—标高`} subtitle={`${point.id} · 已扣除设计修正；${axis === 'u' ? '向右为正' : '向上为正'}`} points={dispPts} wallHeight={height}
              negLabel={neg} posLabel={pos} zeroLabel="0" emptyText={dispPts.length ? null : point.directionConfirmed && point.baseConfirmed ? '缺少设计修正值或有效读数' : '方向规则或基准关系未确认，不绘制方向位移'}
              selectedKey={sel?.id ?? null} onSelect={setSelId} onTip={onTip} labelSeries={allSeries} footnote="相邻点连线仅用于观察趋势，不代表其间标高已实测" />
          </ZoomPan>
        </section>
        <section className="sg-records">
          <h3>计算链（{sel ? `${fmt(sel.elevation, 2)} m · ${tm(sel.time)}` : '无记录'}）</h3>
          <CalcChain ctx={ctx} point={point} reading={sel} />
          <h3>观测记录（{list.length}）</h3>
          <ReadingTable ctx={ctx} point={point} list={list} selId={sel?.id ?? null} onSel={setSelId} />
        </section>
        <section className="sg-base">
          <BaseForm key={JSON.stringify(point)} ctx={ctx} point={point} />
        </section>
      </div>
    </div>
  );
}

function ReadingTable({ ctx, point, list, selId, onSel }: { ctx: Ctx; point: DistPoint; list: DistReading[]; selId: string | null; onSel: (id: string) => void }) {
  const d = ctx.data;
  return (
    <div className="table-wrap tall">
      <table className="data-table">
        <thead><tr><th>时间 / 轮次</th><th>标高 m</th><th>本次 mm</th><th>差值</th><th>设计修正</th><th>修正后</th><th>方向分量</th><th>状态</th><th>测量 / 复核</th><th></th></tr></thead>
        <tbody>
          {list.map((r) => {
            const c = calcReading(point, r);
            const st = statusOf(d, point, r);
            return (
              <tr key={r.id} className={r.id === selId ? 'hl' : ''} onClick={() => onSel(r.id)}>
                <td>{tm(r.time)}{r.demo && <span className="demo-tag">演示</span>}<br /><span className="muted small">{d.rounds.find((x) => x.id === r.roundId)?.name ?? ''}</span></td>
                <td>{fmt(r.elevation, 2)}</td>
                <td>{r.distance === null ? '空白' : fmt(r.distance, 1)}</td>
                <td>{c.raw === null ? '—' : fmtSigned(c.raw)}</td>
                <td>{c.design === null ? '未提供' : fmtSigned(c.design)}</td>
                <td>{c.corrected === null ? '—' : fmtSigned(c.corrected)}</td>
                <td>{c.component === null ? '不输出' : `${c.axis} ${fmtSigned(c.component)}`}</td>
                <td className="small">{POINT_STATUS_TEXT[st.status]}{r.validity !== 'valid' ? `（${r.validity === 'doubtful' ? '存疑' : '无效'}）` : ''}</td>
                <td className="small">{r.surveyor || '—'}<br />{r.reviewer ? `${r.reviewer} ${tm(r.reviewedAt)}` : <span className="text-warn">未签认</span>}
                  {r.history?.length ? <details><summary>历史 {r.history.length}</summary>{r.history.slice().reverse().map((h, i) => (
                    <div key={i}>{new Date(h.at).toLocaleString()} 前：{fmt(h.snapshot.elevation, 2)} m，{h.snapshot.distance ?? '空白'} mm，修正 {h.snapshot.designChange ?? '未提供'}</div>))}</details> : null}</td>
                <td className="nowrap">
                  <button className="link" type="button" onClick={(e) => { e.stopPropagation(); ctx.go(`/dentry/${encodeURIComponent(point.id)}?rec=${r.id}${r.roundId ? '&round=' + r.roundId : ''}`); }}>修改</button>
                  <button className="link" type="button" onClick={(e) => { e.stopPropagation(); signReview(ctx, 'reading', r.id); }}>复核签认</button>
                </td>
              </tr>
            );
          })}
          {list.length === 0 && <tr><td colSpan={10} className="muted center">暂无记录</td></tr>}
        </tbody>
      </table>
    </div>
  );
}

function BaseForm({ ctx, point }: { ctx: Ctx; point: DistPoint }) {
  const [f, setF] = useState({
    baseElevation: numStr(point.baseElevation), baseDistance: numStr(point.baseDistance), lineDesc: point.lineDesc,
    baseConfirmed: point.baseConfirmed, directionConfirmed: point.directionConfirmed, surveyor: point.surveyor, note: point.note,
  });
  const rule = { left: '距离增大 → 仓壁向图纸右（u 为正）', right: '距离增大 → 仓壁向图纸左（u 为负）', up: '距离增大 → 仓壁向图纸下（v 为负）', down: '距离增大 → 仓壁向图纸上（v 为正）' }[point.side];
  const save = () => {
    const e = toNum(f.baseElevation), dist = toNum(f.baseDistance);
    if ([e, dist].some((v) => v !== null && Number.isNaN(v))) return ctx.notify('数值格式有误');
    if (f.baseConfirmed && (e === null || dist === null)) return ctx.notify('确认基准关系前，请填写基准标高与基准距离');
    const now = new Date().toISOString();
    ctx.setData((d) => ({
      ...d, distPoints: d.distPoints.map((p) => p.id !== point.id ? p : {
        ...p, baseElevation: e, baseDistance: dist, lineDesc: f.lineDesc, baseConfirmed: f.baseConfirmed, directionConfirmed: f.directionConfirmed,
        surveyor: f.surveyor, note: f.note, reviewer: '', reviewedAt: '', demo: false, // 用户填写后即为正式数据，参与同步
        history: [...(p.history ?? []), { at: now, snapshot: (({ history: _h, ...x }) => x)(p) }],
      }),
    }));
    ctx.notify('底部基准已保存（原记录进入修改历史，需重新复核签认；该点全部差值将按新基准重新计算）');
  };
  return (
    <div className="card-panel">
      <h3>底部基准记录 · {point.id}</h3>
      <div className="form-grid">
        <Field label="基准标高 (m)"><input inputMode="decimal" value={f.baseElevation} onChange={(e) => setF({ ...f, baseElevation: e.target.value })} /></Field>
        <Field label="底部仓壁至基准线距离 (mm)"><input inputMode="decimal" value={f.baseDistance} onChange={(e) => setF({ ...f, baseDistance: e.target.value })} /></Field>
        <Field label="基准线说明" wide><input value={f.lineDesc} onChange={(e) => setF({ ...f, lineDesc: e.target.value })} placeholder="如 16 号仓上侧仓壁外侧铅垂基准线" /></Field>
        <label className="field wide check-row"><input type="checkbox" checked={f.baseConfirmed} onChange={(e) => setF({ ...f, baseConfirmed: e.target.checked })} />基准关系已确认（底部基准读数与基准线设置已复核）</label>
        <label className="field wide check-row"><input type="checkbox" checked={f.directionConfirmed} onChange={(e) => setF({ ...f, directionConfirmed: e.target.checked })} />
          基准线位于该仓壁外侧，读数为“仓壁至基准线距离”，方向规则适用：{rule}</label>
        <Field label="测量人员"><input value={f.surveyor} onChange={(e) => setF({ ...f, surveyor: e.target.value })} /></Field>
        <Field label="备注"><input value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} /></Field>
      </div>
      <div className="row gap wrap">
        <button className="primary" type="button" onClick={save}>保存基准</button>
        <button type="button" onClick={() => signReview(ctx, 'point', point.id)}>基准复核签认</button>
      </div>
      <p className="review-line">复核：{point.reviewer ? `${point.reviewer}（${tm(point.reviewedAt)}）` : '未签认'}　修改历史 {point.history?.length ?? 0} 条</p>
      {point.history?.length ? (
        <details className="small"><summary>基准修改历史</summary>
          {point.history.slice().reverse().map((h, i) => <div key={i}>{new Date(h.at).toLocaleString()} 前：{fmt(h.snapshot.baseElevation, 2)} m / {fmt(h.snapshot.baseDistance, 1)} mm，{h.snapshot.baseConfirmed ? '已确认' : '未确认'}</div>)}
        </details>
      ) : null}
      <p className="muted small">若现场基准线在仓壁内侧或读数定义不同，请勿勾选方向规则确认；系统将只显示原始差值。</p>
    </div>
  );
}

/**
 * 单仓详情：平台平面图、X/Y 立面图（平台偏移与成型仓壁偏移分色叠加）、观测记录与原始读数。
 * 页头固定显示仓号及其在九仓中的位置。手机端分标签，平板/电脑并排。
 */
import { useState } from 'react';
import type { CenterObs, PlumbObs } from '../model/types';
import { siloTitle } from '../calc/layout';
import { QUALITY_TEXT, measureReasons, measures, platformCenters, previousMeasure, type PlatformMeasure } from '../calc/plumb';
import { OuterPlan } from '../charts/OuterPlan';
import { rotationText } from './OuterEntry';
import { allCenters } from '../calc/center';
import { describeOffset, fmt, fmtSigned } from '../calc/direction';
import { indicatorFlag, indicatorText } from '../calc/distance';
import { PlatformPlan } from '../charts/PlatformPlan';
import { ProfileChart, type PPoint } from '../charts/ProfileChart';
import { obsTip, type Tip, type TipHandler } from '../charts/tips';
import { ZoomPan } from '../components/ZoomPan';
import { useLocalState } from '../components/useLocalState';
import { HistoryList } from './EntryPage';
import type { Ctx } from './ctx';
import { tm } from './ctx';

type Tab = 'plan' | 'x' | 'y' | 'records';

export function SiloPage({ ctx, siloId, onTip }: { ctx: Ctx; siloId: string; onTip: TipHandler }) {
  const { data, labels: l } = ctx;
  const silo = data.silos.find((s) => s.id === siloId);
  const [tab, setTab] = useLocalState<Tab>('silo-tab', 'plan');
  const [mag, setMag] = useLocalState<number>('silo-mag', 100);
  const [selId, setSelId] = useState<string | null>(null);
  const [showWall, setShowWall] = useLocalState<boolean>('silo-wall', true);
  if (!silo) return <div className="page narrow"><p>仓号 “{siloId}” 不属于本组筒仓。</p></div>;

  const mine = data.plumbObs.filter((o) => o.siloId === siloId);
  const ms = measures(mine).sort((a, b) => b.time.localeCompare(a.time) || (b.elevation ?? 0) - (a.elevation ?? 0));
  const sel = ms.find((m) => m.id === selId) ?? ms[0] ?? null;
  const codeOf = (id: string) => data.points.find((p) => p.id === id)?.code ?? '?';
  const pObs = platformCenters(mine);
  const wObs = allCenters(data.centerRecords, data.lines, data.readings).filter((o) => o.siloId === siloId);
  const plates = new Map(data.points.map((p) => [p.id, p]));

  const tipFor = (o: CenterObs): Tip => {
    if (o.source !== 'P') return { ...obsTip(o, l), title: `成型仓壁偏移 · ${obsTip(o, l).title}` };
    const m = ms.find((x) => 'P:' + x.id === o.key)!;
    const rows: [string, string][] = [['观测时间', tm(m.time)], ['测量方式', m.kind === 'outer' ? `外侧垂准点 ${m.records.length} 点` : '中心垂准仪']];
    if (m.kind === 'center') {
      const r = m.center!, rec = m.records[0];
      rows.push(['投影板', plates.get(rec.plateId)?.code ?? ''], ['原始读数 q', `(${fmtSigned(r.qx)}, ${fmtSigned(r.qy)}) mm`],
        ['固定偏置 b', `(${fmtSigned(r.bx)}, ${fmtSigned(r.by)}) mm${rec.bConfirmed ? '' : '（未确认）'}`],
        ['平台中心 −(q+b)', r.basePending ? '基准待确认' : `(${fmtSigned(r.x)}, ${fmtSigned(r.y)}) mm`]);
    } else {
      for (const p of m.outer!.points) rows.push([codeOf(p.obs.plateId), `读数 (${fmtSigned(p.qx)}, ${fmtSigned(p.qy)})，测点位移 (${fmtSigned(p.wx)}, ${fmtSigned(p.wy)}) mm`]);
      rows.push(['平台平移', m.basePending ? '基准待确认' : `(${fmtSigned(m.x)}, ${fmtSigned(m.y)}) mm`], ['扭转', rotationText(m.rotationDeg)]);
      if (m.residual !== null) rows.push(['校核闭合差', `${fmt(m.residual)} mm`]);
    }
    rows.push(['合成', m.resultant === null || m.basePending ? '不计算' : `${fmt(m.resultant)} mm`], ['光斑状态', [...new Set(m.records.map((r) => QUALITY_TEXT[r.quality]))].join('、')]);
    const note = m.records.map((r) => r.note).filter(Boolean).join('；');
    if (note) rows.push(['备注', note]);
    return { title: `平台偏移 · ${siloId} 号仓 ${fmt(o.elevation, 2)} m`, rows };
  };
  const pts = (axis: 'x' | 'y'): PPoint[] => [
    ...pObs.filter((o) => o[axis] !== null).map((o) => ({
      id: o.key + axis, selectKey: o.key, elevation: o.elevation, value: o[axis] as number, series: 'P',
      variant: 'platform' as const, level: indicatorFlag(data.indicators, 'platform-center', o.resultant, o.elevation).level, tip: tipFor(o),
    })),
    ...(showWall ? wObs.filter((o) => o[axis] !== null).map((o) => ({
      id: o.key + axis, selectKey: o.key, elevation: o.elevation, value: o[axis] as number, series: 'W' + o.session,
      variant: 'wall' as const, level: 'none' as const, tip: tipFor(o),
    })) : []),
  ];
  const xp = pts('x'), yp = pts('y');
  const th = null; // 指标针对合成偏移，不在单向立面图上画阈值线
  const select = (key: string) => { if (key.startsWith('P:')) setSelId(key.slice(2)); };
  const empty = (axis: 'X' | 'Y', list: PPoint[]) => (list.length ? null : `该仓没有可用的 ${axis === 'X' ? l.xName : l.yName} 方向平台偏移${showWall ? '或仓壁偏移' : ''}数据`);

  return (
    <div className="page">
      <header className="silo-head">
        <div>
          <div className="silo-title">{siloTitle(silo)}</div>
          <div className="muted small">外径 {silo.outerDiameter} m / 内径 {silo.innerDiameter} m · 观测标高 {silo.elevMin}～{silo.elevMax} m
            {silo.centerX !== null && silo.centerY !== null ? ` · 设计中心 (${silo.centerX}, ${silo.centerY})` : ' · 设计中心坐标未配置'}</div>
        </div>
        <div className="row gap wrap">
          <button className="primary" type="button" onClick={() => ctx.go(`/entry/${siloId}`)}>录入本仓</button>
          <button type="button" onClick={() => ctx.go(`/wall/${siloId}`)}>仓壁数据</button>
          <button type="button" onClick={() => ctx.go(`/points/${siloId}`)}>测点</button>
        </div>
      </header>

      <div className="toolbar">
        <div className="seg only-mobile">
          {([['plan', '平面'], ['x', `${l.xName} 立面`], ['y', `${l.yName} 立面`], ['records', '记录']] as [Tab, string][]).map(([k, n]) => (
            <button key={k} type="button" className={tab === k ? 'active' : ''} onClick={() => setTab(k)}>{n}</button>
          ))}
        </div>
        <label>记录
          <select value={sel?.id ?? ''} onChange={(e) => setSelId(e.target.value)}>
            {ms.map((m) => <option key={m.id} value={m.id}>{fmt(m.elevation, 2)} m · {tm(m.time)}{m.kind === 'outer' ? ' · 外侧' : ''}</option>)}
            {ms.length === 0 && <option value="">无垂准仪记录</option>}
          </select>
        </label>
        <div className="mag">放大
          {[50, 100, 200].map((m) => <button key={m} type="button" className={mag === m ? 'active' : ''} onClick={() => setMag(m)}>{m}×</button>)}
          <input type="range" min={1} max={400} value={mag} onChange={(e) => setMag(Number(e.target.value))} aria-label="放大倍数" />
          <b>{mag}×</b>
        </div>
        <label className="check"><input type="checkbox" checked={showWall} onChange={(e) => setShowWall(e.target.checked)} />叠加成型仓壁偏移</label>
      </div>

      <div className={'silo-grid tab-' + tab}>
        <section className="chart-box sg-plan">
          <ZoomPan>
            {sel?.kind === 'outer' || (!sel && data.points.some((p) => p.siloId === siloId && p.type === 'outer-plumb'))
              ? <OuterPlan silo={silo} labels={l} showNorth={ctx.showNorth} northAngleDeg={data.config.northAngleDeg} measure={sel} mag={mag} codeOf={codeOf} />
              : <PlatformPlan silo={silo} labels={l} showNorth={ctx.showNorth} northAngleDeg={data.config.northAngleDeg} obs={sel?.records[0] ?? null} mag={mag}
                points={data.points.filter((p) => p.siloId === siloId)} />}
          </ZoomPan>
        </section>
        <section className="chart-box sg-x">
          <ZoomPan>
            <ProfileChart title={`${l.xName} 偏移—标高（${l.negX}—${l.posX}）`} subtitle={`${siloId} 号仓 · 平台偏移${showWall ? ' 与 成型仓壁偏移（分色）' : ''}`}
              points={xp} wallHeight={silo.elevMax} negLabel={l.negX} posLabel={l.posX} zeroLabel="设计轴线 0" thresholds={th}
              emptyText={empty('X', xp)} selectedKey={sel ? 'P:' + sel.id : null} onSelect={select} onTip={onTip} labelSeries={['P']} />
          </ZoomPan>
        </section>
        <section className="chart-box sg-y">
          <ZoomPan>
            <ProfileChart title={`${l.yName} 偏移—标高（${l.negY}—${l.posY}）`} subtitle={`${siloId} 号仓 · 平台偏移${showWall ? ' 与 成型仓壁偏移（分色）' : ''}`}
              points={yp} wallHeight={silo.elevMax} negLabel={l.negY} posLabel={l.posY} zeroLabel="设计轴线 0" thresholds={th}
              emptyText={empty('Y', yp)} selectedKey={sel ? 'P:' + sel.id : null} onSelect={select} onTip={onTip} labelSeries={['P']} />
          </ZoomPan>
        </section>
        <section className="sg-records">
          <h3>垂准仪观测记录与原始读数（{ms.length} 次观测）</h3>
          <RecordTable ctx={ctx} list={ms} selId={sel?.id ?? null} onSel={setSelId} />
          <p className="muted small">“平台偏移”为滑模平台中心相对设计中心（垂准仪），“成型仓壁偏移”为已浇筑仓壁截面中心（仓壁数据），两者分别保存、分别计算。</p>
        </section>
      </div>
    </div>
  );
}

function RecordTable({ ctx, list, selId, onSel }: { ctx: Ctx; list: PlatformMeasure[]; selId: string | null; onSel: (id: string) => void }) {
  const { data, labels: l } = ctx;
  const plates = new Map(data.points.map((p) => [p.id, p]));
  const silo = data.silos.find((s) => s.id === list[0]?.siloId);
  const dirName = (d: PlumbObs['qxDir'], axis: 'X' | 'Y') => (d === null ? '' : axis === 'X' ? (d === 'pos' ? l.posX : l.negX) : d === 'pos' ? l.posY : l.negY);
  const rd = (o: PlumbObs) => `${o.qx === null ? '未读' : o.qx + ' ' + dirName(o.qxDir, 'X')} / ${o.qy === null ? '未读' : o.qy + ' ' + dirName(o.qyDir, 'Y')}`;
  return (
    <div className="table-wrap tall">
      <table className="data-table">
        <thead>
          <tr><th>时间</th><th>标高 m</th><th>测点 / 投影板</th><th>{l.xName} / {l.yName} 读数</th><th>偏置 b / 测站 e</th><th>平台中心</th><th>合成</th><th>扭转 / 闭合差</th><th>状态</th><th></th></tr>
        </thead>
        <tbody>
          {list.map((m) => {
            const reasons = measureReasons(m, previousMeasure(data.plumbObs, m), data.config.jumpThresholdMm, silo ? [silo.elevMin, silo.elevMax] : undefined, data.config.outerResidualMm ?? 3);
            const round = data.rounds.find((x) => x.id === m.roundId);
            const first = m.records[0];
            const editHref = m.kind === 'outer'
              ? `/entry/${m.siloId}?group=${first.groupId}${m.roundId ? '&round=' + m.roundId : ''}`
              : `/entry/${m.siloId}?rec=${first.id}${m.roundId ? '&round=' + m.roundId : ''}`;
            return (
              <tr key={m.id} className={m.id === selId ? 'hl' : ''} onClick={() => onSel(m.id)}>
                <td>{tm(m.time)}{first.demo && <span className="demo-tag">演示</span>}<br /><span className="muted small">{round?.name ?? ''}</span></td>
                <td>{fmt(m.elevation, 2)}</td>
                <td>{m.records.map((o) => <div key={o.id}>{plates.get(o.plateId)?.code ?? '?'}</div>)}</td>
                <td>{m.records.map((o) => <div key={o.id}>{rd(o)}</div>)}</td>
                <td>{m.records.map((o) => <div key={o.id}>({fmtSigned(o.bx)}, {fmtSigned(o.by)}){o.bConfirmed ? '' : <span className="text-warn"> 未确认</span>}</div>)}</td>
                <td>{m.basePending ? <span className="text-warn">基准待确认</span> : describeOffset(m.x, m.y, l)}</td>
                <td>{m.resultant === null || m.basePending ? '—' : fmt(m.resultant)}</td>
                <td className="small">{m.kind === 'outer' ? <>{m.rotationDeg === null ? '—' : fmtSigned(m.rotationDeg, 3) + '°'}<br />{m.residual === null ? '' : '闭合差 ' + fmt(m.residual) + ' mm'}</> : '—'}</td>
                <td className="small">{m.basePending ? '' : <div className={indicatorFlag(data.indicators, 'platform-center', m.resultant, m.elevation).level === 'control' ? 'text-err' : 'muted'}>{indicatorText('platform-center', indicatorFlag(data.indicators, 'platform-center', m.resultant, m.elevation), m.resultant)}</div>}{[...new Set(m.records.map((o) => QUALITY_TEXT[o.quality]))].join('、')}{reasons.length ? <><br /><span className="text-warn" title={reasons.join('\n')}>待复核 {reasons.length} 项</span></> : ''}
                  {m.records.some((o) => o.history?.length) ? <details><summary>历史</summary>{m.records.map((o) => <HistoryList key={o.id} obs={o} />)}</details> : null}</td>
                <td><button className="link" type="button" onClick={(e) => { e.stopPropagation(); ctx.go(editHref); }}>修改</button></td>
              </tr>
            );
          })}
          {list.length === 0 && <tr><td colSpan={10} className="muted center">暂无记录</td></tr>}
        </tbody>
      </table>
    </div>
  );
}

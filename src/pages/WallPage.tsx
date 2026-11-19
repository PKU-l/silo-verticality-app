import { useEffect, useMemo, useRef, useState } from 'react';
import type { AppData, CenterObs } from '../model/types';
import { allCenters, STATUS_TEXT } from '../calc/center';
import { defaultPair, levelOf, thresholdsReady } from '../calc/compare';
import { fmt, lineDisplacement } from '../calc/direction';
import { validateAll, type Issue } from '../calc/validate';
import { download } from '../calc/csv';
import { PlanView } from '../charts/PlanView';
import { ProfileChart, type PPoint } from '../charts/ProfileChart';
import { obsTip, readingTip, type TipHandler } from '../charts/tips';
import { composePng } from '../charts/exportImage';
import { EntryA } from '../components/EntryA';
import { EntryB } from '../components/EntryB';
import { Cards, ComparePanel } from '../components/Summary';
import type { Ctx } from './ctx';
import { siloTitle } from '../calc/layout';

type Tab = 'A' | 'B';
type Method = 'all' | 'A' | 'B';
interface Filters { dateFrom: string; dateTo: string; method: Method; elevMin: string; elevMax: string }

const MAGS = [1, 20, 50, 100];

export function WallPage({ ctx, siloId, onTip }: { ctx: Ctx; siloId: string; onTip: TipHandler }) {
  const data = ctx.data;
  const silo = data.silos.find((x) => x.id === siloId) ?? data.silos[0];
  // 本页图形按该仓的外径、内径与观测高度绘制
  const cfg = { ...data.config, labels: ctx.labels, outerDiameter: silo.outerDiameter, innerDiameter: silo.innerDiameter, wallHeight: silo.elevMax };
  const l = cfg.labels;
  const setData = ctx.setData;
  const notify = ctx.notify;
  const view = { ...data, config: cfg };
  const [tab, setTab] = useState<Tab>('A');
  const [filters, setFilters] = useState<Filters>({ dateFrom: '', dateTo: '', method: 'all', elevMin: '', elevMax: '' });
  const [mag, setMag] = useState(100);
  const [showTrack, setShowTrack] = useState(true);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [cmpKeys, setCmpKeys] = useState<{ cur: string | null; prev: string | null }>({ cur: null, prev: null });
  const [showIssues, setShowIssues] = useState(false);
  const refs = { plan: useRef<SVGSVGElement>(null), x: useRef<SVGSVGElement>(null), y: useRef<SVGSVGElement>(null), r: useRef<SVGSVGElement>(null) };

  const setD = (f: (d: AppData) => AppData) => setData(f);

  /* ---------- 派生数据 ---------- */
  const allObs = useMemo(() => allCenters(data.centerRecords, data.lines, data.readings), [data]);
  const inFilter = (time: string, elevation: number | null) => {
    const day = time.slice(0, 10);
    if (filters.dateFrom && day < filters.dateFrom) return false;
    if (filters.dateTo && day > filters.dateTo) return false;
    const lo = parseFloat(filters.elevMin), hi = parseFloat(filters.elevMax);
    if (elevation !== null && Number.isFinite(lo) && elevation < lo) return false;
    if (elevation !== null && Number.isFinite(hi) && elevation > hi) return false;
    return true;
  };
  const siloObs = allObs.filter((o) => o.siloId === siloId && (filters.method === 'all' || o.source === filters.method) && inFilter(o.time, o.elevation));
  const issues = useMemo(() => validateAll(view), [data, cfg.wallHeight]);
  const issuesById = useMemo(() => {
    const m = new Map<string, Issue[]>();
    for (const i of issues) { if (!m.has(i.id)) m.set(i.id, []); m.get(i.id)!.push(i); }
    return m;
  }, [issues]);
  const ready = thresholdsReady(data.thresholds);
  const t = data.thresholds;
  const lvRes = (o: CenterObs) => levelOf(o.resultant, t.resultantWarning, t.resultantControl, ready);
  const lvComp = (v: number | null) => levelOf(v, t.componentWarning, t.componentControl, ready);

  // 平面图所选观测：优先用户选择，否则最高标高的最新一次
  const focus = siloObs.find((o) => o.key === selectedKey)
    ?? [...siloObs].sort((a, b) => b.elevation - a.elevation || b.time.localeCompare(a.time))[0] ?? null;
  const highlight = new Set(focus?.recordIds ?? []);
  const latestSession = siloObs.length ? siloObs.reduce((m, o) => (o.session > m ? o.session : m), '') : '';

  const pair = useMemo(() => defaultPair(siloObs), [siloObs.map((o) => o.key).join()]);
  const cmpCur = siloObs.some((o) => o.key === cmpKeys.cur) ? cmpKeys.cur : pair.cur?.key ?? null;
  const cmpPrev = siloObs.some((o) => o.key === cmpKeys.prev) ? cmpKeys.prev : pair.prev?.key ?? null;
  const cardPair = { cur: siloObs.find((o) => o.key === cmpCur) ?? null, prev: siloObs.find((o) => o.key === cmpPrev) ?? null };

  useEffect(() => {
    setSelectedKey(null); setCmpKeys({ cur: null, prev: null }); onTip(null);
    // 左侧录入页签跟随该筒仓已有数据的方式
    const hasA = data.centerRecords.some((r) => r.siloId === siloId);
    const hasB = data.lines.some((x) => x.siloId === siloId);
    setTab((cur) => (cur === 'A' && !hasA && hasB ? 'B' : cur === 'B' && !hasB && hasA ? 'A' : cur));
  }, [siloId]);
  useEffect(() => {
    const id = focus?.recordIds[0];
    if (id && selectedKey) document.getElementById('row-' + id)?.scrollIntoView({ block: 'nearest' });
  }, [selectedKey]);

  const onSelect = (key: string) => {
    setSelectedKey(key);
    const o = allObs.find((z) => z.key === key);
    if (o) setTab(o.source === 'A' ? 'A' : 'B');
  };
  const pickRecord = (recordId: string) => {
    const o = siloObs.find((z) => z.recordIds.includes(recordId));
    if (o) setSelectedKey(o.key);
    else notify('该记录不在当前筛选范围内，或数据不完整，未能生成观测点');
  };

  /* ---------- 立面图数据 ---------- */
  const compPoints = (axis: 'x' | 'y'): PPoint[] =>
    siloObs.filter((o) => o[axis] !== null).map((o) => ({
      id: o.key + axis, selectKey: o.key, elevation: o.elevation, value: o[axis] as number, series: o.session,
      level: lvComp(o[axis]), tip: obsTip(o, l),
    }));
  const xPts = compPoints('x'), yPts = compPoints('y');
  const rPts: PPoint[] = siloObs.filter((o) => o.resultant !== null).map((o) => ({
    id: o.key + 'r', selectKey: o.key, elevation: o.elevation, value: o.resultant as number, series: o.session, level: lvRes(o), tip: obsTip(o, l),
  }));
  const compTh = ready && (t.componentWarning !== null || t.componentControl !== null)
    ? { warn: t.componentWarning, control: t.componentControl, label: '单向' } : null;
  const resTh = ready && (t.resultantWarning !== null || t.resultantControl !== null)
    ? { warn: t.resultantWarning, control: t.resultantControl, label: '合成' } : null;
  const emptyFor = (axis: 'X' | 'Y') => {
    const insufficient = siloObs.length > 0;
    return insufficient ? `当前筒仓没有可换算 ${axis === 'X' ? l.xName : l.yName} 方向中心偏移的数据` : '当前筒仓 / 筛选范围内没有观测数据';
  };

  /* ---------- 局部读数视图 ---------- */
  const usedInCenter = new Set<string>();
  for (const o of allObs) {
    if (o.source !== 'B' || !o.sides) continue;
    if (o.x !== null) { if (o.sides.E) usedInCenter.add(o.sides.E.reading.id); if (o.sides.W) usedInCenter.add(o.sides.W.reading.id); }
    if (o.y !== null) { if (o.sides.N) usedInCenter.add(o.sides.N.reading.id); if (o.sides.S) usedInCenter.add(o.sides.S.reading.id); }
  }
  const siloLines = filters.method === 'A' ? [] : data.lines.filter((x) => x.siloId === siloId);
  const localCharts = siloLines.map((line) => {
    const pts: PPoint[] = data.readings
      .filter((r) => r.lineId === line.id && r.elevation !== null && inFilter(r.time, r.elevation))
      .flatMap((r) => {
        const d = lineDisplacement(line, r);
        if (!d) return [];
        const axis = line.side === 'E' || line.side === 'W' ? 'X' : 'Y';
        const value = d.dx === null ? d.along : axis === 'X' ? d.dx : (d.dy as number);
        const obs = allObs.find((o) => o.recordIds.includes(r.id));
        return [{
          id: r.id, selectKey: obs?.key ?? r.id, elevation: r.elevation as number, value, series: r.time.slice(0, 10),
          hollow: !usedInCenter.has(r.id), level: 'none' as const, tip: readingTip(line, r, l, usedInCenter.has(r.id)),
        }];
      });
    return { line, pts };
  }).filter((c) => c.pts.length > 0);

  /* ---------- 导出 ---------- */
  const metaLines = () => [
    `筒仓：${siloTitle(silo)}　导出时间：${new Date().toLocaleString()}　数据日期：${siloObs.length ? siloObs[0].session + ' ～ ' + latestSession : '无'}　方式：${filters.method === 'all' ? '全部' : '方式 ' + filters.method}`,
    `坐标方向：+${l.xName} = ${l.posX}（右），+${l.yName} = ${l.posY}（上）；${ctx.showNorth ? `真北相对 +${l.yName} ${cfg.northAngleDeg}°` : '北向未确认（按图纸方向）'}　单位：标高 m，偏移 mm`,
    `平面图偏移显示放大 ${mag}×（标注数值为真实值；设计圆为真实比例）　阈值：${ready ? `${t.source}，版本 ${t.version}，设置人 ${t.setBy}` : '未设置，仅展示实测数据'}`,
    '说明：图形由录入数据生成，不能代替测量复核或工程验收结论。',
  ];
  const exportPng = async () => {
    const svgs = [refs.plan.current, refs.x.current, refs.y.current, refs.r.current].filter((s): s is SVGSVGElement => !!s);
    const blob = await composePng(svgs, metaLines());
    download(`筒仓${siloId}_偏移图_${new Date().toISOString().slice(0, 10)}.png`, blob);
  };
  const siloHasData = (id: string) => allObs.some((o) => o.siloId === id) || data.lines.some((x) => x.siloId === id);

  return (
    <div className="page wall-page">
      <header className="silo-head no-print">
        <div>
          <div className="silo-title">{siloTitle(silo)} · 成型仓壁偏移</div>
          <div className="muted small">方式 A 中心偏移 / 方式 B 铅垂线读数；与垂准仪“平台偏移”分开保存和计算</div>
        </div>
        <div className="row gap wrap">
          <label className="silo-select">仓号
            <select value={siloId} onChange={(e) => ctx.go('/wall/' + e.target.value)}>
              {data.silos.map((x) => <option key={x.id} value={x.id}>{x.id}{siloHasData(x.id) ? ' ●' : ''}</option>)}
            </select>
          </label>
          <button type="button" onClick={() => ctx.go('/silo/' + siloId)}>单仓详情</button>
          <button type="button" onClick={exportPng}>导出图片</button>
          <button type="button" onClick={() => window.print()}>打印 / PDF</button>
        </div>
      </header>

      <div className="print-meta">
        <h2>筒仓滑模垂直度观测与偏移可视化 · {siloTitle(silo)}</h2>
        {metaLines().map((m) => <p key={m}>{m}</p>)}
      </div>

      <main className="layout">
        <aside className="left no-print">
          <section className="filters">
            <h3>筛选</h3>
            <div className="form-grid">
              <label className="field"><span className="field-label">起始日期</span><input type="date" value={filters.dateFrom} onChange={(e) => setFilters({ ...filters, dateFrom: e.target.value })} /></label>
              <label className="field"><span className="field-label">截止日期</span><input type="date" value={filters.dateTo} onChange={(e) => setFilters({ ...filters, dateTo: e.target.value })} /></label>
              <label className="field"><span className="field-label">测量方式</span>
                <select value={filters.method} onChange={(e) => setFilters({ ...filters, method: e.target.value as Method })}>
                  <option value="all">全部</option><option value="A">方式 A 中心偏移</option><option value="B">方式 B 测点读数</option>
                </select>
              </label>
              <label className="field"><span className="field-label">标高范围 (m)</span>
                <span className="row gap-s">
                  <input inputMode="decimal" placeholder="最低" value={filters.elevMin} onChange={(e) => setFilters({ ...filters, elevMin: e.target.value })} />
                  <input inputMode="decimal" placeholder="最高" value={filters.elevMax} onChange={(e) => setFilters({ ...filters, elevMax: e.target.value })} />
                </span>
              </label>
            </div>
          </section>

          <nav className="tabs">
            {([['A', '方式 A · 中心偏移'], ['B', '方式 B · 测点读数']] as [Tab, string][]).map(([k, name]) => (
              <button key={k} type="button" className={tab === k ? 'active' : ''} onClick={() => setTab(k)}>{name}</button>
            ))}
          </nav>
          {tab === 'A' && <EntryA data={view} setData={setD} siloId={siloId} issues={issuesById} highlight={highlight} onPick={pickRecord} notify={notify} />}
          {tab === 'B' && <EntryB data={view} setData={setD} siloId={siloId} issues={issuesById} highlight={highlight} onPick={pickRecord} notify={notify} />}
          <section className="issues">
            <button type="button" className="link" onClick={() => setShowIssues(!showIssues)}>
              数据核查提示（{issues.filter((i) => i.level === 'error').length} 项缺失 / {issues.filter((i) => i.level === 'warn').length} 项提示）{showIssues ? '▲' : '▼'}
            </button>
            {showIssues && (
              <ul className="small">
                {issues.map((i, k) => <li key={k} className={i.level === 'error' ? 'text-err' : 'text-warn'}>{describeIssueTarget(i, data)}：{i.message}</li>)}
                {issues.length === 0 && <li className="muted">暂无提示</li>}
              </ul>
            )}
            <p className="muted small">提示不会修改或删除原始记录，请对照现场原始记录核查。</p>
          </section>
        </aside>

        <section className="right">
          <Cards obs={siloObs} labels={l} thresholds={t} ready={ready} pair={cardPair} />

          <div className="toolbar no-print">
            <label>所选标高
              <select value={focus?.key ?? ''} onChange={(e) => setSelectedKey(e.target.value)}>
                {[...siloObs].sort((a, b) => b.elevation - a.elevation || b.time.localeCompare(a.time)).map((o) => (
                  <option key={o.key} value={o.key}>{fmt(o.elevation, 2)} m · {o.time.replace('T', ' ')} · {o.status === 'complete' ? '完整' : STATUS_TEXT[o.status]}</option>
                ))}
              </select>
            </label>
            <label className="check"><input type="checkbox" checked={showTrack} onChange={(e) => setShowTrack(e.target.checked)} />叠加各标高中心轨迹</label>
            <div className="mag">
              偏移显示放大
              {MAGS.map((m) => <button key={m} type="button" className={mag === m ? 'active' : ''} onClick={() => setMag(m)}>{m}×</button>)}
              <input type="range" min={1} max={200} value={mag} onChange={(e) => setMag(Number(e.target.value))} />
              <b>{mag}×</b>
            </div>
          </div>

          <div className="charts">
            <div className="chart-box plan">
              <PlanView config={cfg} siloId={siloId} obs={siloObs} focus={focus} showTrack={showTrack} mag={mag}
                selectedKey={focus?.key ?? null} levelOf={lvRes} onSelect={onSelect} onTip={onTip} svgRef={refs.plan} showNorth={ctx.showNorth} />
            </div>
            <div className="chart-box">
              <ProfileChart svgRef={refs.x} title={`${l.xName} 方向立面（${l.negX}—${l.posX}）`} subtitle={`筒仓 ${siloId} · 中心 ${l.xName} 偏移随标高`}
                points={xPts} wallHeight={cfg.wallHeight} negLabel={l.negX} posLabel={l.posX} zeroLabel="设计轴线 0"
                thresholds={compTh} emptyText={xPts.length ? null : emptyFor('X')} latestSeries={latestSession}
                selectedKey={focus?.key ?? null} onSelect={onSelect} onTip={onTip} />
            </div>
            <div className="chart-box">
              <ProfileChart svgRef={refs.y} title={`${l.yName} 方向立面（${l.negY}—${l.posY}）`} subtitle={`筒仓 ${siloId} · 中心 ${l.yName} 偏移随标高`}
                points={yPts} wallHeight={cfg.wallHeight} negLabel={l.negY} posLabel={l.posY} zeroLabel="设计轴线 0"
                thresholds={compTh} emptyText={yPts.length ? null : emptyFor('Y')} latestSeries={latestSession}
                selectedKey={focus?.key ?? null} onSelect={onSelect} onTip={onTip} />
            </div>
            <div className="chart-box">
              <ProfileChart svgRef={refs.r} title="合成偏移量随标高" subtitle={`√(${l.xName}²＋${l.yName}²)，仅 ${l.xName}、${l.yName} 均有效时计算`}
                points={rPts} wallHeight={cfg.wallHeight} negLabel="" posLabel="合成偏移" zeroLabel="设计中心 0" nonNegative
                thresholds={resTh} emptyText={rPts.length ? null : `没有 ${l.xName}、${l.yName} 同时有效的观测`} latestSeries={latestSession}
                selectedKey={focus?.key ?? null} onSelect={onSelect} onTip={onTip} />
            </div>
            <div className="chart-box compare-box">
              <ComparePanel obs={siloObs} labels={l} curKey={cmpCur} prevKey={cmpPrev}
                setCur={(k) => setCmpKeys({ cur: k, prev: cmpPrev })} setPrev={(k) => setCmpKeys({ cur: cmpCur, prev: k })} />
            </div>
          </div>

          {localCharts.length > 0 && (
            <section className="local">
              <h3>局部读数视图（测点相对基准的位移—标高）</h3>
              <p className="muted small">
                每张图只表示该测点相对其基准的位移，<b>不代表筒仓整体垂直度</b>。实心点：已与对侧测点组合换算中心；空心点：无对侧测点，中心偏移数据不足。
              </p>
              <div className="charts">
                {localCharts.map(({ line, pts }) => {
                  const ax = line.side === 'E' || line.side === 'W' ? 'X' : line.side === 'OTHER' ? null : 'Y';
                  return (
                    <div className="chart-box" key={line.id}>
                      <ProfileChart title={line.name} subtitle={`测点位移（局部读数） · 基准读数 ${fmt(line.baseReading, 1)} mm`}
                        points={pts} wallHeight={cfg.wallHeight}
                        negLabel={ax === 'X' ? l.negX : ax === 'Y' ? l.negY : '读数减小'} posLabel={ax === 'X' ? l.posX : ax === 'Y' ? l.posY : '读数增大'}
                        zeroLabel="基准位置 0" emptyText={null} selectedKey={focus?.key ?? null} onSelect={onSelect} onTip={onTip}
                        width={340} height={440} footnote="局部读数，非筒仓整体垂直度；连线仅为示意" />
                    </div>
                  );
                })}
              </div>
            </section>
          )}
          <p className="disclaimer">图形由录入数据生成，不能代替测量复核或工程验收结论。{ready ? '' : '未设置阈值：仅展示实测数据，不作合格 / 超标判断。'}</p>
        </section>
      </main>

    </div>
  );
}

function describeIssueTarget(i: Issue, d: AppData): string {
  if (i.kind === 'A') {
    const r = d.centerRecords.find((x) => x.id === i.id);
    return r ? `方式A ${r.siloId} ${r.time.replace('T', ' ')} ${r.elevation ?? '?'}m` : '方式A';
  }
  if (i.kind === 'LINE') {
    const x = d.lines.find((z) => z.id === i.id);
    return x ? `观测线 ${x.siloId} ${x.name}` : '观测线';
  }
  const r = d.readings.find((x) => x.id === i.id);
  const line = r && d.lines.find((z) => z.id === r.lineId);
  return r ? `读数 ${line?.siloId ?? ''} ${line?.name ?? ''} ${r.time.replace('T', ' ')} ${r.elevation ?? '?'}m` : '读数';
}


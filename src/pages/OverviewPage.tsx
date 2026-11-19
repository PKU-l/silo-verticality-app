/** 九仓总览：卡片（手机）+ 平面图 */
import { useMemo, useState } from 'react';
import type { CenterObs } from '../model/types';
import { allCenters } from '../calc/center';
import { platformCenters } from '../calc/plumb';
import { CELL_TEXT, elevationsOf, overviewCells, type Cell } from '../calc/overview';
import { DEFAULT_GRID, positionLabel } from '../calc/layout';
import { describeOffset, fmt, fmtSigned } from '../calc/direction';
import { indicatorFlag } from '../calc/distance';
import { OverviewChart } from '../charts/OverviewChart';
import { ZoomPan } from '../components/ZoomPan';
import { useLocalState } from '../components/useLocalState';
import type { Ctx } from './ctx';

export function OverviewPage({ ctx }: { ctx: Ctx }) {
  const { data, labels: l } = ctx;
  const [source, setSource] = useLocalState<'P' | 'W'>('ov-source', 'P');
  const [modeKind, setModeKind] = useLocalState<'elevation' | 'latest'>('ov-mode', 'elevation');
  const [elevSel, setElevSel] = useState<string>('');
  const [roundId, setRoundId] = useLocalState<string>('ov-round', '');
  const [mag, setMag] = useLocalState<number>('ov-mag', 200);
  const [drawing, setDrawing] = useLocalState<'simple' | 'reference'>('ov-drawing', 'simple');
  const [view, setView] = useLocalState<'cards' | 'plan'>('ov-view', 'cards');

  const obs: CenterObs[] = useMemo(() => {
    if (source === 'P') {
      const list = roundId ? data.plumbObs.filter((o) => o.roundId === roundId) : data.plumbObs;
      return platformCenters(list);
    }
    return allCenters(data.centerRecords, data.lines, data.readings);
  }, [data, source, roundId]);
  const elevs = elevationsOf(obs);
  const elevation = elevSel !== '' && elevs.includes(Number(elevSel)) ? Number(elevSel) : elevs[0] ?? null;
  const cells = overviewCells(data.silos, obs, modeKind === 'latest' ? { kind: 'latest' } : { kind: 'elevation', elevation, tolerance: data.layout.sameElevTolerance });
  // 垂准仪合成偏移只对照“滑模平台中心偏移”指标；仓壁截面只对照“成型结构垂直度”指标
  const target = source === 'P' ? 'platform-center' : 'structure-vertical';
  const lv = (c: Cell) => (c.obs && c.state === 'ok' ? indicatorFlag(data.indicators, target, c.obs.resultant, c.obs.elevation).level : 'none');
  const hasInd = data.indicators.some((i) => i.status === 'approved' && i.target === target);
  const sourceLabel = source === 'P' ? '平台偏移（垂准仪）' : '成型仓壁偏移';
  const cellOf = (id: string) => cells.find((c) => c.silo.id === id);

  return (
    <div className="page">
      <p className="mode-banner">可选模式总览：垂准仪“滑模平台中心偏移”与仓壁截面“成型仓壁偏移”。默认的八点仓壁距离差见“九仓总览”。</p>
      <div className="toolbar">
        <div className="seg">
          <button type="button" className={source === 'P' ? 'active' : ''} onClick={() => setSource('P')}>平台偏移</button>
          <button type="button" className={source === 'W' ? 'active' : ''} onClick={() => setSource('W')}>成型仓壁偏移</button>
        </div>
        <div className="seg">
          <button type="button" className={modeKind === 'elevation' ? 'active' : ''} onClick={() => setModeKind('elevation')}>同一标高</button>
          <button type="button" className={modeKind === 'latest' ? 'active' : ''} onClick={() => setModeKind('latest')}>各仓最近一次</button>
        </div>
        {modeKind === 'elevation' && (
          <label>标高
            <select value={elevation ?? ''} onChange={(e) => setElevSel(e.target.value)}>
              {elevs.length === 0 && <option value="">无数据</option>}
              {elevs.map((e) => <option key={e} value={e}>{fmt(e, 2)} m</option>)}
            </select>
            {data.layout.sameElevTolerance > 0 && <span className="muted small">容差 ±{data.layout.sameElevTolerance} m</span>}
          </label>
        )}
        {source === 'P' && (
          <label>轮次
            <select value={roundId} onChange={(e) => setRoundId(e.target.value)}>
              <option value="">全部</option>
              {data.rounds.filter((r) => r.mode !== 'distance').map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
          </label>
        )}
        <div className="seg only-mobile">
          <button type="button" className={view === 'cards' ? 'active' : ''} onClick={() => setView('cards')}>卡片</button>
          <button type="button" className={view === 'plan' ? 'active' : ''} onClick={() => setView('plan')}>平面图</button>
        </div>
      </div>
      {modeKind === 'latest' && <p className="notice">“各仓最近一次观测”模式：每仓显示的是各自最近一次的标高和时间，<b>不是同一截面</b>，请勿直接横向比较。</p>}

      <div className={'overview-grid view-' + view}>
        <section className="ov-cards" aria-label="九仓卡片">
          {DEFAULT_GRID.map((row) => row.map((id) => {
            const c = cellOf(id);
            if (!c) return <div key={id} className="silo-card empty">{id}</div>;
            const o = c.obs;
            const level = lv(c);
            return (
              <button key={id} type="button" className={`silo-card st-${c.state} lv-${level}`} onClick={() => ctx.go('/silo/' + id)}>
                <span className="sc-id">{id}</span>
                <span className="sc-pos">{positionLabel(c.silo)}</span>
                {o && c.state === 'ok' ? (
                  <>
                    <span className="sc-val">{fmt(o.resultant)}<small> mm</small></span>
                    <span className="sc-sub">X {fmtSigned(o.x)} · Y {fmtSigned(o.y)}</span>
                    {ctx.data.layout.orientationConfirmed && <span className="sc-sub">{describeOffset(o.x, o.y, l, 0)}</span>}
                    {o.rotationDeg != null && <span className="sc-sub">扭转 {fmtSigned(o.rotationDeg, 3)}°</span>}
                  </>
                ) : o && (c.state === 'x-only' || c.state === 'y-only') ? (
                  <>
                    <span className="sc-val small-v">{c.state === 'x-only' ? `X ${fmtSigned(o.x)}` : `Y ${fmtSigned(o.y)}`}</span>
                    <span className="sc-sub">{CELL_TEXT[c.state]}，不计算合成</span>
                  </>
                ) : (
                  <span className="sc-state">{CELL_TEXT[c.state]}</span>
                )}
                {o && (modeKind === 'latest' || c.state !== 'ok') && <span className="sc-time">{fmt(o.elevation, 2)} m · {o.time.slice(5).replace('T', ' ')}</span>}
                {level !== 'none' && <span className="level-tag">超过指标对照值</span>}
              </button>
            );
          }))}
        </section>

        <section className="ov-plan chart-box wide">
          <div className="row gap wrap plan-ctl">
            <div className="seg">
              <button type="button" className={drawing === 'simple' ? 'active' : ''} onClick={() => setDrawing('simple')}>简洁观测图</button>
              <button type="button" className={drawing === 'reference' ? 'active' : ''} onClick={() => setDrawing('reference')}>图纸参考图</button>
            </div>
            <div className="mag">
              箭头放大
              {[50, 100, 200, 300].map((m) => <button key={m} type="button" className={mag === m ? 'active' : ''} onClick={() => setMag(m)}>{m}×</button>)}
              <input type="range" min={1} max={500} value={mag} onChange={(e) => setMag(Number(e.target.value))} aria-label="箭头放大倍数" />
              <b>{mag}×</b>
            </div>
          </div>
          <ZoomPan>
            <OverviewChart silos={data.silos} layout={data.layout} cells={cells} labels={l} northAngleDeg={data.config.northAngleDeg}
              mag={mag} latestMode={modeKind === 'latest'} drawingMode={drawing} sourceLabel={sourceLabel} levelOf={lv} onOpen={(id) => ctx.go('/silo/' + id)} />
          </ZoomPan>
          {drawing === 'reference' && !data.layout.bgImage && (
            <p className="muted small">可在“设置 → 图纸参考底图”上传筒仓布置图作为底图并调整对位；仓号位置不随底图改变。</p>
          )}
        </section>
      </div>
      <p className="disclaimer">{hasInd ? '红色仅表示超过已批准指标的对照值，' : '未配置已批准的适用指标：仅展示实测数据，不作指标对照。'}图形和颜色不能代替测量复核或人工签认。</p>
    </div>
  );
}

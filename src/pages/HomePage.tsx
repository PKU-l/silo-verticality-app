/** 首页：九仓平面（八点动态）+ 选中点计算链 + 八点录入清单 */
import { useEffect, useState } from 'react';
import { calcReading, combineCorner, POINT_STATUS_TEXT } from '../calc/distance';
import { NinePlan, NinePlanLegend, type PointView } from '../charts/NinePlan';
import { ZoomPan } from '../components/ZoomPan';
import { useLocalState } from '../components/useLocalState';
import { CalcChain, PointChecklist, statusOf, useDistFilter } from './distShared';
import type { Ctx } from './ctx';

export function usePageVisible() {
  const [v, setV] = useState(!document.hidden);
  useEffect(() => {
    const on = () => setV(!document.hidden);
    document.addEventListener('visibilitychange', on);
    return () => document.removeEventListener('visibilitychange', on);
  }, []);
  return v;
}

export function HomePage({ ctx }: { ctx: Ctx }) {
  const d = ctx.data;
  const f = useDistFilter(ctx);
  const [sel, setSel] = useLocalState<string | null>('home-sel', null);
  const [mag, setMag] = useLocalState<number>('home-mag', 500);
  const [anim, setAnim] = useLocalState<boolean>('home-anim', true);
  const visible = usePageVisible();
  const views: PointView[] = f.points.map((p) => {
    const r = f.picked.get(p.id) ?? null;
    return { point: p, calc: r ? calcReading(p, r) : null, statusText: POINT_STATUS_TEXT[statusOf(d, p, r).status], elevation: r?.elevation ?? null, time: r?.time ?? '' };
  });
  const cornerIds = [...new Set(f.points.map((p) => p.siloId))];
  const corners = cornerIds.map((id) => combineCorner(id, f.points, f.picked, d.layout.sameElevTolerance));
  const selPoint = f.points.find((p) => p.id === sel) ?? null;

  return (
    <div className="page">
      {f.bar}
      {f.note && <p className="notice">{f.note}</p>}
      <div className="home-grid">
        <section className="chart-box wide">
          <div className="row gap wrap plan-ctl">
            <div className="mag">箭头放大
              {[200, 500, 1000].map((m) => <button key={m} type="button" className={mag === m ? 'active' : ''} onClick={() => setMag(m)}>{m}×</button>)}
              <input type="range" min={1} max={2000} value={mag} onChange={(e) => setMag(Number(e.target.value))} aria-label="箭头放大倍数" />
              <b>{mag}×</b>
            </div>
            <label className="check"><input type="checkbox" checked={anim} onChange={(e) => setAnim(e.target.checked)} />点位动画</label>
          </div>
          <ZoomPan>
            <NinePlan silos={d.silos} layout={d.layout} points={views} corners={corners} mag={mag} selected={sel}
              onSelect={(id) => setSel(id === sel ? null : id)} animate={anim && visible} />
          </ZoomPan>
          <NinePlanLegend />
          {!d.layout.orientationConfirmed && <p className="muted small">方向按图纸“上、下、左、右”表示；项目北向未确认前不标注东西南北。</p>}
        </section>
        <section>
          {selPoint && (
            <div className="card-panel">
              <div className="row gap wrap" style={{ justifyContent: 'space-between' }}>
                <h3 style={{ margin: 0 }}>观测点 {selPoint.id}</h3>
                <div className="row gap">
                  <button type="button" className="primary" onClick={() => ctx.go(`/dentry/${encodeURIComponent(selPoint.id)}${f.roundId && f.kind === 'round' ? '?round=' + f.roundId : ''}`)}>录入</button>
                  <button type="button" onClick={() => ctx.go(`/point/${encodeURIComponent(selPoint.id)}`)}>曲线与记录</button>
                  <button type="button" onClick={() => { localStorage.setItem('silo-ui:point-tab', '"base"'); ctx.go(`/point/${encodeURIComponent(selPoint.id)}`); }}>底部基准</button>
                </div>
              </div>
              <CalcChain ctx={ctx} point={selPoint} reading={f.picked.get(selPoint.id) ?? null} />
            </div>
          )}
          <h3>八点录入清单</h3>
          <PointChecklist ctx={ctx} picked={f.picked} selected={sel} roundId={f.kind === 'round' ? f.roundId : null} />
          <p className="muted small">点击点号进入录入。状态以文字表示；绿色点只标识位置。</p>
        </section>
      </div>
    </div>
  );
}

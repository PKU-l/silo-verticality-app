/** 顶部信息卡片 + 本次与上次比较 */
import type { AxisLabels, CenterObs, ThresholdSet } from '../model/types';
import { compareObs, levelOf, type Level } from '../calc/compare';
import { describeComponent, describeOffset, fmt, fmtSigned } from '../calc/direction';
import { STATUS_TEXT, elevKey } from '../calc/center';
import { offsetToSvg } from '../charts/geometry';
import { COLORS } from '../charts/theme';

const tm = (s: string) => s.replace('T', ' ');

function LevelTag({ level }: { level: Level }) {
  if (level === 'none') return null;
  return <span className="level-tag">{level === 'control' ? '超过控制值' : '超过预警值'}</span>;
}

interface CardsProps {
  obs: CenterObs[];
  labels: AxisLabels;
  thresholds: ThresholdSet;
  ready: boolean;
  pair: { cur: CenterObs | null; prev: CenterObs | null };
}

export function Cards({ obs, labels: l, thresholds: t, ready, pair }: CardsProps) {
  const top = obs.length ? Math.max(...obs.map((o) => o.elevation)) : null;
  const atTop = top === null ? null : obs.filter((o) => elevKey(o.elevation) === elevKey(top)).sort((a, b) => b.time.localeCompare(a.time))[0];
  const complete = obs.filter((o) => o.status === 'complete');
  const maxObs = complete.reduce<CenterObs | null>((m, o) => (!m || (o.resultant ?? 0) > (m.resultant ?? 0) ? o : m), null);
  const cmp = pair.cur && pair.prev ? compareObs(pair.cur, pair.prev) : null;
  const count = (s: CenterObs['status']) => obs.filter((o) => o.status === s).length;
  const lvMax = maxObs ? levelOf(maxObs.resultant, t.resultantWarning, t.resultantControl, ready) : 'none';
  const lvTop = atTop ? levelOf(atTop.resultant, t.resultantWarning, t.resultantControl, ready) : 'none';

  return (
    <div className="cards">
      <div className="card">
        <div className="card-label">最高观测标高</div>
        <div className="card-value">{top === null ? '—' : fmt(top, 2)}<small> m</small></div>
        <div className="card-sub">{atTop ? tm(atTop.time) : '无数据'}</div>
      </div>
      <div className="card">
        <div className="card-label">该标高中心偏移</div>
        {atTop && atTop.status === 'complete' ? (
          <>
            <div className="card-value">{fmt(atTop.resultant)}<small> mm</small> <LevelTag level={lvTop} /></div>
            <div className="card-sub">{describeOffset(atTop.x, atTop.y, l)}</div>
          </>
        ) : (
          <>
            <div className="card-value muted-v">{atTop ? '数据不足' : '—'}</div>
            <div className="card-sub">{atTop ? STATUS_TEXT[atTop.status] + (atTop.x !== null ? `；${describeComponent(atTop.x, 'X', l)}` : '') + (atTop.y !== null ? `；${describeComponent(atTop.y, 'Y', l)}` : '') : ''}</div>
          </>
        )}
      </div>
      <div className="card">
        <div className="card-label">最大已测中心偏移</div>
        {maxObs ? (
          <>
            <div className="card-value">{fmt(maxObs.resultant)}<small> mm</small> <LevelTag level={lvMax} /></div>
            <div className="card-sub">标高 {fmt(maxObs.elevation, 2)} m · {maxObs.session}</div>
          </>
        ) : <div className="card-value muted-v">无完整数据</div>}
      </div>
      <div className="card">
        <div className="card-label">最近两次观测变化</div>
        {cmp && pair.cur && pair.prev && cmp.dx === null && cmp.dy === null ? (
          <><div className="card-value muted-v">无法比较</div><div className="card-sub">两次观测没有共同的有效中心分量</div></>
        ) : cmp && pair.cur && pair.prev ? (
          <>
            <div className="card-value small-v">
              Δ{l.xName} {fmtSigned(cmp.dx)} · Δ{l.yName} {fmtSigned(cmp.dy)}<small> mm</small>
            </div>
            <div className="card-sub">
              {cmp.sameElevation ? `同标高 ${fmt(pair.cur.elevation, 1)} m` : `不同标高（${fmt(pair.prev.elevation, 1)} → ${fmt(pair.cur.elevation, 1)} m）`}
              {cmp.move !== null ? ` · 中心移动 ${fmt(cmp.move)} mm` : ''}
            </div>
          </>
        ) : <div className="card-value muted-v">不足两次</div>}
      </div>
      <div className="card">
        <div className="card-label">数据完整度</div>
        <div className="card-value">{obs.length ? Math.round((complete.length / obs.length) * 100) : 0}<small> %</small></div>
        <div className="card-sub">完整 {complete.length} / 共 {obs.length}；仅X {count('x-only')}，仅Y {count('y-only')}，不足 {count('insufficient')}</div>
      </div>
      <div className={'card threshold-card' + (ready ? '' : ' off')}>
        <div className="card-label">阈值</div>
        {ready ? (
          <div className="card-sub">
            合成：预警 {fmt(t.resultantWarning, 0)} / 控制 {fmt(t.resultantControl, 0)} mm；单向：预警 {fmt(t.componentWarning, 0)} / 控制 {fmt(t.componentControl, 0)} mm<br />
            来源：{t.source}　版本：{t.version}　设置人：{t.setBy}
          </div>
        ) : <div className="card-sub">未设置（或信息不完整）：仅展示实测数据，不作合格/超标判断</div>}
      </div>
    </div>
  );
}

interface CompareProps {
  obs: CenterObs[];
  labels: AxisLabels;
  curKey: string | null;
  prevKey: string | null;
  setCur: (k: string) => void;
  setPrev: (k: string) => void;
}

export function ComparePanel({ obs, labels: l, curKey, prevKey, setCur, setPrev }: CompareProps) {
  const cur = obs.find((o) => o.key === curKey) ?? null;
  const prev = obs.find((o) => o.key === prevKey) ?? null;
  const cmp = cur && prev ? compareObs(cur, prev) : null;
  const opt = (o: CenterObs) => `${tm(o.time)} · ${fmt(o.elevation, 1)} m · ${o.source} · ${o.status === 'complete' ? '完整' : STATUS_TEXT[o.status]}`;
  const sorted = [...obs].sort((a, b) => b.time.localeCompare(a.time) || b.elevation - a.elevation);

  // 小示意图：两个中心点与移动向量（自动缩放，仅示意方向）
  const pts = [cur, prev].filter((o): o is CenterObs => !!o && o.status === 'complete');
  const maxAbs = Math.max(1, ...pts.flatMap((o) => [Math.abs(o.x!), Math.abs(o.y!)]));
  const S = 70 / maxAbs; // px/mm
  const P = (o: CenterObs) => { const d = offsetToSvg(o.x!, o.y!, 1000, S); return { x: 90 + d.dx, y: 90 + d.dy }; };

  return (
    <div className="compare">
      <h3>本次与上次比较</h3>
      <div className="form-grid">
        <label className="field"><span className="field-label">本次</span>
          <select value={curKey ?? ''} onChange={(e) => setCur(e.target.value)}>
            {sorted.map((o) => <option key={o.key} value={o.key}>{opt(o)}</option>)}
          </select>
        </label>
        <label className="field"><span className="field-label">上次</span>
          <select value={prevKey ?? ''} onChange={(e) => setPrev(e.target.value)}>
            {sorted.map((o) => <option key={o.key} value={o.key}>{opt(o)}</option>)}
          </select>
        </label>
      </div>
      {cur && prev && cmp ? (
        <div className="compare-body">
          <table className="data-table compact">
            <thead><tr><th></th><th>{l.xName} mm</th><th>{l.yName} mm</th><th>合成 mm</th></tr></thead>
            <tbody>
              <tr><td>上次</td><td>{fmtSigned(prev.x)}</td><td>{fmtSigned(prev.y)}</td><td>{fmt(prev.resultant)}</td></tr>
              <tr><td>本次</td><td>{fmtSigned(cur.x)}</td><td>{fmtSigned(cur.y)}</td><td>{fmt(cur.resultant)}</td></tr>
              <tr className="strong"><td>变化</td><td>{fmtSigned(cmp.dx)}</td><td>{fmtSigned(cmp.dy)}</td><td>{fmtSigned(cmp.dResultant)}</td></tr>
            </tbody>
          </table>
          <svg viewBox="0 0 180 180" width={180} height={180} className="mini-plan">
            <rect width={180} height={180} fill="#fff" stroke={COLORS.grid} />
            <line x1={10} y1={90} x2={170} y2={90} stroke={COLORS.design} strokeDasharray="4 3" />
            <line x1={90} y1={10} x2={90} y2={170} stroke={COLORS.design} strokeDasharray="4 3" />
            <text x={172} y={86} fontSize={10} textAnchor="end" fill={COLORS.design}>{l.posX}</text>
            <text x={94} y={20} fontSize={10} fill={COLORS.design}>{l.posY}</text>
            {prev.status === 'complete' && (() => { const p = P(prev); return <><line x1={90} y1={90} x2={p.x} y2={p.y} stroke={COLORS.measuredOld} strokeWidth={2} /><circle cx={p.x} cy={p.y} r={4} fill={COLORS.measuredOld} /><text x={p.x + 5} y={p.y + 12} fontSize={10} fill={COLORS.sub}>上次</text></>; })()}
            {cur.status === 'complete' && (() => { const p = P(cur); return <><line x1={90} y1={90} x2={p.x} y2={p.y} stroke={COLORS.measured} strokeWidth={2} /><circle cx={p.x} cy={p.y} r={4} fill={COLORS.measured} /><text x={p.x + 5} y={p.y - 5} fontSize={10} fill={COLORS.text}>本次</text></>; })()}
            {cur.status === 'complete' && prev.status === 'complete' && (() => { const a = P(prev), b = P(cur); return <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={COLORS.text} strokeWidth={1.2} strokeDasharray="3 2" />; })()}
            <text x={6} y={174} fontSize={9} fill={COLORS.sub}>自动缩放示意，仅看方向</text>
          </svg>
          <div className="compare-text small">
            {!cmp.sameElevation && <p className="text-warn">注意：两次观测不在同一标高，比较结果反映的是不同截面的差异。</p>}
            <p><b>中心位置移动：</b>{cmp.move !== null ? `${fmt(cmp.move)} mm（${describeOffset(cmp.dx, cmp.dy, l)}）` : '有分量缺失，无法计算完整移动量'}</p>
            <p><b>合成偏移量变化：</b>{cmp.dResultant !== null ? `${fmtSigned(cmp.dResultant)} mm（${cmp.dResultant > 0.05 ? '离设计中心更远' : cmp.dResultant < -0.05 ? '更靠近设计中心' : '距设计中心基本不变'}）` : '有一次观测 X、Y 不完整，不计算'}</p>
            <p className="muted">两者不是一回事：中心可能明显移动而合成偏移量不变（如绕设计中心转向），也可能合成偏移量变大而移动方向与原偏移方向不同。</p>
          </div>
        </div>
      ) : <p className="muted small">至少需要两次观测才能比较。</p>}
    </div>
  );
}

/** 角仓位移图：四个角仓分别显示两个分量与“角仓两测点组合位移示意” */
import type { DistReading } from '../model/distTypes';
import { SIDE_FULL, TARGET_TEXT, activeIndicator, calcReading, checkIndicator, combineCorner, describeDrawing, describeProject, type CornerResult } from '../calc/distance';
import { positionLabel } from '../calc/layout';
import { fmt, fmtSigned } from '../calc/direction';
import { COLORS, FONT } from '../charts/theme';
import { useLocalState } from '../components/useLocalState';
import { useDistFilter } from './distShared';
import type { Ctx } from './ctx';
import { tm } from './ctx';

const CORNER_ORDER = ['12', '10', '18', '16']; // 图纸：左上、右上、左下、右下

function CornerSvg({ c, mag }: { c: CornerResult; mag: number }) {
  const W = 300, H = 260, cx = 150, cy = 130, r = 88;
  const s = (mag * 2 * r) / 12500; // px/mm：仓圆按外径 12.5 m 绘制，箭头再放大 mag 倍
  const du = c.u !== null ? c.u * s : null, dv = c.v !== null ? -c.v * s : null;
  const side = (p: CornerResult['uPoint']) => p?.side;
  const at = (sd: string | undefined) => sd === 'up' ? [cx, cy - r] : sd === 'down' ? [cx, cy + r] : sd === 'left' ? [cx - r, cy] : [cx + r, cy];
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ maxWidth: 360, display: 'block', margin: '0 auto' }} fontFamily={FONT}>
      <defs>
        <marker id={'cA' + c.siloId} viewBox="0 0 10 10" refX="9" refY="5" markerUnits="userSpaceOnUse" markerWidth="12" markerHeight="12" orient="auto"><path d="M0,0 L10,5 L0,10 z" fill={COLORS.measured} /></marker>
        <marker id={'cB' + c.siloId} viewBox="0 0 10 10" refX="9" refY="5" markerUnits="userSpaceOnUse" markerWidth="10" markerHeight="10" orient="auto"><path d="M0,0 L10,5 L0,10 z" fill="#b45309" /></marker>
      </defs>
      <rect width={W} height={H} fill="#fff" />
      <circle cx={cx} cy={cy} r={r} fill="#fff" stroke="#8e98a4" strokeWidth={1.6} />
      <circle cx={cx} cy={cy} r={r * 0.96} fill="none" stroke="#b8c0ca" />
      <line x1={cx - r - 20} y1={cy} x2={cx + r + 20} y2={cy} stroke={COLORS.grid} strokeDasharray="4 3" />
      <line x1={cx} y1={cy - r - 20} x2={cx} y2={cy + r + 20} stroke={COLORS.grid} strokeDasharray="4 3" />
      <text x={W - 6} y={cy - 4} fontSize={11} fill={COLORS.sub} textAnchor="end">u+ 图纸右</text>
      <text x={cx + 4} y={12} fontSize={11} fill={COLORS.sub}>v+ 图纸上</text>
      {[c.uPoint, c.vPoint].filter(Boolean).map((p) => {
        const [x, y] = at(side(p));
        return <g key={p!.id}><circle cx={x} cy={y} r={6} fill="#16a34a" stroke="#fff" strokeWidth={1.5} /><text x={x + 8} y={y - 8} fontSize={11} fontWeight={700} fill={COLORS.text}>{p!.id}</text></g>;
      })}
      {du !== null && du !== 0 && <line x1={cx} y1={cy} x2={cx + du} y2={cy} stroke="#b45309" strokeWidth={2} strokeDasharray="5 3" markerEnd={`url(#cB${c.siloId})`} />}
      {dv !== null && dv !== 0 && <line x1={cx} y1={cy} x2={cx} y2={cy + dv} stroke="#b45309" strokeWidth={2} strokeDasharray="5 3" markerEnd={`url(#cB${c.siloId})`} />}
      {c.magnitude !== null && du !== null && dv !== null && c.magnitude > 0 && (
        <line x1={cx} y1={cy} x2={cx + du} y2={cy + dv} stroke={COLORS.measured} strokeWidth={3.2} markerEnd={`url(#cA${c.siloId})`} />
      )}
      <circle cx={cx} cy={cy} r={3} fill={COLORS.text} />
      <text x={8} y={H - 8} fontSize={11} fill={COLORS.sub}>箭头放大 {mag}×，数值为真实 mm</text>
    </svg>
  );
}

export function CornersPage({ ctx }: { ctx: Ctx }) {
  const d = ctx.data;
  const f = useDistFilter(ctx);
  const [mag, setMag] = useLocalState<number>('corner-mag', 500);
  const tol = d.layout.sameElevTolerance;
  const ind = activeIndicator(d.indicators, 'corner-combo');
  const cornerIds = CORNER_ORDER.filter((id) => f.points.some((p) => p.siloId === id));

  return (
    <div className="page">
      <p className="mode-banner">角仓两测点组合位移示意：由同一角仓两个正交仓壁测点的修正后位移合成，<b>不是仓中心偏移</b>；中间五仓无直接观测点，不显示箭头。</p>
      {f.bar}
      {f.note && <p className="notice">{f.note}</p>}
      <div className="mag" style={{ marginBottom: 10 }}>箭头放大
        {[200, 500, 1000].map((m) => <button key={m} type="button" className={mag === m ? 'active' : ''} onClick={() => setMag(m)}>{m}×</button>)}
        <input type="range" min={1} max={2000} value={mag} onChange={(e) => setMag(Number(e.target.value))} aria-label="箭头放大倍数" /><b>{mag}×</b>
      </div>
      <div className="corner-grid">
        {cornerIds.map((id) => {
          const c = combineCorner(id, f.points, f.picked, tol);
          const silo = d.silos.find((s) => s.id === id)!;
          const e = c.uReading?.elevation ?? c.vReading?.elevation ?? null;
          const chk = checkIndicator(ind, 'corner-combo', c.magnitude, c.sameElevation ? e : null);
          return (
            <section key={id} className="corner-card">
              <h3 style={{ margin: '2px 0 6px' }}>{id} 号仓｜{positionLabel(silo)}</h3>
              <CornerSvg c={c} mag={mag} />
              <table className="data-table compact small">
                <tbody>
                  {[c.uPoint, c.vPoint].map((p, k) => {
                    if (!p) return null;
                    const r = (k === 0 ? c.uReading : c.vReading) as DistReading | null;
                    const cc = r ? calcReading(p, r) : null;
                    return (
                      <tr key={p.id}>
                        <th>{p.id}（{SIDE_FULL[p.side]}）</th>
                        <td>{r ? `${fmt(r.elevation, 2)} m · ${tm(r.time)}` : '无记录'}</td>
                        <td>{cc === null ? '—' : cc.component !== null ? `${cc.axis} ${fmtSigned(cc.component)} mm（${describeDrawing(cc.axis, cc.component)}）` : cc.raw !== null ? `Δ ${fmtSigned(cc.raw)} mm（原始，不输出方向）` : '差值无法计算'}</td>
                      </tr>
                    );
                  })}
                  <tr className="strong">
                    <th>组合位移示意</th>
                    <td colSpan={2}>{c.magnitude !== null
                      ? <>SQRT({fmtSigned(c.u)}² + {fmtSigned(c.v)}²) = <b>{fmt(c.magnitude)} mm</b>{d.layout.orientationConfirmed ? `（${describeProject(c.u!, c.v!, d.layout.axisRotationDeg, d.config.labels)}）` : ''}</>
                      : '不生成'}{c.notes.length ? <div className="text-warn">{c.notes.join('；')}</div> : null}</td>
                  </tr>
                  <tr><th>指标对照</th><td colSpan={2} className="small">{chk.applicable
                    ? `${ind!.name}：H = ${fmt(chk.H, 2)} m，允许 = MIN(H × ${ind!.ratioPermil}‰, ${ind!.cap ?? '不封顶'}) = ${fmt(chk.allowed, 1)} mm，${chk.exceeds ? '超过对照值' : '未超过对照值'}（须人工复核签认）`
                    : `${TARGET_TEXT['corner-combo']}：${chk.reason}`}</td></tr>
                </tbody>
              </table>
              <CornerHistory ctx={ctx} siloId={id} />
            </section>
          );
        })}
      </div>
    </div>
  );
}

/** 该角仓各标高的组合结果（只组合两点在同一标高都有有效分量的情况） */
function CornerHistory({ ctx, siloId }: { ctx: Ctx; siloId: string }) {
  const d = ctx.data;
  const pts = d.distPoints.filter((p) => p.siloId === siloId && p.active);
  const elevs = [...new Set(d.distReadings.filter((r) => pts.some((p) => p.id === r.pointId) && r.elevation !== null).map((r) => r.elevation as number))].sort((a, b) => b - a);
  if (elevs.length === 0) return null;
  return (
    <details className="small"><summary>各标高记录</summary>
      <table className="data-table compact">
        <thead><tr><th>标高 m</th><th>u mm</th><th>v mm</th><th>组合 mm</th></tr></thead>
        <tbody>
          {elevs.map((e) => {
            const c = combineCorner(siloId, pts, new Map(pts.map((p) => [p.id, d.distReadings.filter((r) => r.pointId === p.id && r.elevation === e).sort((a, b) => b.time.localeCompare(a.time))[0] ?? null])), 0);
            return <tr key={e}><td>{fmt(e, 2)}</td><td>{fmtSigned(c.u)}</td><td>{fmtSigned(c.v)}</td><td>{c.magnitude === null ? '—' : fmt(c.magnitude)}</td></tr>;
          })}
        </tbody>
      </table>
    </details>
  );
}

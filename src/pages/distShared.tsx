/** 八点模式共用：筛选、计算链文字、八点清单 */
import type { AppData } from '../model/types';
import type { DistPoint, DistReading } from '../model/distTypes';
import {
  POINT_STATUS_TEXT, SIDE_FULL, TARGET_TEXT, activeIndicator, calcReading, checkIndicator, describeDrawing, describeProject,
  pickReadings, pointStatus, previousReading, type PickMode, type PointStatus,
} from '../calc/distance';
import { positionLabel } from '../calc/layout';
import { fmt, fmtSigned } from '../calc/direction';
import { useLocalState } from '../components/useLocalState';
import type { Ctx } from './ctx';
import { tm } from './ctx';

export function distRounds(d: AppData) {
  return d.rounds.filter((r) => r.mode === 'distance');
}

export function siloRange(d: AppData, siloId: string): [number, number] | undefined {
  const s = d.silos.find((x) => x.id === siloId);
  return s ? [s.elevMin, s.elevMax] : undefined;
}

export function statusOf(d: AppData, p: DistPoint, r: DistReading | null): { status: PointStatus; reasons: string[] } {
  return pointStatus(p, r, r ? previousReading(d.distReadings, r) : null, d.config.jumpThresholdMm, siloRange(d, p.siloId));
}

/** 筛选：按轮次 / 目标标高 / 各点最近一次 */
export function useDistFilter(ctx: Ctx) {
  const d = ctx.data;
  const rounds = distRounds(d);
  const [kind, setKind] = useLocalState<'round' | 'elevation' | 'latest'>('dist-filter', 'round');
  const [roundSel, setRoundSel] = useLocalState<string>('dist-round', '');
  const [elevSel, setElevSel] = useLocalState<string>('dist-elev', '');
  const roundId = rounds.some((r) => r.id === roundSel) ? roundSel : rounds[rounds.length - 1]?.id ?? '';
  const elevs = [...new Set(d.distReadings.map((r) => r.elevation).filter((e): e is number => e !== null))].sort((a, b) => b - a);
  const elevation = elevSel !== '' && elevs.includes(Number(elevSel)) ? Number(elevSel) : elevs[0] ?? null;
  const tol = d.layout.sameElevTolerance;
  const mode: PickMode = kind === 'round' && roundId ? { kind: 'round', roundId }
    : kind === 'elevation' && elevation !== null ? { kind: 'elevation', elevation, tolerance: tol } : { kind: 'latest' };
  const points = d.distPoints.filter((p) => p.active);
  const picked = pickReadings(points, d.distReadings, mode);
  const bar = (
    <div className="toolbar">
      <div className="seg">
        <button type="button" className={kind === 'round' ? 'active' : ''} onClick={() => setKind('round')}>按轮次</button>
        <button type="button" className={kind === 'elevation' ? 'active' : ''} onClick={() => setKind('elevation')}>按目标标高</button>
        <button type="button" className={kind === 'latest' ? 'active' : ''} onClick={() => setKind('latest')}>各点最近一次</button>
      </div>
      {kind === 'round' && (
        <label>轮次
          <select value={roundId} onChange={(e) => setRoundSel(e.target.value)}>
            {rounds.length === 0 && <option value="">暂无轮次</option>}
            {rounds.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
        </label>
      )}
      {kind === 'elevation' && (
        <label>目标标高
          <select value={elevation ?? ''} onChange={(e) => setElevSel(e.target.value)}>
            {elevs.length === 0 && <option value="">暂无数据</option>}
            {elevs.map((e) => <option key={e} value={e}>{fmt(e, 2)} m</option>)}
          </select>
          {tol > 0 && <span className="muted small">容差 ±{tol} m</span>}
        </label>
      )}
    </div>
  );
  const note = kind === 'latest' ? '“各点最近一次”：各点标高、时间可能不同，已分别标出，不是同一截面。'
    : kind === 'round' ? '按轮次：同一轮内各点标高可能不同，图上分别标出实际标高。' : '';
  return { mode, picked, points, roundId, bar, note, kind };
}

/** 计算链：基准值 → 本次值 → 差值 → 修正值 → 方向 */
export function CalcChain({ ctx, point, reading }: { ctx: Ctx; point: DistPoint; reading: DistReading | null }) {
  const d = ctx.data;
  if (!reading) return <div className="chain muted">该点在当前筛选条件下没有记录。</div>;
  const c = calcReading(point, reading);
  const confirmed = d.layout.orientationConfirmed;
  const u = c.axis === 'u' ? c.component : 0, v = c.axis === 'v' ? c.component : 0;
  const ruleText = { left: 'u = +修正后', right: 'u = −修正后', up: 'v = −修正后', down: 'v = +修正后' }[point.side];
  const ind = activeIndicator(d.indicators, 'point-change');
  const chk = checkIndicator(ind, 'point-change', c.component, reading.elevation);
  return (
    <div className="chain">
      <div className="step"><b>{point.id}</b><span className="muted">{point.lineDesc || `${point.siloId} 号仓${SIDE_FULL[point.side]}基准线`}</span></div>
      <div className="step">
        基准值 <b>{fmt(point.baseDistance, 1)} mm</b>（{fmt(point.baseElevation, 2)} m）<span className="arrow">→</span>
        本次值 <b>{fmt(reading.distance, 1)} mm</b>（{fmt(reading.elevation, 2)} m，{tm(reading.time)}）
      </div>
      <div className="step">
        <span className="arrow">→</span> 差值 = 本次 − 基准 = <b>{c.raw === null ? '无法计算' : `${fmtSigned(c.raw)} mm`}</b>
      </div>
      <div className="step">
        <span className="arrow">→</span> 设计修正 <b>{c.design === null ? '未提供' : `${fmtSigned(c.design)} mm`}</b>
        {reading.designBasis && <span className="muted">（{reading.designBasis}）</span>}
        <span className="arrow">→</span> 修正后 = 差值 − 设计修正 = <b>{c.corrected === null ? '无法计算' : `${fmtSigned(c.corrected)} mm`}</b>
      </div>
      <div className="step">
        <span className="arrow">→</span> 方向：{SIDE_FULL[point.side]}点 {ruleText}
        {c.component !== null ? (
          <> = <b className="dir">{c.axis} {fmtSigned(c.component)} mm，{describeDrawing(c.axis, c.component)}</b>
            {confirmed
              ? <span>（项目方向：{describeProject(u ?? 0, v ?? 0, d.layout.axisRotationDeg, d.config.labels)}）</span>
              : <span className="muted">（项目方向未确认，不标东西南北）</span>}
          </>
        ) : <b className="blocked">　不输出方向结论：{c.blocked.join('；')}</b>}
      </div>
      <div className="step muted small">
        {chk.applicable
          ? <>指标对照（{TARGET_TEXT['point-change']}，{ind!.name}）：H = {fmt(chk.H, 2)} m，允许 = MIN(H × {ind!.ratioPermil}‰, {ind!.cap ?? '不封顶'}) = {fmt(chk.allowed, 1)} mm，
            本值 {fmt(Math.abs(c.component ?? 0), 1)} mm {chk.exceeds ? '超过对照值' : '未超过对照值'}（须人工复核签认）</>
          : <>指标对照：{chk.reason}</>}
      </div>
      <div className="review-line">测量：{reading.surveyor || '—'}　复核：{reading.reviewer ? `${reading.reviewer}（${tm(reading.reviewedAt)}）` : '未签认'}　有效状态：{{ valid: '有效', doubtful: '存疑', invalid: '无效' }[reading.validity]}</div>
    </div>
  );
}

/** 八点清单 */
export function PointChecklist({ ctx, picked, selected, onPick, roundId }: {
  ctx: Ctx; picked: Map<string, DistReading | null>; selected?: string | null; onPick?: (id: string) => void; roundId?: string | null;
}) {
  const d = ctx.data;
  const order = (roundId ? d.rounds.find((r) => r.id === roundId)?.order : null) ?? d.distPoints.map((p) => p.id);
  const pts = [...d.distPoints].filter((p) => p.active).sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
  return (
    <div className="point-list">
      {pts.map((p) => {
        const r = picked.get(p.id) ?? null;
        const st = statusOf(d, p, r);
        const c = r ? calcReading(p, r) : null;
        const silo = d.silos.find((s) => s.id === p.siloId);
        return (
          <button key={p.id} type="button" className={'pl-item' + (selected === p.id ? ' sel' : '')}
            onClick={() => (onPick ? onPick(p.id) : ctx.go(`/dentry/${encodeURIComponent(p.id)}${roundId ? '?round=' + roundId : ''}`))}>
            <span className="pl-id">{p.id}</span>
            <span className="pl-mid">
              {silo ? positionLabel(silo) : ''} · {SIDE_FULL[p.side]}
              <br />
              {r ? <>{fmt(r.elevation, 2)} m · {c!.component !== null ? `${c!.axis} ${fmtSigned(c!.component)} mm` : c!.raw !== null ? `Δ ${fmtSigned(c!.raw)} mm（原始）` : '差值无法计算'}</> : <span className="muted">无记录</span>}
              {p.baseDistance === null ? <><br /><span className="text-warn">未填写底部基准距离</span></>
                : !p.baseConfirmed || !p.directionConfirmed ? <><br /><span className="text-warn">基准或方向规则未确认</span></>
                : st.reasons.length > 0 && <><br /><span className="muted">{st.reasons[0]}</span></>}
            </span>
            <span className={'chip-st st-' + st.status}>{POINT_STATUS_TEXT[st.status]}</span>
          </button>
        );
      })}
    </div>
  );
}

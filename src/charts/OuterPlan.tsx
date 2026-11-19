/**
 * 外侧垂准点平面图：设计圆与测点按真实比例；平台平移箭头、各测点实测位移按放大倍数显示。
 * 测点位移 = t + θ·r·v（径向部分即平移，切向部分含扭转）。
 */
import type { AxisLabels, SiloDef } from '../model/types';
import type { PlatformMeasure } from '../calc/plumb';
import { CARDINAL_VEC, cardinalLabel, describeOffset, fmt, fmtSigned } from '../calc/direction';
import { offsetToSvg } from './geometry';
import { COLORS, FONT } from './theme';
import { northVector } from './geometry';

interface Props {
  silo: SiloDef;
  labels: AxisLabels;
  showNorth: boolean;
  northAngleDeg: number;
  measure: PlatformMeasure | null;
  mag: number;
  codeOf: (plateId: string) => string;
}

const W = 600, H = 700, CX = 300, CY = 300;

export function OuterPlan({ silo, labels: l, showNorth, northAngleDeg, measure: m, mag, codeOf }: Props) {
  const sol = m?.outer;
  const maxR = Math.max(silo.outerDiameter / 2, ...(sol?.points.map((p) => p.radiusMm / 1000) ?? [7]));
  const px = 215 / maxR; // px / m
  const R = (silo.outerDiameter / 2) * px, Ri = (silo.innerDiameter / 2) * px;
  const d = (x: number, y: number) => offsetToSvg(x, y, px, mag);
  const nv = northVector(northAngleDeg);
  const T = m && !m.basePending && m.x !== null && m.y !== null ? d(m.x, m.y) : null;
  const theta = m?.rotationDeg ?? null;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ maxWidth: W, display: 'block' }} fontFamily={FONT} xmlns="http://www.w3.org/2000/svg">
      <rect width={W} height={H} fill="#fff" />
      <defs>
        <marker id="opA" viewBox="0 0 10 10" refX="9" refY="5" markerUnits="userSpaceOnUse" markerWidth="12" markerHeight="12" orient="auto"><path d="M0,0 L10,5 L0,10 z" fill={COLORS.measured} /></marker>
        <marker id="opP" viewBox="0 0 10 10" refX="9" refY="5" markerUnits="userSpaceOnUse" markerWidth="10" markerHeight="10" orient="auto"><path d="M0,0 L10,5 L0,10 z" fill={COLORS.wall} /></marker>
        <marker id="opK" viewBox="0 0 10 10" refX="9" refY="5" markerUnits="userSpaceOnUse" markerWidth="12" markerHeight="12" orient="auto"><path d="M0,0 L10,5 L0,10 z" fill={COLORS.text} /></marker>
      </defs>
      <text x={14} y={24} fontSize={16} fontWeight={700} fill={COLORS.text}>平台平面图（外侧垂准点）</text>
      <text x={14} y={44} fontSize={12} fill={COLORS.sub}>
        {m ? `标高 ${fmt(m.elevation, 2)} m · ${m.time.replace('T', ' ')}` : '无记录'} · 位移放大 {mag}×，设计圆与测点位置为真实比例
      </text>

      <circle cx={CX} cy={CY} r={(R + Ri) / 2} fill="none" stroke={COLORS.designFill} strokeWidth={R - Ri} />
      <circle cx={CX} cy={CY} r={R} fill="none" stroke={COLORS.design} strokeWidth={1.5} />
      <circle cx={CX} cy={CY} r={Ri} fill="none" stroke={COLORS.design} strokeWidth={1} />
      <line x1={CX - 262} y1={CY} x2={CX + 262} y2={CY} stroke={COLORS.design} strokeDasharray="8 5" />
      <line x1={CX} y1={CY - 262} x2={CX} y2={CY + 262} stroke={COLORS.design} strokeDasharray="8 5" />
      <text x={CX + 266} y={CY + 4} fontSize={12} fill={COLORS.design} fontWeight={700}>+{l.xName}</text>
      <text x={CX} y={CY - 268} fontSize={12} fill={COLORS.design} fontWeight={700} textAnchor="middle">+{l.yName}</text>
      <circle cx={CX} cy={CY} r={3} fill={COLORS.design} />

      {/* 测点：设计位置（真实比例）与实测位移（放大） */}
      {sol?.points.map((p) => {
        const u = CARDINAL_VEC[p.side];
        const pos = { x: CX + u.x * (p.radiusMm / 1000) * px, y: CY - u.y * (p.radiusMm / 1000) * px };
        const disp = p.wx !== null && p.wy !== null ? d(p.wx, p.wy) : null;
        const lx = pos.x + (u.x === 0 ? 14 : u.x * 10), ly = pos.y + (u.y === 0 ? -14 : -u.y * 18);
        return (
          <g key={p.obs.id}>
            <path d={`M${pos.x},${pos.y + 12} l-7,10 h14 z`} fill="#fff" stroke={COLORS.sub} strokeWidth={1.2} />
            <rect x={pos.x - 6} y={pos.y - 6} width={12} height={12} fill="#fff" stroke={COLORS.wall} strokeWidth={2} />
            {disp && (disp.dx !== 0 || disp.dy !== 0) && (
              <line x1={pos.x} y1={pos.y} x2={pos.x + disp.dx} y2={pos.y + disp.dy} stroke={COLORS.wall} strokeWidth={2.2} markerEnd="url(#opP)" />
            )}
            <text x={lx} y={ly} fontSize={11.5} fill={COLORS.wall} fontWeight={700} textAnchor={u.x < 0 ? 'end' : 'start'}>{codeOf(p.obs.plateId)}</text>
          </g>
        );
      })}

      {/* 平台平移 */}
      {T && (m!.resultant ?? 0) > 0 && <line x1={CX} y1={CY} x2={CX + T.dx} y2={CY + T.dy} stroke={COLORS.measured} strokeWidth={3} markerEnd="url(#opA)" />}
      {T && <circle cx={CX + T.dx} cy={CY + T.dy} r={5} fill={COLORS.measured} />}

      {/* 扭转示意（方向） */}
      {theta !== null && Math.abs(theta) > 0.0005 && (() => {
        const rr = R * 0.55, a0 = -40, a1 = theta > 0 ? 40 : -120;
        const P = (a: number) => ({ x: CX + rr * Math.cos((a * Math.PI) / 180), y: CY - rr * Math.sin((a * Math.PI) / 180) });
        const s = P(theta > 0 ? a0 : 40), e = P(theta > 0 ? a1 : a0);
        return (
          <g>
            <path d={`M${s.x},${s.y} A${rr},${rr} 0 0 ${theta > 0 ? 0 : 1} ${e.x},${e.y}`} fill="none" stroke={COLORS.text} strokeWidth={1.6} markerEnd="url(#opK)" />
            <text x={CX + rr + 8} y={CY - 6} fontSize={12} fill={COLORS.text}>扭转 {fmtSigned(theta, 3)}°</text>
          </g>
        );
      })()}

      {/* 说明与数值 */}
      <g transform={`translate(14, ${H - 160})`}>
        <rect width={W - 28} height={148} rx={6} fill="#f7f9fc" stroke={COLORS.grid} />
        {!m ? <text x={12} y={24} fontSize={13} fill={COLORS.sub}>该仓暂无外侧垂准点记录</text> : (
          <>
            {sol!.points.map((p, i) => (
              <text key={i} x={12} y={20 + i * 18} fontSize={11.5} fill={COLORS.text}>
                {codeOf(p.obs.plateId)}（{cardinalLabel(p.side, l)}侧，r {fmt(p.radiusMm / 1000, 2)} m）：光斑读数 q = ({fmtSigned(p.qx)}, {fmtSigned(p.qy)})，测点位移 = ({fmtSigned(p.wx)}, {fmtSigned(p.wy)}) mm
              </text>
            ))}
            <text x={12} y={24 + sol!.points.length * 18} fontSize={12.5} fill={COLORS.text}>
              平移取各点径向：({fmtSigned(m.x)}, {fmtSigned(m.y)}) mm{m.resultant !== null ? `，合成 ${fmt(m.resultant)} mm` : ''}
              {sol!.residualMax !== null ? `；校核闭合差 ${fmt(sol!.residualMax)} mm` : ''}
            </text>
            <text x={12} y={46 + sol!.points.length * 18} fontSize={13} fontWeight={700} fill={COLORS.measured}>
              {m.basePending ? '基准待确认：测站或测点未确认，不输出平台偏移' : m.x === null && m.y === null ? '读数不足，无法解算' : `${silo.id} 号仓平台中心 ${describeOffset(m.x, m.y, l)}`}
            </text>
            <text x={12} y={66 + sol!.points.length * 18} fontSize={11} fill={COLORS.sub}>紫色方块：投影板设计位置；三角：地面测站；紫色箭头：测点实测位移（含扭转）。</text>
            <text x={12} y={82 + sol!.points.length * 18} fontSize={11} fill={COLORS.sub}>橙色箭头：平台中心平移（取各点径向读数，不受扭转影响）。放大只影响显示。</text>
          </>
        )}
      </g>
      {showNorth && (
        <g transform={`translate(${W - 44}, 70)`}>
          <circle r={24} fill="#fff" stroke={COLORS.grid} />
          <line x1={-nv.dx * 16} y1={-nv.dy * 16} x2={nv.dx * 18} y2={nv.dy * 18} stroke={COLORS.text} strokeWidth={2} markerEnd="url(#opK)" />
          <text x={nv.dx * 34} y={nv.dy * 34 + 5} fontSize={13} fontWeight={700} fill={COLORS.text} textAnchor="middle">北</text>
        </g>
      )}
    </svg>
  );
}

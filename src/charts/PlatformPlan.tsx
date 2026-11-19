/**
 * 单仓平台平面图：区分设计中心 D（= 光斑投影点）、投影板刻度原点 O、平台中心标记 M。
 * 以项目坐标绘制（+X 右，+Y 上）。设计圆真实比例；D、O、M 之间的距离按放大倍数显示。
 * 只有固定偏置已确认且 X、Y 读数齐全时才绘制 O、M；否则只文字说明，不补造位置。
 */
import type { AxisLabels, MeasurePoint, PlumbObs, SiloDef } from '../model/types';
import { describeOffset, fmt, fmtSigned } from '../calc/direction';
import { platformOffset } from '../calc/plumb';
import { northVector, offsetToSvg, planPxPerM } from './geometry';
import { COLORS, FONT } from './theme';

interface Props {
  silo: SiloDef;
  labels: AxisLabels;
  showNorth: boolean;
  northAngleDeg: number;
  obs: PlumbObs | null;
  mag: number;
  points: MeasurePoint[];
}

const W = 600, H = 660, CX = 300, CY = 320, R = 200;

export function PlatformPlan({ silo, labels: l, showNorth, northAngleDeg, obs, mag, points }: Props) {
  const px = planPxPerM(silo.outerDiameter, R);
  const rIn = (silo.innerDiameter / 2) * px;
  const res = obs ? platformOffset(obs) : null;
  const P = (x: number, y: number) => { const d = offsetToSvg(x, y, px, mag); return { x: CX + d.dx, y: CY + d.dy }; };
  const complete = res && !res.basePending && res.x !== null && res.y !== null;
  const M = complete ? P(res!.x!, res!.y!) : null;
  const O = complete ? P(res!.x! + (res!.bx as number), res!.y! + (res!.by as number)) : null;
  const nv = northVector(northAngleDeg);
  const shown = points.filter((p) => p.active && p.posX !== null && p.posY !== null && p.type !== 'plumb-plate' && p.type !== 'platform-mark');

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ maxWidth: W, display: 'block' }} fontFamily={FONT} xmlns="http://www.w3.org/2000/svg">
      <rect width={W} height={H} fill="#fff" />
      <defs>
        <marker id="ppArrow" viewBox="0 0 10 10" refX="9" refY="5" markerUnits="userSpaceOnUse" markerWidth="12" markerHeight="12" orient="auto">
          <path d="M0,0 L10,5 L0,10 z" fill={COLORS.measured} />
        </marker>
        <marker id="ppK" viewBox="0 0 10 10" refX="9" refY="5" markerUnits="userSpaceOnUse" markerWidth="12" markerHeight="12" orient="auto">
          <path d="M0,0 L10,5 L0,10 z" fill={COLORS.text} />
        </marker>
      </defs>
      <text x={14} y={24} fontSize={16} fontWeight={700} fill={COLORS.text}>平台中心平面图（垂准仪）</text>
      <text x={14} y={44} fontSize={12} fill={COLORS.sub}>
        {obs ? `标高 ${fmt(obs.elevation, 2)} m · ${obs.time.replace('T', ' ')}` : '无记录'} · 点间距离放大 {mag}×，设计圆真实比例
      </text>

      <circle cx={CX} cy={CY} r={(R + rIn) / 2} fill="none" stroke={COLORS.designFill} strokeWidth={R - rIn} />
      <circle cx={CX} cy={CY} r={R} fill="none" stroke={COLORS.design} strokeWidth={1.5} />
      <circle cx={CX} cy={CY} r={rIn} fill="none" stroke={COLORS.design} strokeWidth={1} />
      <line x1={CX - 250} y1={CY} x2={CX + 250} y2={CY} stroke={COLORS.design} strokeDasharray="8 5" />
      <line x1={CX} y1={CY - 250} x2={CX} y2={CY + 250} stroke={COLORS.design} strokeDasharray="8 5" />
      <text x={CX + 254} y={CY + 4} fontSize={12.5} fill={COLORS.design} fontWeight={700}>+{l.xName}</text>
      <text x={CX + 254} y={CY + 20} fontSize={11} fill={COLORS.design}>{l.posX}</text>
      <text x={CX - 254} y={CY + 4} fontSize={11} fill={COLORS.design} textAnchor="end">{l.negX}</text>
      <text x={CX} y={CY - 256} fontSize={12.5} fill={COLORS.design} fontWeight={700} textAnchor="middle">+{l.yName} {l.posY}</text>
      <text x={CX} y={CY + 266} fontSize={11} fill={COLORS.design} textAnchor="middle">{l.negY}</text>

      {/* 已录入并确认的其他测点（真实比例位置，不放大） */}
      {shown.map((p) => {
        const q = { x: CX + (p.posX as number) * px, y: CY - (p.posY as number) * px };
        return <g key={p.id}><path d={`M${q.x},${q.y - 7} L${q.x - 6},${q.y + 5} L${q.x + 6},${q.y + 5} z`} fill="#fff" stroke={COLORS.sub} strokeWidth={1.4} /><text x={q.x + 8} y={q.y + 4} fontSize={10.5} fill={COLORS.sub}>{p.code}</text></g>;
      })}

      {/* D：设计中心 = 光斑投影点 */}
      <circle cx={CX} cy={CY} r={9} fill="none" stroke="#1a9e5a" strokeWidth={2} />
      <circle cx={CX} cy={CY} r={3} fill={COLORS.design} />
      {O && M && (
        <>
          {/* b：O 相对 M */}
          <line x1={M.x} y1={M.y} x2={O.x} y2={O.y} stroke={COLORS.wall} strokeWidth={1.4} strokeDasharray="4 3" />
          <rect x={O.x - 6} y={O.y - 6} width={12} height={12} fill="#fff" stroke={COLORS.wall} strokeWidth={2} />
          {/* q：光斑相对 O */}
          <line x1={O.x} y1={O.y} x2={CX} y2={CY} stroke="#1a9e5a" strokeWidth={1.2} strokeDasharray="2 3" />
          {/* 平台中心偏移 */}
          {(res!.resultant ?? 0) > 0 && <line x1={CX} y1={CY} x2={M.x} y2={M.y} stroke={COLORS.measured} strokeWidth={3} markerEnd="url(#ppArrow)" />}
          <circle cx={M.x} cy={M.y} r={6} fill={COLORS.measured} stroke="#fff" strokeWidth={1.5} />
          <text x={M.x + 10} y={M.y - 8} fontSize={11.5} fill={COLORS.measured} fontWeight={700}>M 平台中心</text>
          <text x={O.x + 10} y={O.y + 14} fontSize={11.5} fill={COLORS.wall}>O 刻度原点</text>
        </>
      )}
      <text x={CX - 12} y={CY + 24} fontSize={11.5} fill="#1a9e5a" textAnchor="end">D 设计中心 / 光斑</text>

      {/* 计算过程 */}
      <g transform={`translate(14, ${H - 118})`}>
        <rect width={W - 28} height={104} rx={6} fill="#f7f9fc" stroke={COLORS.grid} />
        {!obs ? (
          <text x={12} y={24} fontSize={13} fill={COLORS.sub}>该仓暂无垂准仪记录</text>
        ) : (
          <>
            <text x={12} y={22} fontSize={12.5} fill={COLORS.text}>
              光斑读数 q = ({fmtSigned(res!.qx)}, {fmtSigned(res!.qy)}) mm　固定偏置 b = ({fmtSigned(res!.bx)}, {fmtSigned(res!.by)}) mm{obs.bConfirmed ? '' : '（未确认）'}
            </text>
            {res!.basePending ? (
              <text x={12} y={46} fontSize={13} fontWeight={700} fill="#9a5b00">基准待确认：固定偏置未确认，不输出平台中心偏移</text>
            ) : (
              <>
                <text x={12} y={46} fontSize={12.5} fill={COLORS.text}>
                  平台中心偏移 = −(q + b) = ({fmtSigned(res!.x)}, {fmtSigned(res!.y)}) mm
                  {res!.resultant !== null ? `，合成 ${fmt(res!.resultant)} mm` : '，缺少一个方向，不计算合成'}
                </text>
                <text x={12} y={68} fontSize={13} fontWeight={700} fill={COLORS.measured}>{silo.id} 号仓平台中心 {describeOffset(res!.x, res!.y, l)}</text>
              </>
            )}
            <text x={12} y={92} fontSize={11} fill={COLORS.sub}>
              {complete ? '绿圈 D、紫方块 O、橙点 M 的相对位置放大显示；' : '读数不全或基准未确认，不绘制 O、M 位置；'}放大只影响显示，不改变数值。
            </text>
          </>
        )}
      </g>
      {showNorth && (
        <g transform={`translate(${W - 44}, 70)`}>
          <circle r={24} fill="#fff" stroke={COLORS.grid} />
          <line x1={-nv.dx * 16} y1={-nv.dy * 16} x2={nv.dx * 18} y2={nv.dy * 18} stroke={COLORS.text} strokeWidth={2} markerEnd="url(#ppK)" />
          <text x={nv.dx * 34} y={nv.dy * 34 + 5} fontSize={13} fontWeight={700} fill={COLORS.text} textAnchor="middle">北</text>
        </g>
      )}
    </svg>
  );
}

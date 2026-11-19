/**
 * 平面图：设计圆按真实比例绘制；实测中心偏移按“显示放大倍数”放大，数值始终为真实值。
 * 仅在 X、Y 同时有效时绘制中心点；单方向数据只画该方向分量与可能位置线。
 * 所有样式写在属性上，保证导出图片时样式不丢失。
 */
import type { Ref } from 'react';
import type { CenterObs, ProjectConfig } from '../model/types';
import { describeOffset, fmt, fmtSigned } from '../calc/direction';
import { STATUS_TEXT, latestPerElevation } from '../calc/center';
import type { Level } from '../calc/compare';
import { niceStep, northVector, offsetToSvg, planPxPerM } from './geometry';
import { obsTip, type TipHandler } from './tips';
import { COLORS, FONT } from './theme';

interface Props {
  config: ProjectConfig;
  siloId: string;
  obs: CenterObs[];
  focus: CenterObs | null;
  showTrack: boolean;
  mag: number;
  selectedKey: string | null;
  levelOf: (o: CenterObs) => Level;
  onSelect: (key: string) => void;
  onTip: TipHandler;
  svgRef?: Ref<SVGSVGElement>;
  /** 方向未确认时不显示北向箭头 */
  showNorth?: boolean;
}

const W = 640, H = 720, CX = 320, CY = 340, R_OUT = 200, LIMIT = 255;

export function PlanView({ config, siloId, obs, focus, showTrack, mag, selectedKey, levelOf, onSelect, onTip, svgRef, showNorth = true }: Props) {
  const l = config.labels;
  const px = planPxPerM(config.outerDiameter, R_OUT);
  const rIn = (config.innerDiameter / 2) * px;
  const P = (x: number, y: number) => {
    const d = offsetToSvg(x, y, px, mag);
    return { x: CX + d.dx, y: CY + d.dy, out: Math.abs(d.dx) > LIMIT || Math.abs(d.dy) > LIMIT };
  };
  const track = showTrack ? latestPerElevation(obs.filter((o) => o.status === 'complete')) : [];
  const nv = northVector(config.northAngleDeg);
  // 比例尺：选择一个显示长度 50~140 px 的整数 mm
  const pxPerMm = (px * mag) / 1000;
  let barMm = niceStep(90 / pxPerMm, 1);
  if (barMm * pxPerMm > 150) barMm /= 2;
  const barPx = barMm * pxPerMm;
  const pointColor = (o: CenterObs) => {
    const lv = levelOf(o);
    return lv === 'none' ? COLORS.measured : COLORS.alert;
  };

  let anyOut = false;
  const focusP = focus && focus.x !== null && focus.y !== null ? P(focus.x, focus.y) : null;
  if (focusP?.out) anyOut = true;
  for (const o of track) if (P(o.x!, o.y!).out) anyOut = true;

  return (
    <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} width="100%" style={{ maxWidth: W, display: 'block' }}
      fontFamily={FONT} xmlns="http://www.w3.org/2000/svg">
      <rect x={0} y={0} width={W} height={H} fill="#ffffff" />
      <defs>
        <marker id="arrowO" viewBox="0 0 10 10" refX="9" refY="5" markerUnits="userSpaceOnUse" markerWidth="13" markerHeight="13" orient="auto-start-reverse">
          <path d="M0,0 L10,5 L0,10 z" fill={COLORS.measured} />
        </marker>
        <marker id="arrowR" viewBox="0 0 10 10" refX="9" refY="5" markerUnits="userSpaceOnUse" markerWidth="13" markerHeight="13" orient="auto-start-reverse">
          <path d="M0,0 L10,5 L0,10 z" fill={COLORS.alert} />
        </marker>
        <marker id="arrowK" viewBox="0 0 10 10" refX="9" refY="5" markerUnits="userSpaceOnUse" markerWidth="14" markerHeight="14" orient="auto">
          <path d="M0,0 L10,5 L0,10 z" fill={COLORS.text} />
        </marker>
        <clipPath id="planClip"><rect x={10} y={52} width={W - 20} height={H - 160} /></clipPath>
      </defs>
      <text x={16} y={26} fontSize={17} fontWeight={700} fill={COLORS.text}>筒仓 {siloId} · 平面图</text>
      <text x={16} y={46} fontSize={12} fill={COLORS.sub}>
        {focus ? `所选标高 ${fmt(focus.elevation, 2)} m · ${focus.time.replace('T', ' ')}` : '未选择标高'}
        {showTrack ? ' · 叠加各标高最新中心轨迹' : ''}
      </text>

      {/* 设计圆（真实比例） */}
      <circle cx={CX} cy={CY} r={(R_OUT + rIn) / 2} fill="none" stroke={COLORS.designFill} strokeWidth={R_OUT - rIn} />
      <circle cx={CX} cy={CY} r={R_OUT} fill="none" stroke={COLORS.design} strokeWidth={1.6} />
      <circle cx={CX} cy={CY} r={rIn} fill="none" stroke={COLORS.design} strokeWidth={1} />
      {/* 设计中心十字线 */}
      <line x1={CX - 255} y1={CY} x2={CX + 255} y2={CY} stroke={COLORS.design} strokeWidth={1} strokeDasharray="8 5" />
      <line x1={CX} y1={CY - 255} x2={CX} y2={CY + 255} stroke={COLORS.design} strokeWidth={1} strokeDasharray="8 5" />
      <text x={CX + 260} y={CY + 4} fontSize={13} fill={COLORS.design} fontWeight={700}>+{l.xName} {l.posX}</text>
      <text x={CX - 260} y={CY + 4} fontSize={13} fill={COLORS.design} fontWeight={700} textAnchor="end">{l.negX}</text>
      <text x={CX} y={CY - 261} fontSize={13} fill={COLORS.design} fontWeight={700} textAnchor="middle">+{l.yName} {l.posY}</text>
      <text x={CX} y={CY + 272} fontSize={13} fill={COLORS.design} fontWeight={700} textAnchor="middle">{l.negY}</text>
      <text x={CX + 6} y={CY + 16} fontSize={11} fill={COLORS.design}>设计中心</text>
      <text x={CX + R_OUT * 0.72} y={CY + R_OUT * 0.72 + 18} fontSize={11} fill={COLORS.design}>
        外径 {config.outerDiameter} m / 内径 {config.innerDiameter} m
      </text>

      {/* 北向箭头 */}
      {showNorth && <g transform={`translate(${W - 50}, 90)`}>
        <circle r={26} fill="#fff" stroke={COLORS.grid} />
        <line x1={-nv.dx * 18} y1={-nv.dy * 18} x2={nv.dx * 20} y2={nv.dy * 20} stroke={COLORS.text} strokeWidth={2} markerEnd="url(#arrowK)" />
        <text x={nv.dx * 38} y={nv.dy * 38 + 5} fontSize={14} fontWeight={700} fill={COLORS.text} textAnchor="middle">北</text>
      </g>}

      <g clipPath="url(#planClip)">
        {/* 轨迹 */}
        {track.length > 1 && (
          <polyline points={track.map((o) => { const p = P(o.x!, o.y!); return `${p.x},${p.y}`; }).join(' ')}
            fill="none" stroke={COLORS.measured} strokeWidth={1.2} strokeDasharray="4 3" opacity={0.8} />
        )}
        {(() => { let last: { x: number; y: number } | null = null; return track.map((o) => {
          const p = P(o.x!, o.y!);
          const showLabel = !last || Math.hypot(p.x - last.x, p.y - last.y) > 28;
          if (showLabel) last = p;
          const sel = o.key === selectedKey;
          return (
            <g key={o.key} style={{ cursor: 'pointer' }}
              onClick={(e) => { onSelect(o.key); onTip(obsTip(o, l), e, true); }}
              onMouseEnter={(e) => onTip(obsTip(o, l), e)} onMouseLeave={() => onTip(null)}>
              <circle cx={p.x} cy={p.y} r={sel ? 7 : 5} fill={sel ? pointColor(o) : '#fff'} stroke={pointColor(o)} strokeWidth={2} />
              <circle cx={p.x} cy={p.y} r={12} fill="transparent" />
              {showLabel && <text x={p.x + 8} y={p.y - 7} fontSize={10.5} fill={COLORS.sub}>{fmt(o.elevation, 1)}m</text>}
            </g>
          );
        }); })()}

        {/* 所选标高的中心 */}
        {focus && focusP && (
          <g style={{ cursor: 'pointer' }} onClick={(e) => { onSelect(focus.key); onTip(obsTip(focus, l), e, true); }}
            onMouseEnter={(e) => onTip(obsTip(focus, l), e)} onMouseLeave={() => onTip(null)}>
            {(focus.resultant ?? 0) > 0 && (
              <line x1={CX} y1={CY} x2={focusP.x} y2={focusP.y} stroke={pointColor(focus)} strokeWidth={3}
                markerEnd={levelOf(focus) === 'none' ? 'url(#arrowO)' : 'url(#arrowR)'} />
            )}
            <circle cx={focusP.x} cy={focusP.y} r={6} fill={pointColor(focus)} stroke="#fff" strokeWidth={1.5} />
            <circle cx={focusP.x} cy={focusP.y} r={14} fill="transparent" />
          </g>
        )}
        {/* 单方向数据：只画该方向分量和“可能位置线”，不生成中心点 */}
        {focus && focus.status === 'x-only' && (() => {
          const p = P(focus.x!, 0);
          return (
            <g>
              <line x1={p.x} y1={CY - 240} x2={p.x} y2={CY + 240} stroke={COLORS.measured} strokeWidth={1.4} strokeDasharray="6 5" />
              {focus.x !== 0 && <line x1={CX} y1={CY} x2={p.x} y2={CY} stroke={COLORS.measured} strokeWidth={3} markerEnd="url(#arrowO)" />}
              <text x={p.x + 6} y={CY - 222} fontSize={11.5} fill={COLORS.measured}>中心 {l.xName} 位置线（{l.yName} 未知）</text>
            </g>
          );
        })()}
        {focus && focus.status === 'y-only' && (() => {
          const p = P(0, focus.y!);
          return (
            <g>
              <line x1={CX - 240} y1={p.y} x2={CX + 240} y2={p.y} stroke={COLORS.measured} strokeWidth={1.4} strokeDasharray="6 5" />
              {focus.y !== 0 && <line x1={CX} y1={CY} x2={CX} y2={p.y} stroke={COLORS.measured} strokeWidth={3} markerEnd="url(#arrowO)" />}
              <text x={CX - 236} y={p.y - 6} fontSize={11.5} fill={COLORS.measured}>中心 {l.yName} 位置线（{l.xName} 未知）</text>
            </g>
          );
        })()}
      </g>

      {/* 数值标注框（真实值） */}
      {focus && (
        <g transform="translate(16, 60)">
          <rect width={250} height={focus.status === 'complete' ? 92 : 74} rx={6} fill="#ffffff" stroke={COLORS.grid} opacity={0.95} />
          {focus.status === 'insufficient' ? (
            <>
              <text x={10} y={22} fontSize={13} fontWeight={700} fill={COLORS.text}>中心偏移数据不足</text>
              <text x={10} y={42} fontSize={11.5} fill={COLORS.sub}>该标高只有单侧测点读数，</text>
              <text x={10} y={60} fontSize={11.5} fill={COLORS.sub}>不绘制中心点，见“局部读数视图”。</text>
            </>
          ) : (
            <>
              <text x={10} y={22} fontSize={13} fill={COLORS.text}>{l.xName} = <tspan fontWeight={700}>{focus.x === null ? '数据不足' : fmtSigned(focus.x) + ' mm'}</tspan></text>
              <text x={10} y={42} fontSize={13} fill={COLORS.text}>{l.yName} = <tspan fontWeight={700}>{focus.y === null ? '数据不足' : fmtSigned(focus.y) + ' mm'}</tspan></text>
              {focus.status === 'complete' ? (
                <>
                  <text x={10} y={62} fontSize={13} fill={COLORS.text}>合成 = <tspan fontWeight={700}>{fmt(focus.resultant)} mm</tspan></text>
                  <text x={10} y={81} fontSize={11.5} fill={COLORS.sub}>{describeOffset(focus.x, focus.y, l)}</text>
                </>
              ) : (
                <text x={10} y={62} fontSize={11.5} fill={COLORS.sub}>{STATUS_TEXT[focus.status]}，不计算合成值</text>
              )}
            </>
          )}
        </g>
      )}
      {anyOut && (
        <text x={W / 2} y={H - 104} fontSize={12} fill={COLORS.text} textAnchor="middle">部分点放大后超出图幅，请降低放大倍数</text>
      )}

      {/* 图例与说明 */}
      <g transform={`translate(16, ${H - 92})`}>
        <line x1={0} y1={0} x2={26} y2={0} stroke={COLORS.design} strokeWidth={2} />
        <text x={32} y={4} fontSize={12} fill={COLORS.text}>设计圆与设计中心（真实比例）</text>
        <line x1={230} y1={0} x2={256} y2={0} stroke={COLORS.measured} strokeWidth={3} markerEnd="url(#arrowO)" />
        <text x={264} y={4} fontSize={12} fill={COLORS.text}>实测中心偏移（显示放大 {mag}×）</text>
        <line x1={0} y1={24} x2={barPx} y2={24} stroke={COLORS.measured} strokeWidth={3} />
        <line x1={0} y1={18} x2={0} y2={30} stroke={COLORS.measured} strokeWidth={1.5} />
        <line x1={barPx} y1={18} x2={barPx} y2={30} stroke={COLORS.measured} strokeWidth={1.5} />
        <text x={barPx + 8} y={28} fontSize={12} fill={COLORS.text}>= {barMm} mm 偏移（放大 {mag}× 后的显示长度）</text>
        <text x={0} y={52} fontSize={11.5} fill={COLORS.sub}>
          +{l.xName} = {l.posX}，+{l.yName} = {l.posY}；标高 m，偏移 mm。标注数值均为真实值，放大只改变箭头与轨迹显示。
        </text>
        <text x={0} y={70} fontSize={11.5} fill={COLORS.sub}>图形由录入数据生成，不能代替测量复核或工程验收结论。</text>
      </g>
    </svg>
  );
}

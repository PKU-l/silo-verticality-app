/**
 * 九仓总览平面图（按图纸方向绘制）。
 * - 仓号位置固定：上排 12 11 10，中排 15 14 13，下排 18 17 16；两种显示方式位置一致。
 * - 设计圆按真实尺寸；偏移箭头统一放大，真实数值始终标注。
 * - 无数据显示“未观测 / 该标高无数据”，不画成零偏移。
 * - 方向未确认时不标注东西南北。
 */
import type { AxisLabels, LayoutConfig, SiloDef } from '../model/types';
import type { Cell } from '../calc/overview';
import { CELL_TEXT } from '../calc/overview';
import { placeSilos, positionLabel, projToDrawing } from '../calc/layout';
import { fmt, fmtSigned } from '../calc/direction';
import type { Level } from '../calc/compare';
import { COLORS, FONT } from './theme';
import { northVector } from './geometry';

interface Props {
  silos: SiloDef[];
  layout: LayoutConfig;
  cells: Cell[];
  labels: AxisLabels;
  northAngleDeg: number;
  mag: number;
  latestMode: boolean;
  drawingMode: 'simple' | 'reference';
  sourceLabel: string;
  levelOf: (c: Cell) => Level;
  onOpen: (siloId: string) => void;
}

export function OverviewChart({ silos, layout, cells, labels: l, northAngleDeg, mag, latestMode, drawingMode, sourceLabel, levelOf, onOpen }: Props) {
  const { placed, mode } = placeSilos(silos, layout);
  const R = Math.max(...silos.map((s) => s.outerDiameter)) / 2;
  const margin = R * 0.45;
  const minX = Math.min(...placed.map((p) => p.x)) - R - margin, maxX = Math.max(...placed.map((p) => p.x)) + R + margin;
  const minY = Math.min(...placed.map((p) => p.y)) - R - margin, maxY = Math.max(...placed.map((p) => p.y)) + R + margin;
  const W = 900;
  const k = W / (maxX - minX); // px / m
  const head = 96, foot = 70;
  const H = head + (maxY - minY) * k + foot;
  const X = (m: number) => (m - minX) * k;
  const Y = (m: number) => head + (m - minY) * k;
  const cellOf = (id: string) => cells.find((c) => c.silo.id === id)!;
  const pxPerMm = (k * mag) / 1000;
  const ref = drawingMode === 'reference';
  const nv = northVector(northAngleDeg + layout.axisRotationDeg);
  const ax = projToDrawing(1, 0, layout.axisRotationDeg), ay = projToDrawing(0, 1, layout.axisRotationDeg);

  // 相邻仓（图纸行列相邻）之间的连接关系，仅用于图纸参考结构线
  const neighbors: [typeof placed[number], typeof placed[number]][] = [];
  for (const a of placed) for (const b of placed) {
    if ((a.silo.row === b.silo.row && b.silo.col === a.silo.col + 1) || (a.silo.col === b.silo.col && b.silo.row === a.silo.row + 1)) neighbors.push([a, b]);
  }

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: 'block' }} fontFamily={FONT} xmlns="http://www.w3.org/2000/svg">
      <rect width={W} height={H} fill="#fff" />
      <defs>
        <marker id="ovArrow" viewBox="0 0 10 10" refX="9" refY="5" markerUnits="userSpaceOnUse" markerWidth="12" markerHeight="12" orient="auto">
          <path d="M0,0 L10,5 L0,10 z" fill={COLORS.measured} />
        </marker>
        <marker id="ovArrowR" viewBox="0 0 10 10" refX="9" refY="5" markerUnits="userSpaceOnUse" markerWidth="12" markerHeight="12" orient="auto">
          <path d="M0,0 L10,5 L0,10 z" fill={COLORS.alert} />
        </marker>
        <marker id="axArrow" viewBox="0 0 10 10" refX="9" refY="5" markerUnits="userSpaceOnUse" markerWidth="9" markerHeight="9" orient="auto">
          <path d="M0,0 L10,5 L0,10 z" fill={COLORS.text} />
        </marker>
      </defs>

      {/* 顶部说明 */}
      <text x={14} y={24} fontSize={17} fontWeight={700} fill={COLORS.text}>九仓总览 · {sourceLabel}</text>
      <text x={14} y={46} fontSize={13} fill={COLORS.text}>
        偏移箭头已放大 <tspan fontWeight={700} fill={COLORS.measured}>{mag}×</tspan>（九仓统一），标注数值为真实值（mm）；设计圆为真实尺寸
      </text>
      {latestMode && (
        <text x={14} y={66} fontSize={12.5} fill={COLORS.text} fontWeight={700}>“各仓最近一次观测”：各仓标高、时间可能不同，不是同一截面</text>
      )}
      {mode === 'schematic' && (
        <g transform={`translate(${W - 262}, 12)`}>
          <rect width={250} height={30} rx={5} fill="#fff1d6" stroke="#e0a526" />
          <text x={125} y={20} fontSize={14} fontWeight={700} fill="#7a4a00" textAnchor="middle">示意布置，非按比例绘制</text>
        </g>
      )}
      {!layout.orientationConfirmed && (
        <text x={W - 14} y={62} fontSize={11.5} fill={COLORS.sub} textAnchor="end">方向未确认：按图纸上/下/左/右显示，不标注东西南北</text>
      )}

      {/* 图纸参考：用户底图与浅灰结构线 */}
      {ref && layout.bgImage && (
        <image href={layout.bgImage} opacity={layout.bgOpacity}
          x={X(minX) + layout.bgOffsetX * W / 100} y={Y(minY) + layout.bgOffsetY * W / 100}
          width={(maxX - minX) * k * layout.bgScale} height={(maxY - minY) * k * layout.bgScale} preserveAspectRatio="none" />
      )}
      {ref && (
        <g stroke={COLORS.structure} fill="none">
          <rect x={X(minX + margin * 0.35)} y={Y(minY + margin * 0.35)} width={(maxX - minX - margin * 0.7) * k} height={(maxY - minY - margin * 0.7) * k} strokeWidth={1.5} />
          {/* 通过仓中心的轴线 */}
          {[...new Set(placed.map((p) => p.x))].map((x) => <line key={'vx' + x} x1={X(x)} y1={Y(minY)} x2={X(x)} y2={Y(maxY)} strokeDasharray="14 4 2 4" strokeWidth={0.8} />)}
          {[...new Set(placed.map((p) => p.y))].map((y) => <line key={'hy' + y} x1={X(minX)} y1={Y(y)} x2={X(maxX)} y2={Y(y)} strokeDasharray="14 4 2 4" strokeWidth={0.8} />)}
          {/* 相邻仓之间的连接墙与仓间区域 */}
          {neighbors.map(([a, b], i) => {
            const horiz = a.y === b.y;
            const w = 0.9; // 连接段半宽（m），示意
            if (horiz) {
              const x1 = a.x + a.silo.outerDiameter / 2 - 0.3, x2 = b.x - b.silo.outerDiameter / 2 + 0.3;
              if (x2 <= x1) return null;
              return <g key={i}><line x1={X(x1)} y1={Y(a.y - w)} x2={X(x2)} y2={Y(a.y - w)} strokeWidth={1.4} /><line x1={X(x1)} y1={Y(a.y + w)} x2={X(x2)} y2={Y(a.y + w)} strokeWidth={1.4} /></g>;
            }
            const y1 = a.y + a.silo.outerDiameter / 2 - 0.3, y2 = b.y - b.silo.outerDiameter / 2 + 0.3;
            if (y2 <= y1) return null;
            return <g key={i}><line x1={X(a.x - w)} y1={Y(y1)} x2={X(a.x - w)} y2={Y(y2)} strokeWidth={1.4} /><line x1={X(a.x + w)} y1={Y(y1)} x2={X(a.x + w)} y2={Y(y2)} strokeWidth={1.4} /></g>;
          })}
        </g>
      )}

      {placed.map(({ silo, x, y }) => {
        const c = cellOf(silo.id);
        const cx = X(x), cy = Y(y);
        const r = (silo.outerDiameter / 2) * k, ri = (silo.innerDiameter / 2) * k;
        const o = c.obs;
        const lv = levelOf(c);
        const col = lv === 'none' ? COLORS.measured : COLORS.alert;
        const vec = (vx: number, vy: number) => { const d = projToDrawing(vx, vy, layout.axisRotationDeg); return { dx: d.right * pxPerMm, dy: -d.up * pxPerMm }; };
        const full = o && o.x !== null && o.y !== null ? vec(o.x, o.y) : null;
        const onlyX = o && c.state === 'x-only' ? vec(o.x as number, 0) : null;
        const onlyY = o && c.state === 'y-only' ? vec(0, o.y as number) : null;
        const part = onlyX ?? onlyY;
        return (
          <g key={silo.id} style={{ cursor: 'pointer' }} onClick={() => onOpen(silo.id)} role="button" aria-label={`${silo.id} 号仓`}>
            {ref
              ? <circle cx={cx} cy={cy} r={(r + ri) / 2} fill="none" stroke="#e7eaee" strokeWidth={Math.max(2, r - ri)} />
              : null}
            <circle cx={cx} cy={cy} r={r} fill={ref ? 'none' : '#f7faff'} stroke={ref ? '#9aa4b0' : COLORS.design} strokeWidth={1.4} />
            <line x1={cx - 16} y1={cy} x2={cx + 16} y2={cy} stroke={COLORS.design} strokeWidth={1.2} />
            <line x1={cx} y1={cy - 16} x2={cx} y2={cy + 16} stroke={COLORS.design} strokeWidth={1.2} />
            <text x={cx} y={cy - r * 0.52} fontSize={30} fontWeight={800} fill={COLORS.text} textAnchor="middle">{silo.id}</text>
            <text x={cx} y={cy - r * 0.52 + 18} fontSize={11} fill={COLORS.sub} textAnchor="middle">{positionLabel(silo)}{silo.group ? ` · ${silo.group}` : ''}</text>

            {full && (full.dx !== 0 || full.dy !== 0) && (
              <line x1={cx} y1={cy} x2={cx + full.dx} y2={cy + full.dy} stroke={col} strokeWidth={3.2} markerEnd={lv === 'none' ? 'url(#ovArrow)' : 'url(#ovArrowR)'} />
            )}
            {full && <circle cx={cx + full.dx} cy={cy + full.dy} r={4} fill={col} />}
            {part && (part.dx !== 0 || part.dy !== 0) && (
              <line x1={cx} y1={cy} x2={cx + part.dx} y2={cy + part.dy} stroke={col} strokeWidth={3} strokeDasharray="6 4" markerEnd="url(#ovArrow)" />
            )}

            {/* 数值 */}
            <g transform={`translate(${cx}, ${cy + r * 0.34})`}>
              {c.state === 'ok' && o ? (
                <>
                  <text y={0} fontSize={13.5} fontWeight={700} fill={COLORS.text} textAnchor="middle">X {fmtSigned(o.x)}　Y {fmtSigned(o.y)}</text>
                  <text y={18} fontSize={13} fill={col} fontWeight={700} textAnchor="middle">合成 {fmt(o.resultant)} mm{lv !== 'none' ? '（超过指标对照值）' : ''}</text>
                  {o.rotationDeg != null && <text y={-18} fontSize={11.5} fill={COLORS.sub} textAnchor="middle">扭转 {fmtSigned(o.rotationDeg, 3)}°（外侧两点）</text>}
                </>
              ) : (c.state === 'x-only' || c.state === 'y-only') && o ? (
                <>
                  <text y={0} fontSize={13.5} fontWeight={700} fill={COLORS.text} textAnchor="middle">{c.state === 'x-only' ? `X ${fmtSigned(o.x)}` : `Y ${fmtSigned(o.y)}`}</text>
                  <text y={18} fontSize={12} fill={COLORS.sub} textAnchor="middle">{c.state === 'x-only' ? 'Y 未测，不计算合成' : 'X 未测，不计算合成'}</text>
                </>
              ) : (
                <>
                  <rect x={-62} y={-15} width={124} height={24} rx={4} fill={c.state === 'none' ? '#f1f3f5' : '#fff7e6'} stroke={COLORS.grid} />
                  <text y={2} fontSize={13} fontWeight={700} fill={COLORS.sub} textAnchor="middle">{CELL_TEXT[c.state]}</text>
                </>
              )}
              {o && (latestMode || c.state !== 'ok') && (
                <text y={36} fontSize={11.5} fill={COLORS.text} textAnchor="middle" fontWeight={latestMode ? 700 : 400}>
                  标高 {fmt(o.elevation, 2)} m · {o.time.slice(5).replace('T', ' ')}
                </text>
              )}
            </g>
          </g>
        );
      })}

      {/* 坐标方向示意 */}
      <g transform={`translate(${60}, ${H - 36})`}>
        <line x1={0} y1={0} x2={ax.right * 34} y2={-ax.up * 34} stroke={COLORS.text} strokeWidth={1.6} markerEnd="url(#axArrow)" />
        <text x={ax.right * 46} y={-ax.up * 46 + 4} fontSize={11.5} fill={COLORS.text} textAnchor="middle">+{l.xName}</text>
        <line x1={0} y1={0} x2={ay.right * 34} y2={-ay.up * 34} stroke={COLORS.text} strokeWidth={1.6} markerEnd="url(#axArrow)" />
        <text x={ay.right * 46} y={-ay.up * 46 + 4} fontSize={11.5} fill={COLORS.text} textAnchor="middle">+{l.yName}</text>
      </g>
      <text x={120} y={H - 38} fontSize={11.5} fill={COLORS.sub}>+{l.xName} = {l.posX}，+{l.yName} = {l.posY}{layout.orientationConfirmed ? '' : '（按图纸方向，未确认北向）'}</text>
      <text x={120} y={H - 20} fontSize={11.5} fill={COLORS.sub}>点击任一仓查看详情。图形由录入数据生成，不能代替测量复核或工程验收结论。</text>
      {layout.orientationConfirmed && (
        <g transform={`translate(${W - 40}, ${H - 40})`}>
          <circle r={24} fill="#fff" stroke={COLORS.grid} />
          <line x1={-nv.dx * 16} y1={-nv.dy * 16} x2={nv.dx * 18} y2={nv.dy * 18} stroke={COLORS.text} strokeWidth={2} markerEnd="url(#axArrow)" />
          <text x={nv.dx * 34} y={nv.dy * 34 + 5} fontSize={13} fontWeight={700} fill={COLORS.text} textAnchor="middle">北</text>
        </g>
      )}
    </svg>
  );
}

/**
 * 九仓布局：仓号按图纸方向固定（按项目平面图）
 *   上排 12 11 10
 *   中排 15 14 13
 *   下排 18 17 16
 * 图纸方向（上下左右）不等同于北南西东；项目坐标与图纸的夹角由用户配置。
 */
import type { AxisLabels, LayoutConfig, SiloDef } from '../model/types';

export const DEFAULT_GRID: string[][] = [
  ['12', '11', '10'],
  ['15', '14', '13'],
  ['18', '17', '16'],
];

export const VALID_SILO_IDS = DEFAULT_GRID.flat();

const ROW_NAME = ['上排', '中排', '下排'];
const COL_NAME = ['左列', '中列', '右列'];

export function positionLabel(s: Pick<SiloDef, 'row' | 'col'>): string {
  return `${ROW_NAME[s.row]}${COL_NAME[s.col]}`;
}

export function siloTitle(s: SiloDef): string {
  return `${s.id} 号仓｜${positionLabel(s)}${s.group ? `（${s.group}）` : ''}`;
}

/** 图纸方向的显示名称：方向未确认时使用 */
export const DRAWING_LABELS: AxisLabels = {
  posX: '图纸右', negX: '图纸左', posY: '图纸上', negY: '图纸下', xName: 'X', yName: 'Y',
};

/**
 * 项目坐标向量 → 图纸坐标向量（right, up）。
 * θ = 项目 +Y 相对图纸上方的顺时针角度。
 */
export function projToDrawing(vx: number, vy: number, thetaDeg: number): { right: number; up: number } {
  const t = (thetaDeg * Math.PI) / 180;
  const c = Math.cos(t), s = Math.sin(t);
  const right = vx * c + vy * s;
  const up = -vx * s + vy * c;
  return { right: Math.abs(right) < 1e-12 ? 0 : right, up: Math.abs(up) < 1e-12 ? 0 : up };
}

export interface PlacedSilo {
  silo: SiloDef;
  /** 图纸坐标（m），x 向右，y 向下（SVG 方向） */
  x: number;
  y: number;
}

export type PlacementMode = 'coords' | 'spacing' | 'schematic';

/**
 * 计算九仓在图纸坐标中的位置。
 *  - 所有仓都有设计中心坐标：按坐标（真实比例）
 *  - 配置了中心距：按行列 × 中心距（真实比例）
 *  - 否则：示意布置，非按比例绘制
 */
export function placeSilos(silos: SiloDef[], layout: LayoutConfig, schematicGapM?: number): { placed: PlacedSilo[]; mode: PlacementMode } {
  const allCoords = silos.length > 0 && silos.every((s) => s.centerX !== null && s.centerY !== null);
  if (allCoords) {
    const pts = silos.map((s) => {
      const d = projToDrawing(s.centerX as number, s.centerY as number, layout.axisRotationDeg);
      return { silo: s, x: d.right, y: -d.up };
    });
    const minX = Math.min(...pts.map((p) => p.x)), minY = Math.min(...pts.map((p) => p.y));
    return { placed: pts.map((p) => ({ ...p, x: p.x - minX, y: p.y - minY })), mode: 'coords' };
  }
  const D = Math.max(...silos.map((s) => s.outerDiameter), 1);
  if (layout.spacingX && layout.spacingY) {
    return { placed: silos.map((s) => ({ silo: s, x: s.col * layout.spacingX!, y: s.row * layout.spacingY! })), mode: 'spacing' };
  }
  const gap = schematicGapM !== undefined ? D + schematicGapM : D * 1.12;
  return { placed: silos.map((s) => ({ silo: s, x: s.col * gap, y: s.row * gap })), mode: 'schematic' };
}

/** 仓号是否属于本组筒仓 */
export function isValidSiloId(id: string, silos: SiloDef[]): boolean {
  return silos.some((s) => s.id === id.trim());
}

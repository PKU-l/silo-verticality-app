/**
 * 默认数据模式：八点仓壁距离差观测（只描述数据，不含计算）。
 *
 * 图纸坐标：向右为 u 正方向，向上为 v 正方向（图纸方向，不等同于东、北）。
 * 距离单位 mm，标高单位 m。
 */

/** 测点在所属仓上的图纸方位 */
export type DrawSide = 'up' | 'down' | 'left' | 'right';

/** 八个观测点之一（含其底部基准记录） */
export interface DistPoint {
  id: string; // 点号，如 '12-上'
  siloId: string;
  side: DrawSide;
  /** 底部基准记录 */
  baseElevation: number | null; // m
  baseDistance: number | null; // mm：底部仓壁至对应基准线的距离
  /** 基准关系确认：底部基准读数、基准线设置已复核 */
  baseConfirmed: boolean;
  /** 已确认：基准线位于该仓壁外侧，读数为“仓壁至基准线的距离”，方向规则适用 */
  directionConfirmed: boolean;
  /** 基准线说明，如“16 号仓上侧外壁外 150 mm 激光铅垂基准线” */
  lineDesc: string;
  surveyor: string;
  reviewer: string;
  reviewedAt: string;
  note: string;
  active: boolean;
  history?: { at: string; snapshot: Omit<DistPoint, 'history'> }[];
  demo?: boolean;
}

export type Validity = 'valid' | 'doubtful' | 'invalid';

/** 某点某次观测（原始数据，永久保留） */
export interface DistReading {
  id: string;
  pointId: string;
  roundId: string | null;
  time: string; // YYYY-MM-DDTHH:mm
  elevation: number | null; // m
  distance: number | null; // mm：该标高仓壁至同一基准线的距离
  /** 该标高相对基准标高的设计距离变化（mm）；null 表示未提供 */
  designChange: number | null;
  /** 设计修正值的依据（如“0～30 m 竖直仓壁，已确认设计位置不变”） */
  designBasis: string;
  validity: Validity;
  surveyor: string;
  reviewer: string;
  reviewedAt: string;
  note: string;
  history?: { at: string; snapshot: Omit<DistReading, 'history'> }[];
  demo?: boolean;
}

/** 指标适用的测量对象：不同对象不得混用同一结论 */
export type IndicatorTarget = 'point-change' | 'corner-combo' | 'platform-center' | 'structure-vertical';

/** 项目指标（由用户按批准文件配置，程序不内置任何数值） */
export interface Indicator {
  id: string;
  name: string;
  /** 比例（‰），如 1 表示 1‰：每 1 m 高度允许 1 mm */
  ratioPermil: number | null;
  /** 封顶值（mm），可空表示不封顶 */
  cap: number | null;
  /** 起算标高（m） */
  startElevation: number | null;
  target: IndicatorTarget;
  source: string; // 文件来源
  version: string;
  status: 'draft' | 'approved';
  approvedBy: string;
  approvedAt: string;
  note: string;
  history?: { at: string; snapshot: Omit<Indicator, 'history'> }[];
  demo?: boolean;
}

/** 设计仓壁位置不变（竖直仓壁）的确认：范围内设计距离变化可取 0 */
export interface VerticalWallConfig {
  confirmed: boolean;
  from: number; // m
  to: number; // m
  basis: string; // 依据
}

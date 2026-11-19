/**
 * 数据模型（只描述数据，不含计算）。
 * 坐标约定（内部固定，不随显示名称改变）：
 *   X 正向 = 图纸右方（默认“东”），Y 正向 = 图纸上方（默认“北”）。
 *   标高单位 m；水平偏移、读数单位 mm。
 */

/** 四个基本方位的内部代号：E=+X，W=−X，N=+Y，S=−Y */
import type { DistPoint, DistReading, Indicator, VerticalWallConfig } from './distTypes';
export type Cardinal = 'E' | 'W' | 'N' | 'S';
/** 观测线所在方位：四个基本方位之一，或“其他”（仅作局部读数，不参与中心换算） */
export type Side = Cardinal | 'OTHER';

/** 方向显示名称，可按项目轴线修改，所有图表同步使用 */
export interface AxisLabels {
  posX: string; // +X 方向名称，默认“东”
  negX: string; // −X，默认“西”
  posY: string; // +Y，默认“北”
  negY: string; // −Y，默认“南”
  xName: string; // X 轴名称，默认“X”
  yName: string; // Y 轴名称，默认“Y”
}

export interface ProjectConfig {
  projectName: string;
  outerDiameter: number; // m
  innerDiameter: number; // m
  wallHeight: number; // m，观测高度上限
  siloIds: string[];
  labels: AxisLabels;
  /** 真北方向相对 +Y 的角度（顺时针，度）。0 表示 +Y 即为北 */
  northAngleDeg: number;
  /** 同一测点前后读数突变提示阈值，mm */
  jumpThresholdMm: number;
  /** 外侧垂准点多点解算的校核残差提示值，mm */
  outerResidualMm?: number;
}

/** 方式 A：直接录入的中心偏移记录 */
export interface CenterRecord {
  id: string;
  siloId: string;
  time: string; // YYYY-MM-DDTHH:mm
  elevation: number | null; // m
  x: number | null; // mm，带符号，+ 为 posX 方向
  y: number | null; // mm，带符号，+ 为 posY 方向
  note: string;
  /** 导入时发现的问题（如单位混用），原样保留供核查 */
  flags?: string[];
  demo?: boolean;
}

/** 方式 B：观测线（铅垂线或其他固定基准）定义 */
export interface PlumbLine {
  id: string;
  siloId: string;
  name: string;
  /** 测点位于筒仓的哪一侧 */
  side: Side;
  /** side 为 OTHER 时的方位描述，如“东北 45°” */
  azimuthText: string;
  /** 基准位置描述，如“东侧仓壁外 150 mm 悬挂铅垂线” */
  basePosition: string;
  /**
   * 读数增大时，仓壁测点向哪个方向移动（必须与 side 同轴）。
   * 例：东侧铅垂线读数为“线到仓壁外表面距离”，读数增大 = 仓壁向西移动 → 'W'。
   * side 为 OTHER 时为 null。
   */
  positiveDir: Cardinal | null;
  /** side 为 OTHER 时，对读数增大方向的文字说明 */
  positiveText: string;
  /** 基准读数（仓壁处于设计位置时的读数），mm */
  baseReading: number | null;
  note: string;
  demo?: boolean;
}

/** 方式 B：某观测线在某标高的读数（原始数据，永久保留） */
export interface LineReading {
  id: string;
  lineId: string;
  time: string;
  elevation: number | null;
  reading: number | null; // mm
  note: string;
  flags?: string[];
  demo?: boolean;
}

/** 项目批准的阈值（由项目管理员填写） */
export interface ThresholdSet {
  resultantWarning: number | null;
  resultantControl: number | null;
  componentWarning: number | null;
  componentControl: number | null;
  source: string; // 阈值来源，如“专项方案 第 5.3 条”
  version: string;
  setBy: string;
  setAt: string;
}

export interface AppData {
  config: ProjectConfig;
  centerRecords: CenterRecord[];
  lines: PlumbLine[];
  readings: LineReading[];
  thresholds: ThresholdSet;
  silos: SiloDef[];
  layout: LayoutConfig;
  points: MeasurePoint[];
  plumbObs: PlumbObs[];
  rounds: Round[];
  sync: SyncConfig;
  /** 默认模式：八点仓壁距离差 */
  distPoints: DistPoint[];
  distReadings: DistReading[];
  indicators: Indicator[];
  verticalWall: VerticalWallConfig;
}

/* ---------------- 计算结果（派生数据，不持久化） ---------------- */

export type ObsStatus = 'complete' | 'x-only' | 'y-only' | 'insufficient';

export interface SideDetail {
  line: PlumbLine;
  reading: LineReading;
  /** 读数 − 基准读数，沿 positiveDir 方向的有符号位移，mm */
  along: number;
  /** 换算到 X、Y 的分量，mm */
  dx: number;
  dy: number;
}

/** 某筒仓、某观测批次、某标高的截面中心观测结果 */
export interface CenterObs {
  key: string;
  siloId: string;
  /** A/B：成型仓壁偏移；P：垂准仪平台偏移 */
  source: 'A' | 'B' | 'P';
  time: string;
  session: string; // 观测批次（日期）
  elevation: number;
  x: number | null;
  y: number | null;
  /** √(X²+Y²)，仅 X、Y 均有效时计算 */
  resultant: number | null;
  status: ObsStatus;
  /** 方式 B：X、Y 方向尺寸（直径）变化，mm */
  diamX?: number | null;
  diamY?: number | null;
  sides?: Partial<Record<Cardinal, SideDetail>>;
  /** 方式 B 中存在无法使用的情况说明（如同方位重复读数） */
  problems?: string[];
  /** 外侧垂准点解算：平台扭转角（°，逆时针为正）与最大校核残差（mm） */
  rotationDeg?: number | null;
  residual?: number | null;
  recordIds: string[];
  note: string;
}

/* ================= 九仓项目扩展 ================= */

/** 单座筒仓定义。row/col 为图纸方向的位置（row 0 = 图纸上排，col 0 = 图纸左列），程序不得自动重排 */
export interface SiloDef {
  id: string; // 仓号，如 '14'
  group: string; // 与实际 A/B/C 组编号的对应，如 'B2'，可空
  row: 0 | 1 | 2;
  col: 0 | 1 | 2;
  /** 设计中心在项目坐标中的位置（m），未提供为 null */
  centerX: number | null;
  centerY: number | null;
  outerDiameter: number; // m
  innerDiameter: number; // m
  elevMin: number; // 观测标高范围 m
  elevMax: number;
  note: string;
}

/** 九仓阵列与方向配置 */
export interface LayoutConfig {
  /** 相邻仓中心距（m），沿图纸左右、上下；未提供为 null（示意布置） */
  spacingX: number | null;
  spacingY: number | null;
  /** 项目 +Y 轴相对图纸“上方”的顺时针角度（°）。0 表示项目 +Y 指向图纸上方 */
  axisRotationDeg: number;
  /** 是否已按项目资料确认方向名称与北向；未确认时不显示东西南北 */
  orientationConfirmed: boolean;
  /** 比较“同一标高”时允许的标高差（m），默认 0 即严格相等 */
  sameElevTolerance: number;
  /** 图纸参考底图（用户上传，dataURL） */
  bgImage: string | null;
  bgOpacity: number;
  bgScale: number;
  bgOffsetX: number;
  bgOffsetY: number;
}

export type PointType = 'platform-mark' | 'plumb-plate' | 'outer-plumb' | 'wall-point';

/** 测点资料（平台中心标记、垂准仪投影板、仓壁观测点） */
export interface MeasurePoint {
  id: string;
  code: string; // 唯一编号
  siloId: string;
  type: PointType;
  azimuth: string; // 方位说明
  relation: string; // 基准关系说明
  /**
   * 固定偏置（mm，项目坐标）：
   *  - plumb-plate：b = 投影板刻度原点相对平台中心标记
   *  - outer-plumb：e = 地面测站 G 相对“投影板刻度原点设计位置的竖直投影”的偏差（通常为 0）
   */
  offsetX: number | null;
  offsetY: number | null;
  offsetConfirmed: boolean;
  /** outer-plumb：测点所在方位（由仓中心指向测点的方向，项目坐标轴） */
  side?: Cardinal | null;
  /** outer-plumb：投影板刻度原点到平台中心的水平距离（m） */
  radius?: number | null;
  active: boolean;
  /** 已录入并确认的测点平面位置（相对该仓设计中心，m），仅用于显示 */
  posX: number | null;
  posY: number | null;
  note: string;
  demo?: boolean;
}

export type Dir = 'pos' | 'neg';
export type SpotQuality = 'clear' | 'unstable' | 'doubtful';

/** 垂准仪观测记录（原始数据） */
export interface PlumbObs {
  id: string;
  siloId: string;
  roundId: string | null;
  time: string;
  elevation: number | null; // 平台标高 m
  plateId: string;
  /** 光斑相对投影板刻度原点的读数大小（mm，≥0）与方向；未读为 null */
  qx: number | null;
  qxDir: Dir | null;
  qy: number | null;
  qyDir: Dir | null;
  /** 保存时带入的固定偏置 b（mm）及其确认状态（快照） */
  bx: number | null;
  by: number | null;
  bConfirmed: boolean;
  quality: SpotQuality;
  surveyor: string;
  note: string;
  /** 外侧垂准点：同一次观测的多点记录共享 groupId；并快照测点方位与半径 */
  kind?: 'center' | 'outer';
  groupId?: string;
  side?: Cardinal | null;
  radius?: number | null;
  history?: { at: string; snapshot: Omit<PlumbObs, 'history'> }[];
  demo?: boolean;
}

/** 一轮观测 */
export interface Round {
  id: string;
  name: string;
  createdAt: string;
  order: string[]; // 观测顺序：垂准仪为仓号，八点模式为点号
  note: string;
  /** 轮次所属模式；缺省为垂准仪（旧数据） */
  mode?: 'plumb' | 'distance';
  demo?: boolean;
}

export interface SyncConfig {
  /** 同步方式：自建服务器（endpoint）或 Supabase */
  mode?: 'server' | 'supabase';
  endpoint: string; // 自建服务器地址，为空表示未配置
  supabaseUrl?: string; // 如 https://xxxx.supabase.co
  supabaseAnonKey?: string; // Supabase 公开 anon key
  token?: string; // 同步口令（导出备份时不包含）
}

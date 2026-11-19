/** 更多：设置、指标、数据与同步、可选模式 */
import type { Ctx } from './ctx';

export function MorePage({ ctx }: { ctx: Ctx }) {
  const n = ctx.sync.pending;
  return (
    <div className="page">
      <div className="more-list">
        <a href="#/bases">八点底部基准<small>填写 / 修改每个点的基准标高与底部仓壁至基准线距离</small></a>
        <a href="#/indicators">指标配置<small>比例、封顶值、起算标高、适用对象、批准状态</small></a>
        <a href="#/settings">项目设置<small>方向与坐标、各仓参数、竖直仓壁确认、图纸底图</small></a>
        <a href="#/data">数据与同步<small>CSV 导入导出、备份、离线同步{n ? `（待同步 ${n}）` : ''}</small></a>
        <a href="#/round">垂准仪平台中心观测（可选模式）<small>滑模平台中心偏移：光斑读数 + 投影板固定偏置</small></a>
        <a href="#/overview">垂准仪 / 仓壁截面总览（可选模式）<small>平台偏移与成型仓壁截面偏移的九仓对比</small></a>
        <a href="#/wall/14">仓壁截面数据（可选模式）<small>方式 A 中心偏移 / 方式 B 铅垂线读数</small></a>
      </div>
    </div>
  );
}

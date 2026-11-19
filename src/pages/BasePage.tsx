/** 八点底部基准一览：集中查看与进入填写 */
import { SIDE_FULL } from '../calc/distance';
import { fmt } from '../calc/direction';
import type { Ctx } from './ctx';
import { tm } from './ctx';

export function BasePage({ ctx }: { ctx: Ctx }) {
  const d = ctx.data;
  const open = (id: string) => { localStorage.setItem('silo-ui:point-tab', '"base"'); ctx.go(`/point/${encodeURIComponent(id)}`); };
  return (
    <div className="page">
      <p className="mode-banner">每个点只与自己的底部基准比较。点击点号填写或修改：基准标高、底部仓壁至基准线距离、基准线说明、基准关系与方向规则确认。</p>
      <div className="point-list">
        {d.distPoints.map((p) => (
          <button key={p.id} type="button" className="pl-item" onClick={() => open(p.id)}>
            <span className="pl-id">{p.id}</span>
            <span className="pl-mid">
              {p.siloId} 号仓{SIDE_FULL[p.side]}　基准标高 {fmt(p.baseElevation, 2)} m
              <br />底部基准距离 <b>{p.baseDistance === null ? '未填写' : `${fmt(p.baseDistance, 1)} mm`}</b>
              <br /><span className="muted">复核：{p.reviewer ? `${p.reviewer} ${tm(p.reviewedAt)}` : '未签认'}</span>
            </span>
            <span className={'chip-st ' + (p.baseDistance === null ? 'st-incomplete' : !p.baseConfirmed || !p.directionConfirmed ? 'st-dir-pending' : 'st-done')}>
              {p.baseDistance === null ? '未填写' : !p.baseConfirmed ? '基准待确认' : !p.directionConfirmed ? '方向待确认' : '已确认'}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

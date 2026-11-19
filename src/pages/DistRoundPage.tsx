/** 八点录入：观测轮次、自定义顺序、八点状态清单、本轮记录表导出 */
import { useState } from 'react';
import type { Round } from '../model/types';
import { POINT_STATUS_TEXT, SIDE_FULL, calcReading, pickReadings } from '../calc/distance';
import { download, toCsv, uid } from '../calc/csv';
import { fmt } from '../calc/direction';
import { nowLocal } from '../components/ui';
import { useLocalState } from '../components/useLocalState';
import { PointChecklist, distRounds, statusOf } from './distShared';
import type { Ctx } from './ctx';

export function DistRoundPage({ ctx, saved, roundParam }: { ctx: Ctx; saved: string | null; roundParam: string | null }) {
  const d = ctx.data;
  const rounds = distRounds(d);
  const [sel, setSel] = useLocalState<string>('dist-round', '');
  const [editOrder, setEditOrder] = useState(false);
  // 从录入页返回时回到录入所在轮次
  const wanted = roundParam && rounds.some((r) => r.id === roundParam) ? roundParam : sel;
  if (wanted !== sel && roundParam) setTimeout(() => setSel(wanted), 0);
  const round = rounds.find((r) => r.id === wanted) ?? rounds[rounds.length - 1] ?? null;
  const newRound = () => {
    const n = rounds.filter((r) => !r.demo).length + 1;
    const r: Round = { id: uid(), name: `第 ${n} 轮 ${nowLocal().slice(0, 10)}`, createdAt: nowLocal(), order: round ? [...round.order] : d.distPoints.map((p) => p.id), note: '', mode: 'distance' };
    ctx.setData((dd) => ({ ...dd, rounds: [...dd.rounds, r] }));
    setSel(r.id);
  };
  if (!round) return (
    <div className="page narrow"><h2>八点录入</h2><p className="muted">还没有观测轮次。</p><button className="primary big" type="button" onClick={newRound}>开始新一轮</button></div>
  );
  const points = d.distPoints.filter((p) => p.active);
  const picked = pickReadings(points, d.distReadings, { kind: 'round', roundId: round.id });
  const statuses = points.map((p) => statusOf(d, p, picked.get(p.id) ?? null).status);
  const count = (k: string) => statuses.filter((s) => s === k).length;
  const order = round.order.filter((id) => points.some((p) => p.id === id));
  const next = (() => {
    const start = saved ? order.indexOf(saved) + 1 : 0;
    for (let i = 0; i < order.length; i++) { const id = order[(start + i) % order.length]; if (!picked.get(id)) return id; }
    return null;
  })();
  const move = (i: number, dir: number) => {
    const o = [...round.order]; const j = i + dir;
    if (j < 0 || j >= o.length) return;
    [o[i], o[j]] = [o[j], o[i]];
    ctx.setData((dd) => ({ ...dd, rounds: dd.rounds.map((r) => (r.id === round.id ? { ...r, order: o } : r)) }));
  };
  const exportRound = () => {
    const rows: (string | number | null)[][] = [[`观测轮次：${round.name}（八点仓壁距离差）`],
      ['点号', '仓号', '方位', '状态', '观测时间', '观测标高_m', '基准标高_m', '底部基准距离_mm', '本次距离_mm', '差值_mm', '设计修正_mm', '修正依据', '修正后_mm', '方向分量', '分量_mm', '有效状态', '测量人员', '复核人员', '复核时间', '复核原因', '备注']];
    for (const id of order) {
      const p = points.find((x) => x.id === id)!;
      const r = picked.get(id) ?? null;
      const st = statusOf(d, p, r);
      if (!r) { rows.push([p.id, p.siloId, SIDE_FULL[p.side], POINT_STATUS_TEXT[st.status], '', '', p.baseElevation, p.baseDistance]); continue; }
      const c = calcReading(p, r);
      rows.push([p.id, p.siloId, SIDE_FULL[p.side], POINT_STATUS_TEXT[st.status], r.time.replace('T', ' '), r.elevation, p.baseElevation, p.baseDistance, r.distance,
        c.raw === null ? '' : fmt(c.raw, 1), c.design === null ? '未提供' : fmt(c.design, 1), r.designBasis, c.corrected === null ? '' : fmt(c.corrected, 1),
        c.component === null ? '不输出' : c.axis, c.component === null ? '' : fmt(c.component, 1), { valid: '有效', doubtful: '存疑', invalid: '无效' }[r.validity],
        r.surveyor, r.reviewer, r.reviewedAt.replace('T', ' '), st.reasons.join('；'), r.note]);
    }
    download(`八点本轮记录_${round.name}.csv`, toCsv(rows));
  };

  return (
    <div className="page">
      <div className="toolbar">
        <label>轮次
          <select value={round.id} onChange={(e) => setSel(e.target.value)}>
            {rounds.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
        </label>
        <button type="button" onClick={newRound}>＋ 新一轮</button>
        <button type="button" onClick={() => setEditOrder(!editOrder)}>{editOrder ? '完成顺序' : '调整录入顺序'}</button>
        <button type="button" onClick={exportRound}>导出本轮记录表</button>
        <button type="button" onClick={() => ctx.go('/bases')}>八点底部基准</button>
      </div>
      <div className="round-progress">
        <b>{round.name}</b>
        <span className="chip-st st-done">已录入 {count('done')}</span>
        <span className="chip-st st-incomplete">数据不完整 {count('incomplete')}</span>
        <span className="chip-st st-dir-pending">方向待确认 {count('dir-pending')}</span>
        <span className="chip-st st-review">待复核 {count('review')}</span>
        <span className="chip-st st-todo">待录入 {count('todo')}</span>
        {next ? <span>下一个：<b className="next-id">{next}</b></span> : <span className="text-ok">八点均已有记录</span>}
      </div>
      {editOrder && (
        <div className="order-edit"><p className="muted small">录入顺序由您自定义，程序不预设现场路线。</p>
          <ol>{round.order.map((id, i) => <li key={id}><b>{id}</b><button type="button" onClick={() => move(i, -1)}>↑</button><button type="button" onClick={() => move(i, 1)}>↓</button></li>)}</ol>
        </div>
      )}
      <PointChecklist ctx={ctx} picked={picked} selected={next} roundId={round.id} />
      <p className="muted small">点击点号进入录入；每次录入都是空白，不沿用上一次读数。</p>
      <p className="disclaimer">软件提示不能代替人工复核签认。单人快速录入只优化软件操作，不代表现场高处测量可由一人独自实施。</p>
    </div>
  );
}

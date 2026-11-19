/** 本轮观测：3×3 仓号卡片显示录入状态；顺序由用户自定义 */
import { useState } from 'react';
import type { Round } from '../model/types';
import { DEFAULT_GRID, positionLabel } from '../calc/layout';
import { ROUND_STATUS_TEXT, nextPending, roundStatus } from '../calc/plumb';
import { rotationText } from './OuterEntry';
import { describeOffset, fmt } from '../calc/direction';
import { download, exportRound, uid } from '../calc/csv';
import { useLocalState } from '../components/useLocalState';
import { nowLocal } from '../components/ui';
import type { Ctx } from './ctx';

export function RoundPage({ ctx, highlight }: { ctx: Ctx; highlight: string | null }) {
  const { data, setData, labels: l } = ctx;
  const [roundId, setRoundId] = useLocalState<string>('round-current', '');
  const [editOrder, setEditOrder] = useState(false);
  const plumbRounds = data.rounds.filter((r) => r.mode !== 'distance');
  const round = plumbRounds.find((r) => r.id === roundId) ?? plumbRounds[plumbRounds.length - 1] ?? null;
  const siloById = new Map(data.silos.map((s) => [s.id, s]));
  const range = (id: string): [number, number] | undefined => { const s = siloById.get(id); return s ? [s.elevMin, s.elevMax] : undefined; };

  const newRound = () => {
    const n = plumbRounds.filter((r) => !r.demo).length + 1;
    const r: Round = {
      id: uid(), name: `垂准仪 第 ${n} 轮 ${nowLocal().slice(0, 10)}`, createdAt: nowLocal(),
      order: round ? [...round.order] : DEFAULT_GRID.flat(), note: '', mode: 'plumb',
    };
    setData((d) => ({ ...d, rounds: [...d.rounds, r] }));
    setRoundId(r.id);
  };

  if (!round) {
    return (
      <div className="page narrow">
        <h2>本轮观测</h2>
        <p className="muted">还没有观测轮次。</p>
        <button className="primary big" type="button" onClick={newRound}>开始新一轮观测</button>
      </div>
    );
  }

  const statuses = new Map(data.silos.map((s) => [s.id, roundStatus(round, s.id, data.plumbObs, data.config.jumpThresholdMm, range(s.id), data.config.outerResidualMm ?? 3)]));
  const next = nextPending(round, data.plumbObs, highlight ?? undefined) ?? null;
  const count = (k: string) => [...statuses.values()].filter((x) => x.status === k).length;
  const move = (i: number, d: number) => {
    const order = [...round.order];
    const j = i + d;
    if (j < 0 || j >= order.length) return;
    [order[i], order[j]] = [order[j], order[i]];
    setData((dd) => ({ ...dd, rounds: dd.rounds.map((r) => (r.id === round.id ? { ...r, order } : r)) }));
  };
  const plateCode = (id: string) => data.points.find((p) => p.id === id)?.code ?? '';

  return (
    <div className="page">
      <p className="mode-banner">可选模式：<b>垂准仪平台中心观测 —— 滑模平台中心偏移</b>。平台 X/Y 偏移 = −(光斑读数 + 投影板固定偏置)。与八点仓壁距离差分开保存、分开计算，不相互覆盖或混算。</p>
      <div className="toolbar">
        <label>轮次
          <select value={round.id} onChange={(e) => setRoundId(e.target.value)}>
            {plumbRounds.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
        </label>
        <button type="button" onClick={newRound}>＋ 新一轮</button>
        <button type="button" onClick={() => setEditOrder(!editOrder)}>{editOrder ? '完成顺序' : '调整观测顺序'}</button>
        <button type="button" onClick={() => {
          const rows = round.order.map((id) => {
            const st = statuses.get(id)!;
            return { siloId: id, position: positionLabel(siloById.get(id)!), status: ROUND_STATUS_TEXT[st.status], measure: st.measure, reasons: st.reasons, codeOf: plateCode };
          });
          download(`本轮记录_${round.name}.csv`, exportRound(rows, l, round.name));
        }}>导出本轮记录</button>
      </div>

      <div className="round-progress">
        <b>{round.name}</b>
        <span className="chip-st st-done">已录入 {count('done')}</span>
        <span className="chip-st st-incomplete">数据不完整 {count('incomplete')}</span>
        <span className="chip-st st-review">待复核 {count('review')}</span>
        <span className="chip-st st-todo">待录入 {count('todo')}</span>
        {next ? <span>下一座：<b className="next-id">{next}</b> 号仓</span> : <span className="text-ok">九仓均已有记录</span>}
      </div>

      {editOrder && (
        <div className="order-edit">
          <p className="muted small">观测顺序由您自定义（程序不预设现场通行路线）。</p>
          <ol>
            {round.order.map((id, i) => (
              <li key={id}>
                <b>{id}</b> <span className="muted small">{positionLabel(siloById.get(id)!)}</span>
                <button type="button" onClick={() => move(i, -1)} aria-label="上移">↑</button>
                <button type="button" onClick={() => move(i, 1)} aria-label="下移">↓</button>
              </li>
            ))}
          </ol>
        </div>
      )}

      <section className="round-grid">
        {DEFAULT_GRID.map((row) => row.map((id) => {
          const st = statuses.get(id);
          const silo = siloById.get(id);
          if (!st || !silo) return <div key={id} />;
          const m = st.measure;
          const orderNo = round.order.indexOf(id) + 1;
          return (
            <button key={id} type="button" className={`round-card st-${st.status}${next === id ? ' is-next' : ''}${highlight === id ? ' just-saved' : ''}`}
              onClick={() => ctx.go(`/entry/${id}?round=${round.id}`)}>
              <span className="rc-top"><span className="rc-id">{id}</span><span className="rc-order">#{orderNo}</span></span>
              <span className="rc-pos">{positionLabel(silo)}</span>
              <span className="rc-status">{ROUND_STATUS_TEXT[st.status]}</span>
              {m && (
                <span className="rc-detail">
                  {fmt(m.elevation, 2)} m · {m.time.slice(11)}{m.kind === 'outer' ? ` · 外侧${m.records.length}点` : ''}
                  <br />
                  {m.basePending ? '基准待确认' : describeOffset(m.x, m.y, l, 0)}
                  {m.kind === 'outer' && m.rotationDeg !== null && <><br />{rotationText(m.rotationDeg)}</>}
                </span>
              )}
              {next === id && <span className="rc-next">下一座</span>}
            </button>
          );
        }))}
      </section>

      {[...statuses.entries()].some(([, s]) => s.reasons.length) && (
        <section className="review-list">
          <h3>需要复核 / 补充</h3>
          <ul className="small">
            {round.order.map((id) => {
              const s = statuses.get(id)!;
              return s.reasons.length ? <li key={id}><b>{id} 号仓</b>：{s.reasons.join('；')}</li> : null;
            })}
          </ul>
          <p className="muted small">提示只供复核，原始数据保持不变，也不判定合格。</p>
        </section>
      )}
      <p className="disclaimer">单人快速录入只优化软件操作，不代表现场高处测量可由一人独自实施；请按批准的安全与测量方案组织作业。</p>
    </div>
  );
}

/** 指标配置：名称、比例、封顶值、起算标高、适用对象、文件来源、批准状态。程序不内置任何数值。 */
import { useState } from 'react';
import type { Indicator, IndicatorTarget } from '../model/distTypes';
import { TARGET_TEXT, checkIndicator } from '../calc/distance';
import { uid } from '../calc/csv';
import { fmt } from '../calc/direction';
import { Field, numStr, toNum } from '../components/ui';
import type { Ctx } from './ctx';
import { tm } from './ctx';

type Form = { id: string | null; name: string; ratio: string; cap: string; start: string; target: IndicatorTarget; source: string; version: string; note: string };
const blank = (): Form => ({ id: null, name: '', ratio: '', cap: '', start: '', target: 'corner-combo', source: '', version: '', note: '' });

export function IndicatorsPage({ ctx }: { ctx: Ctx }) {
  const d = ctx.data;
  const [f, setF] = useState<Form>(blank);
  const [tryE, setTryE] = useState('39.5');
  const save = () => {
    const ratio = toNum(f.ratio), cap = toNum(f.cap), start = toNum(f.start);
    if (!f.name.trim()) return ctx.notify('请填写指标名称');
    if ([ratio, cap, start].some((v) => v !== null && (Number.isNaN(v) || v < 0))) return ctx.notify('比例、封顶值、起算标高须为非负数值或留空');
    const now = new Date().toISOString();
    const base: Omit<Indicator, 'history'> = {
      id: f.id ?? uid(), name: f.name.trim(), ratioPermil: ratio, cap, startElevation: start, target: f.target, source: f.source.trim(), version: f.version.trim(),
      status: 'draft', approvedBy: '', approvedAt: '', note: f.note,
    };
    ctx.setData((dd) => ({
      ...dd, indicators: f.id
        ? dd.indicators.map((x) => (x.id === f.id ? { ...base, demo: x.demo, history: [...(x.history ?? []), { at: now, snapshot: (({ history: _h, ...y }) => y)(x) }] } : x))
        : [...dd.indicators, base],
    }));
    ctx.notify('已保存为“未批准”。按批准文件核对后，再点击“标记为已批准”');
    setF(blank());
  };
  const approve = (ind: Indicator) => {
    if (ind.ratioPermil === null || ind.startElevation === null || !ind.source.trim()) return ctx.notify('比例、起算标高、文件来源须填写完整后才能批准');
    const who = prompt(`确认“${ind.name}”与批准文件一致。批准人姓名：`, localStorage.getItem('silo-ui:reviewer') ?? '');
    if (!who || !who.trim()) return;
    const now = new Date().toISOString();
    ctx.setData((dd) => ({ ...dd, indicators: dd.indicators.map((x) => x.id !== ind.id ? x : {
      ...x, status: 'approved', approvedBy: who.trim(), approvedAt: now.slice(0, 16), history: [...(x.history ?? []), { at: now, snapshot: (({ history: _h, ...y }) => y)(x) }] }) }));
  };
  const revoke = (ind: Indicator) => {
    const now = new Date().toISOString();
    ctx.setData((dd) => ({ ...dd, indicators: dd.indicators.map((x) => x.id !== ind.id ? x : {
      ...x, status: 'draft', approvedBy: '', approvedAt: '', history: [...(x.history ?? []), { at: now, snapshot: (({ history: _h, ...y }) => y)(x) }] }) }));
  };
  const e = toNum(tryE);

  return (
    <div className="page settings">
      <p className="mode-banner">指标只在“已批准、适用对象一致、输入完整”时才显示数值对照；不同测量对象（单点距离变化、角仓组合位移、平台中心偏移、成型结构垂直度）不得混用同一结论。软件提示不能代替人工复核签认。</p>
      <section className="card-panel">
        <h3>{f.id ? '修改指标' : '新增指标'}</h3>
        <div className="form-grid">
          <Field label="指标名称" wide><input value={f.name} onChange={(ev) => setF({ ...f, name: ev.target.value })} placeholder="按批准文件填写" /></Field>
          <Field label="比例（‰）" hint="如批准文件为 1‰，填 1"><input inputMode="decimal" value={f.ratio} onChange={(ev) => setF({ ...f, ratio: ev.target.value })} /></Field>
          <Field label="封顶值 (mm)" hint="不封顶则留空"><input inputMode="decimal" value={f.cap} onChange={(ev) => setF({ ...f, cap: ev.target.value })} /></Field>
          <Field label="起算标高 (m)"><input inputMode="decimal" value={f.start} onChange={(ev) => setF({ ...f, start: ev.target.value })} /></Field>
          <Field label="适用测量对象">
            <select value={f.target} onChange={(ev) => setF({ ...f, target: ev.target.value as IndicatorTarget })}>
              {(Object.keys(TARGET_TEXT) as IndicatorTarget[]).map((t) => <option key={t} value={t}>{TARGET_TEXT[t]}</option>)}
            </select>
          </Field>
          <Field label="文件来源" wide><input value={f.source} onChange={(ev) => setF({ ...f, source: ev.target.value })} placeholder="批准文件名称、编号、条款" /></Field>
          <Field label="版本"><input value={f.version} onChange={(ev) => setF({ ...f, version: ev.target.value })} /></Field>
          <Field label="备注"><input value={f.note} onChange={(ev) => setF({ ...f, note: ev.target.value })} /></Field>
        </div>
        <div className="row gap"><button className="primary" type="button" onClick={save}>{f.id ? '保存修改（将变为未批准）' : '新增（未批准）'}</button>{f.id && <button type="button" onClick={() => setF(blank())}>取消</button>}</div>
      </section>

      <section className="card-panel">
        <h3>指标列表</h3>
        <label className="field" style={{ maxWidth: 260 }}><span className="field-label">试算标高 (m)</span><input inputMode="decimal" value={tryE} onChange={(ev) => setTryE(ev.target.value)} /></label>
        <div className="table-wrap tall">
          <table className="data-table">
            <thead><tr><th>名称</th><th>适用对象</th><th>比例 / 封顶 / 起算</th><th>来源 / 版本</th><th>状态</th><th>试算</th><th></th></tr></thead>
            <tbody>
              {d.indicators.map((ind) => {
                const chk = checkIndicator(ind, ind.target, 0, e !== null && !Number.isNaN(e) ? e : null);
                return (
                  <tr key={ind.id}>
                    <td>{ind.name}{ind.demo && <span className="demo-tag">演示</span>}</td>
                    <td className="small">{TARGET_TEXT[ind.target]}</td>
                    <td>{ind.ratioPermil ?? '—'}‰ / {ind.cap ?? '不封顶'} mm / {fmt(ind.startElevation, 2)} m</td>
                    <td className="small">{ind.source || '—'}<br />{ind.version}</td>
                    <td className="small">{ind.status === 'approved' ? <span className="text-ok">已批准<br />{ind.approvedBy} {tm(ind.approvedAt)}</span> : <span className="text-warn">未批准</span>}</td>
                    <td className="small">{chk.applicable ? `H = ${fmt(chk.H, 2)} m → MIN(${fmt(chk.H, 2)} × ${ind.ratioPermil}, ${ind.cap ?? '∞'}) = ${fmt(chk.allowed, 1)} mm` : chk.reason}</td>
                    <td className="nowrap">
                      <button className="link" type="button" onClick={() => setF({ id: ind.id, name: ind.name, ratio: numStr(ind.ratioPermil), cap: numStr(ind.cap), start: numStr(ind.startElevation), target: ind.target, source: ind.source, version: ind.version, note: ind.note })}>编辑</button>
                      {ind.status === 'approved'
                        ? <button className="link danger" type="button" onClick={() => revoke(ind)}>撤销批准</button>
                        : <button className="link" type="button" onClick={() => approve(ind)}>标记为已批准</button>}
                    </td>
                  </tr>
                );
              })}
              {d.indicators.length === 0 && <tr><td colSpan={7} className="muted center">尚未配置指标：系统只显示实测数据，不作指标对照</td></tr>}
            </tbody>
          </table>
        </div>
        <p className="muted small">计算：H = 观测标高 − 起算标高；允许偏移 = MIN(H × 比例, 封顶值)。例：批准 1‰、封顶 30 mm、H = 39.5 m 时，允许偏移 = MIN(39.5, 30) = 30 mm。所有数值以当前批准文件为准。</p>
      </section>
    </div>
  );
}

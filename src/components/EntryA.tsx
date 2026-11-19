/** 方式 A：直接录入中心偏移 */
import { useState } from 'react';
import type { AppData, CenterRecord } from '../model/types';
import type { Issue } from '../calc/validate';
import { describeOffset, fmt, fmtSigned, resultant } from '../calc/direction';
import { importCenterRecordsChecked, uid } from '../calc/csv';
import { Field, ImportBox, IssueBadge, nowLocal, numStr, toNum } from './ui';

interface Props {
  data: AppData;
  setData: (f: (d: AppData) => AppData) => void;
  siloId: string;
  issues: Map<string, Issue[]>;
  highlight: Set<string>;
  onPick: (recordId: string) => void;
  notify: (msg: string) => void;
}

type Form = { id: string | null; siloId: string; time: string; elevation: string; x: string; y: string; note: string };

export function EntryA({ data, setData, siloId, issues, highlight, onPick, notify }: Props) {
  const l = data.config.labels;
  const blank = (): Form => ({ id: null, siloId, time: nowLocal(), elevation: '', x: '', y: '', note: '' });
  const [f, setF] = useState<Form>(blank);
  const set = (k: keyof Form, v: string) => setF({ ...f, [k]: v });
  const x = toNum(f.x), y = toNum(f.y), e = toNum(f.elevation);
  const bad = [x, y, e].some((v) => v !== null && Number.isNaN(v));
  const xv = x !== null && !Number.isNaN(x) ? x : null;
  const yv = y !== null && !Number.isNaN(y) ? y : null;
  const r = resultant(xv, yv);

  const save = () => {
    if (bad) return notify('存在无法识别的数值，请检查');
    const rec: CenterRecord = {
      id: f.id ?? uid(), siloId: f.siloId.trim(), time: f.time, elevation: e as number | null,
      x: xv, y: yv, note: f.note,
    };
    setData((d) => ({
      ...d,
      centerRecords: f.id ? d.centerRecords.map((c) => (c.id === f.id ? { ...rec, flags: c.flags } : c)) : [...d.centerRecords, rec],
    }));
    notify(f.id ? '已更新记录' : '已新增记录');
    setF({ ...blank(), time: f.time, siloId: f.siloId });
  };

  const rows = data.centerRecords
    .filter((c) => c.siloId === siloId)
    .sort((a, b) => a.time.localeCompare(b.time) || (a.elevation ?? 0) - (b.elevation ?? 0));

  return (
    <div className="panel-body">
      <p className="muted small">每条记录为某标高截面中心相对设计中心的偏移。{l.xName} 正值 = 向{l.posX}，负值 = 向{l.negX}；{l.yName} 正值 = 向{l.posY}，负值 = 向{l.negY}。单位 mm。</p>
      <div className="form-grid">
        <Field label="筒仓编号">
          <select value={f.siloId} onChange={(ev) => set('siloId', ev.target.value)}>
            {data.silos.map((s) => <option key={s.id} value={s.id}>{s.id}</option>)}
          </select>
        </Field>
        <Field label="观测时间">
          <input type="datetime-local" value={f.time} onChange={(ev) => set('time', ev.target.value)} />
        </Field>
        <Field label="观测标高 (m)">
          <input inputMode="decimal" value={f.elevation} onChange={(ev) => set('elevation', ev.target.value)} placeholder="如 40.5" />
        </Field>
        <Field label={`中心 ${l.xName} 偏移 (mm)`}>
          <input inputMode="decimal" value={f.x} onChange={(ev) => set('x', ev.target.value)} placeholder={`+ 向${l.posX}`} />
        </Field>
        <Field label={`中心 ${l.yName} 偏移 (mm)`}>
          <input inputMode="decimal" value={f.y} onChange={(ev) => set('y', ev.target.value)} placeholder={`+ 向${l.posY}`} />
        </Field>
        <Field label="备注">
          <input value={f.note} onChange={(ev) => set('note', ev.target.value)} />
        </Field>
      </div>
      <div className="live-explain">
        {bad ? <span className="text-warn">数值格式有误</span> : xv === null && yv === null ? (
          <span className="muted">输入 {l.xName}、{l.yName} 后实时显示方向解释</span>
        ) : (
          <>
            <b>{describeOffset(xv, yv, l)}</b>
            <span className="muted">　合成偏移 {r === null ? '（X、Y 未同时填写，不计算）' : fmt(r) + ' mm'}</span>
          </>
        )}
      </div>
      <div className="row gap">
        <button className="primary" type="button" onClick={save}>{f.id ? '保存修改' : '新增记录'}</button>
        {f.id && <button type="button" onClick={() => setF(blank())}>取消编辑</button>}
      </div>

      <ImportBox template="筒仓编号, 观测时间, 标高(m), X(mm), Y(mm), 备注" placeholder={'A1\t2026-09-10 08:30\t40.5\t12.4\t8.1\t'}
        onImport={(text) => {
          const res = importCenterRecordsChecked(text, data.silos);
          setData((d) => ({ ...d, centerRecords: [...d.centerRecords, ...res.items] }));
          notify(`导入 ${res.items.length} 条记录` + (res.messages.length ? `；${res.messages.length} 条提示：\n` + res.messages.join('\n') : ''));
        }} />

      <h4>筒仓 {siloId} 的方式 A 记录（{rows.length}）</h4>
      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr><th></th><th>时间</th><th>标高 m</th><th>{l.xName} mm</th><th>{l.yName} mm</th><th>方向</th><th>备注</th><th></th></tr>
          </thead>
          <tbody>
            {rows.map((c) => (
              <tr key={c.id} id={'row-' + c.id} className={highlight.has(c.id) ? 'hl' : ''} onClick={() => onPick(c.id)}>
                <td><IssueBadge issues={issues.get(c.id)} />{c.demo && <span className="demo-tag">演示</span>}</td>
                <td>{c.time.replace('T', ' ')}</td>
                <td>{fmt(c.elevation, 2)}</td>
                <td>{fmtSigned(c.x)}</td>
                <td>{fmtSigned(c.y)}</td>
                <td className="small">{describeOffset(c.x, c.y, l)}</td>
                <td className="small">{c.note}</td>
                <td className="nowrap">
                  <button className="link" type="button" onClick={(ev) => {
                    ev.stopPropagation();
                    setF({ id: c.id, siloId: c.siloId, time: c.time, elevation: numStr(c.elevation), x: numStr(c.x), y: numStr(c.y), note: c.note });
                  }}>编辑</button>
                  <button className="link danger" type="button" onClick={(ev) => {
                    ev.stopPropagation();
                    if (confirm('删除这条记录？')) setData((d) => ({ ...d, centerRecords: d.centerRecords.filter((z) => z.id !== c.id) }));
                  }}>删除</button>
                </td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={8} className="muted center">暂无记录</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

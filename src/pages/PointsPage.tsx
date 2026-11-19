/** 测点资料：平台中心标记、垂准仪投影板、仓壁观测点（每仓独立管理） */
import { useState } from 'react';
import type { Cardinal, MeasurePoint, PointType } from '../model/types';
import { siloTitle } from '../calc/layout';
import { cardinalLabel, fmt, fmtSigned, sideLabel } from '../calc/direction';
import { uid } from '../calc/csv';
import { Field, numStr, toNum } from '../components/ui';
import type { Ctx } from './ctx';

const TYPE_TEXT: Record<PointType, string> = { 'platform-mark': '平台中心标记', 'plumb-plate': '中心垂准仪投影板', 'outer-plumb': '外侧垂准点', 'wall-point': '仓壁观测点' };

type Form = { id: string | null; code: string; type: PointType; azimuth: string; relation: string; offsetX: string; offsetY: string; offsetConfirmed: boolean; active: boolean; posX: string; posY: string; note: string; side: Cardinal; radius: string };

export function PointsPage({ ctx, siloId }: { ctx: Ctx; siloId: string }) {
  const { data, setData, labels: l } = ctx;
  const silo = data.silos.find((s) => s.id === siloId);
  const blank = (): Form => ({ id: null, code: '', type: 'plumb-plate', azimuth: '', relation: '', offsetX: '', offsetY: '', offsetConfirmed: false, active: true, posX: '', posY: '', note: '', side: 'N', radius: '' });
  const [f, setF] = useState<Form>(blank);
  if (!silo) return <div className="page narrow"><p>仓号 “{siloId}” 不属于本组筒仓。</p></div>;
  const mine = data.points.filter((p) => p.siloId === siloId);
  const lines = data.lines.filter((x) => x.siloId === siloId);

  const save = () => {
    const code = f.code.trim();
    if (!code) return ctx.notify('请填写测点唯一编号');
    if (data.points.some((p) => p.code === code && p.id !== f.id)) return ctx.notify(`编号 “${code}” 已被使用（编号须全项目唯一）`);
    const nums = [f.offsetX, f.offsetY, f.posX, f.posY, f.radius].map(toNum);
    if (nums.some((v) => v !== null && Number.isNaN(v))) return ctx.notify('数值格式有误');
    const hasOffset = f.type === 'plumb-plate' || f.type === 'outer-plumb';
    if (hasOffset && f.offsetConfirmed && (nums[0] === null || nums[1] === null))
      return ctx.notify('确认前，请填写 X、Y 两个方向的偏置 / 偏差（重合时填 0）');
    if (f.type === 'outer-plumb' && !(nums[4] !== null && nums[4] > 0)) return ctx.notify('请填写投影板刻度原点到平台中心的距离（m）');
    const outer = f.type === 'outer-plumb';
    const u = { E: [1, 0], W: [-1, 0], N: [0, 1], S: [0, -1] }[f.side];
    const p: MeasurePoint = {
      id: f.id ?? uid(), code, siloId, type: f.type, azimuth: f.azimuth, relation: f.relation,
      offsetX: hasOffset ? nums[0] : null, offsetY: hasOffset ? nums[1] : null,
      offsetConfirmed: hasOffset && f.offsetConfirmed, active: f.active,
      posX: outer ? u[0] * (nums[4] as number) : nums[2], posY: outer ? u[1] * (nums[4] as number) : nums[3], note: f.note,
      side: outer ? f.side : null, radius: outer ? nums[4] : null,
    };
    const old = data.points.find((x) => x.id === f.id);
    if (old && (old.type === 'plumb-plate' || old.type === 'outer-plumb') && (old.offsetX !== p.offsetX || old.offsetY !== p.offsetY || old.offsetConfirmed !== p.offsetConfirmed || old.radius !== p.radius || old.side !== p.side))
      ctx.notify('测点参数已更新：已保存的观测记录仍使用保存时的偏置快照；如需按新偏置重算，请逐条打开记录重新保存（会保留修改历史）。');
    setData((d) => ({ ...d, points: f.id ? d.points.map((x) => (x.id === f.id ? { ...p, demo: x.demo } : x)) : [...d.points, p] }));
    setF(blank());
  };

  return (
    <div className="page">
      <header className="silo-head">
        <div><div className="silo-title">{siloTitle(silo)} · 测点资料</div>
          <div className="muted small">网站只显示您已录入并确认的测点，不自动推荐投测位置、洞口位置或投影板安装位置。</div></div>
        <button type="button" onClick={() => ctx.go('/silo/' + siloId)}>返回详情</button>
      </header>

      <div className="two-col">
        <section className="card-panel">
          <h3>{f.id ? '修改测点' : '新增测点'}</h3>
          <div className="form-grid">
            <Field label="唯一编号"><input value={f.code} onChange={(e) => setF({ ...f, code: e.target.value })} placeholder="如 P14-1" /></Field>
            <Field label="测量类型">
              <select value={f.type} onChange={(e) => setF({ ...f, type: e.target.value as PointType })}>
                {(Object.keys(TYPE_TEXT) as PointType[]).map((t) => <option key={t} value={t}>{TYPE_TEXT[t]}</option>)}
              </select>
            </Field>
            <Field label="方位"><input value={f.azimuth} onChange={(e) => setF({ ...f, azimuth: e.target.value })} /></Field>
            <Field label="有效状态">
              <select value={f.active ? '1' : '0'} onChange={(e) => setF({ ...f, active: e.target.value === '1' })}><option value="1">有效</option><option value="0">停用</option></select>
            </Field>
            <Field label="基准关系" wide><input value={f.relation} onChange={(e) => setF({ ...f, relation: e.target.value })} placeholder="如 刻度原点与平台中心标记重合" /></Field>
            {f.type === 'outer-plumb' && (
              <>
                <Field label="测点方位（由仓中心指向测点）">
                  <select value={f.side} onChange={(e) => setF({ ...f, side: e.target.value as Cardinal })}>
                    {(['E', 'W', 'N', 'S'] as Cardinal[]).map((c) => <option key={c} value={c}>{cardinalLabel(c, l)}侧（{{ E: '+X', W: '−X', N: '+Y', S: '−Y' }[c]}）</option>)}
                  </select>
                </Field>
                <Field label="刻度原点到平台中心距离 r (m)" hint="投影板装在外挑架上的设计位置"><input inputMode="decimal" value={f.radius} onChange={(e) => setF({ ...f, radius: e.target.value })} placeholder="如 7.0" /></Field>
                <Field label={`测站偏差 e·${l.xName} (mm)`} hint="地面测站相对刻度原点设计位置正下方的偏差；正好在正下方填 0"><input inputMode="decimal" value={f.offsetX} onChange={(e) => setF({ ...f, offsetX: e.target.value })} /></Field>
                <Field label={`测站偏差 e·${l.yName} (mm)`}><input inputMode="decimal" value={f.offsetY} onChange={(e) => setF({ ...f, offsetY: e.target.value })} /></Field>
                <label className="field wide check-row"><input type="checkbox" checked={f.offsetConfirmed} onChange={(e) => setF({ ...f, offsetConfirmed: e.target.checked })} />
                  测站位置、测点方位与半径已经测量人员复核确认（未确认时该点不参与解算）</label>
              </>
            )}
            {f.type === 'plumb-plate' && (
              <>
                <Field label={`固定偏置 b·${l.xName} (mm)`} hint={`刻度原点相对平台中心标记，+ = ${l.posX}`}><input inputMode="decimal" value={f.offsetX} onChange={(e) => setF({ ...f, offsetX: e.target.value })} /></Field>
                <Field label={`固定偏置 b·${l.yName} (mm)`} hint={`+ = ${l.posY}`}><input inputMode="decimal" value={f.offsetY} onChange={(e) => setF({ ...f, offsetY: e.target.value })} /></Field>
                <label className="field wide check-row"><input type="checkbox" checked={f.offsetConfirmed} onChange={(e) => setF({ ...f, offsetConfirmed: e.target.checked })} />
                  固定偏置已经测量人员确认（未确认时，该投影板的记录显示“基准待确认”，不输出平台偏移）</label>
              </>
            )}
            {f.type !== 'outer-plumb' && (
              <>
                <Field label="平面位置 X (m，相对设计中心)" hint="可空；仅用于在单仓平面图上显示"><input inputMode="decimal" value={f.posX} onChange={(e) => setF({ ...f, posX: e.target.value })} /></Field>
                <Field label="平面位置 Y (m)"><input inputMode="decimal" value={f.posY} onChange={(e) => setF({ ...f, posY: e.target.value })} /></Field>
              </>
            )}
            <Field label="备注" wide><input value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} /></Field>
          </div>
          <div className="row gap">
            <button className="primary" type="button" onClick={save}>{f.id ? '保存修改' : '新增测点'}</button>
            {f.id && <button type="button" onClick={() => setF(blank())}>取消</button>}
          </div>
        </section>

        <section>
          {(['platform-mark', 'outer-plumb', 'plumb-plate', 'wall-point'] as PointType[]).map((t) => (
            <div key={t} className="card-panel">
              <h3>{TYPE_TEXT[t]}</h3>
              <div className="table-wrap">
                <table className="data-table">
                  <thead><tr><th>编号</th><th>方位</th><th>基准关系</th>{t === 'plumb-plate' && <th>固定偏置 b (mm)</th>}{t === 'outer-plumb' && <th>方位 / 半径 / 测站偏差 e</th>}<th>状态</th><th>备注</th><th></th></tr></thead>
                  <tbody>
                    {mine.filter((p) => p.type === t).map((p) => (
                      <tr key={p.id}>
                        <td><b>{p.code}</b>{p.demo && <span className="demo-tag">演示</span>}</td>
                        <td>{p.azimuth}</td>
                        <td className="small">{p.relation}</td>
                        {t === 'plumb-plate' && <td>({fmtSigned(p.offsetX)}, {fmtSigned(p.offsetY)}) {p.offsetConfirmed ? <span className="text-ok">已确认</span> : <span className="text-warn">待确认</span>}</td>}
                        {t === 'outer-plumb' && <td>{p.side ? cardinalLabel(p.side, l) + '侧' : '—'} · r = {fmt(p.radius ?? null, 2)} m · e = ({fmtSigned(p.offsetX)}, {fmtSigned(p.offsetY)}) {p.offsetConfirmed ? <span className="text-ok">已确认</span> : <span className="text-warn">待确认</span>}</td>}
                        <td>{p.active ? '有效' : '停用'}</td>
                        <td className="small">{p.note}</td>
                        <td><button className="link" type="button" onClick={() => setF({
                          id: p.id, code: p.code, type: p.type, azimuth: p.azimuth, relation: p.relation, offsetX: numStr(p.offsetX), offsetY: numStr(p.offsetY),
                          offsetConfirmed: p.offsetConfirmed, active: p.active, posX: numStr(p.posX), posY: numStr(p.posY), note: p.note,
                          side: p.side ?? 'N', radius: numStr(p.radius),
                        })}>编辑</button></td>
                      </tr>
                    ))}
                    {mine.filter((p) => p.type === t).length === 0 && <tr><td colSpan={8} className="muted center">暂无</td></tr>}
                  </tbody>
                </table>
              </div>
              {t === 'wall-point' && lines.length > 0 && (
                <p className="small">仓壁观测线（在“仓壁数据”页管理）：{lines.map((x) => `${x.name}（${x.side === 'OTHER' ? x.azimuthText || '其他' : sideLabel(x.side, l)}，读数增大向${x.positiveDir ? cardinalLabel(x.positiveDir, l) : '—'}，基准 ${fmt(x.baseReading, 1)} mm）`).join('；')}</p>
              )}
            </div>
          ))}
          <p className="muted small">测点不可直接删除，以免已保存的观测记录失去依据；不再使用时请设为“停用”。</p>
        </section>
      </div>
    </div>
  );
}

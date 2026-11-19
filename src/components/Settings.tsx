/** 设置：方向与坐标、九仓阵列与各仓参数、图纸参考底图、阈值（管理员） */
import { useState } from 'react';
import type { AppData, AxisLabels, SiloDef, ThresholdSet } from '../model/types';
import { DEFAULT_LABELS } from '../model/defaults';
import { thresholdsReady } from '../calc/compare';
import { positionLabel } from '../calc/layout';
import { Field, numStr, toNum } from './ui';

interface Props {
  data: AppData;
  setData: (f: (d: AppData) => AppData) => void;
  notify: (m: string) => void;
}

export function Settings({ data, setData, notify }: Props) {
  const c = data.config, L = data.layout;
  const [num, setNum] = useState({
    north: numStr(c.northAngleDeg), rot: numStr(L.axisRotationDeg), jump: numStr(c.jumpThresholdMm), resid: numStr(c.outerResidualMm ?? 3),
    sx: numStr(L.spacingX), sy: numStr(L.spacingY), tol: numStr(L.sameElevTolerance),
  });
  const [lab, setLab] = useState<AxisLabels>(c.labels);
  const [confirmed, setConfirmed] = useState(L.orientationConfirmed);
  const [silos, setSilos] = useState(() => data.silos.map((s) => ({
    ...s, cx: numStr(s.centerX), cy: numStr(s.centerY), od: numStr(s.outerDiameter), id2: numStr(s.innerDiameter), lo: numStr(s.elevMin), hi: numStr(s.elevMax),
  })));
  const t = data.thresholds;
  const [th, setTh] = useState({
    rw: numStr(t.resultantWarning), rc: numStr(t.resultantControl), cw: numStr(t.componentWarning), cc: numStr(t.componentControl),
    source: t.source, version: t.version, setBy: t.setBy,
  });

  const saveOrientation = () => {
    const north = toNum(num.north), rot = toNum(num.rot), jump = toNum(num.jump), sx = toNum(num.sx), sy = toNum(num.sy), tol = toNum(num.tol), resid = toNum(num.resid);
    if ([north, rot, jump, tol, resid].some((x) => x === null || Number.isNaN(x))) return notify('角度、提示值、标高容差须为有效数值');
    if ([sx, sy].some((x) => x !== null && (Number.isNaN(x) || x <= 0))) return notify('中心距须为正数或留空');
    if ((sx === null) !== (sy === null)) return notify('左右、上下中心距请同时填写或同时留空');
    for (const k of Object.keys(lab) as (keyof AxisLabels)[]) if (!lab[k].trim()) return notify('方向名称不能为空');
    setData((d) => ({
      ...d,
      config: { ...d.config, labels: { ...lab }, northAngleDeg: north!, jumpThresholdMm: jump!, outerResidualMm: resid! },
      layout: { ...d.layout, orientationConfirmed: confirmed, axisRotationDeg: rot!, spacingX: sx, spacingY: sy, sameElevTolerance: Math.max(0, tol!) },
    }));
    notify(confirmed ? '已保存；方向名称已启用，所有图表同步更新' : '已保存；方向未确认，图表按图纸上/下/左/右显示');
  };

  const saveSilos = () => {
    const out: SiloDef[] = [];
    for (const s of silos) {
      const v = { cx: toNum(s.cx), cy: toNum(s.cy), od: toNum(s.od), id2: toNum(s.id2), lo: toNum(s.lo), hi: toNum(s.hi) };
      if ([v.od, v.id2, v.lo, v.hi].some((x) => x === null || Number.isNaN(x))) return notify(`${s.id} 号仓：外径、内径、标高范围须填写有效数值`);
      if ([v.cx, v.cy].some((x) => x !== null && Number.isNaN(x))) return notify(`${s.id} 号仓：设计中心坐标格式有误`);
      if ((v.cx === null) !== (v.cy === null)) return notify(`${s.id} 号仓：设计中心 X、Y 请同时填写或同时留空`);
      if (v.id2! >= v.od!) return notify(`${s.id} 号仓：内径应小于外径`);
      if (v.lo! >= v.hi!) return notify(`${s.id} 号仓：标高范围下限应小于上限`);
      out.push({ id: s.id, group: s.group.trim(), row: s.row, col: s.col, centerX: v.cx, centerY: v.cy, outerDiameter: v.od!, innerDiameter: v.id2!, elevMin: v.lo!, elevMax: v.hi!, note: s.note });
    }
    setData((d) => ({ ...d, silos: out }));
    notify('各仓参数已保存（仓号与图纸位置固定，不会重新排序）');
  };

  const saveThresholds = () => {
    const vals = [th.rw, th.rc, th.cw, th.cc].map(toNum);
    if (vals.some((x) => x !== null && (Number.isNaN(x) || x < 0))) return notify('阈值须为非负数值或留空');
    const [rw, rc, cw, cc] = vals;
    if (rw !== null && rc !== null && rw > rc) return notify('合成偏移：预警值不应大于控制值');
    if (cw !== null && cc !== null && cw > cc) return notify('单向分量：预警值不应大于控制值');
    const next: ThresholdSet = {
      resultantWarning: rw, resultantControl: rc, componentWarning: cw, componentControl: cc,
      source: th.source.trim(), version: th.version.trim(), setBy: th.setBy.trim(), setAt: new Date().toLocaleString(),
    };
    setData((d) => ({ ...d, thresholds: next }));
    notify(thresholdsReady(next) ? '阈值已保存并启用' : '已保存；阈值数值或来源/版本/设置人不完整，暂不进行预警判断');
  };

  const setBg = (patch: Partial<AppData['layout']>) => setData((d) => ({ ...d, layout: { ...d.layout, ...patch } }));

  return (
    <div className="page settings">
      <section className="card-panel">
        <h3>方向与坐标</h3>
        <p className="muted small">
          程序内部固定：+X = 图纸右方，+Y = 图纸上方（或按下方“项目 +Y 相对图纸上方的角度”旋转）。<b>图纸的上下左右不等于北南西东。</b>
          未勾选“已确认”前，所有图表按“图纸右/左/上/下”显示，不标注东西南北、不显示北向箭头。
        </p>
        <div className="form-grid">
          <Field label="X 轴名称"><input value={lab.xName} onChange={(e) => setLab({ ...lab, xName: e.target.value })} /></Field>
          <Field label="Y 轴名称"><input value={lab.yName} onChange={(e) => setLab({ ...lab, yName: e.target.value })} /></Field>
          <Field label="+X 方向名称"><input value={lab.posX} onChange={(e) => setLab({ ...lab, posX: e.target.value })} /></Field>
          <Field label="−X 方向名称"><input value={lab.negX} onChange={(e) => setLab({ ...lab, negX: e.target.value })} /></Field>
          <Field label="+Y 方向名称"><input value={lab.posY} onChange={(e) => setLab({ ...lab, posY: e.target.value })} /></Field>
          <Field label="−Y 方向名称"><input value={lab.negY} onChange={(e) => setLab({ ...lab, negY: e.target.value })} /></Field>
          <Field label="项目 +Y 相对图纸上方的角度（顺时针 °）" hint="0 = 项目 +Y 指向图纸上方"><input inputMode="decimal" value={num.rot} onChange={(e) => setNum({ ...num, rot: e.target.value })} /></Field>
          <Field label="真北相对项目 +Y 的角度（顺时针 °）"><input inputMode="decimal" value={num.north} onChange={(e) => setNum({ ...num, north: e.target.value })} /></Field>
          <label className="field wide check-row"><input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} />
            已按项目图纸确认上述方向名称、坐标轴与北向（确认后才显示东西南北与北向箭头）</label>
        </div>
        <h3>九仓阵列</h3>
        <div className="form-grid">
          <Field label="左右相邻仓中心距 (m)" hint="留空 = 示意布置"><input inputMode="decimal" value={num.sx} onChange={(e) => setNum({ ...num, sx: e.target.value })} /></Field>
          <Field label="上下相邻仓中心距 (m)"><input inputMode="decimal" value={num.sy} onChange={(e) => setNum({ ...num, sy: e.target.value })} /></Field>
          <Field label="“同一标高”比较容差 (m)" hint="默认 0：只比较完全相同的标高"><input inputMode="decimal" value={num.tol} onChange={(e) => setNum({ ...num, tol: e.target.value })} /></Field>
          <Field label="读数突变提示值 (mm)"><input inputMode="decimal" value={num.jump} onChange={(e) => setNum({ ...num, jump: e.target.value })} /></Field>
          <Field label="外侧两点校核闭合差提示值 (mm)" hint="超过时标记“待复核”，默认 3"><input inputMode="decimal" value={num.resid} onChange={(e) => setNum({ ...num, resid: e.target.value })} /></Field>
        </div>
        <div className="row gap wrap">
          <button className="primary" type="button" onClick={saveOrientation}>保存方向与阵列</button>
          <button type="button" onClick={() => setLab({ ...DEFAULT_LABELS })}>名称填为东/西/北/南</button>
        </div>
      </section>

      <VerticalWallSection data={data} setData={setData} notify={notify} />

      <section className="card-panel">
        <h3>各仓参数</h3>
        <p className="muted small">仓号与图纸位置固定（上排 12 11 10，中排 15 14 13，下排 18 17 16）。九仓都填写设计中心坐标时，总览按坐标真实比例绘制。</p>
        <div className="table-wrap tall">
          <table className="data-table edit-table">
            <thead><tr><th>仓号</th><th>图纸位置</th><th>组编号</th><th>中心 X (m)</th><th>中心 Y (m)</th><th>外径 m</th><th>内径 m</th><th>标高下限</th><th>标高上限</th><th>备注</th></tr></thead>
            <tbody>
              {silos.map((s, i) => {
                const up = (k: string, v: string) => setSilos(silos.map((x, j) => (j === i ? { ...x, [k]: v } : x)));
                return (
                  <tr key={s.id}>
                    <td><b>{s.id}</b></td><td>{positionLabel(s)}</td>
                    <td><input value={s.group} onChange={(e) => up('group', e.target.value)} placeholder="如 B2" /></td>
                    <td><input inputMode="decimal" value={s.cx} onChange={(e) => up('cx', e.target.value)} /></td>
                    <td><input inputMode="decimal" value={s.cy} onChange={(e) => up('cy', e.target.value)} /></td>
                    <td><input inputMode="decimal" value={s.od} onChange={(e) => up('od', e.target.value)} /></td>
                    <td><input inputMode="decimal" value={s.id2} onChange={(e) => up('id2', e.target.value)} /></td>
                    <td><input inputMode="decimal" value={s.lo} onChange={(e) => up('lo', e.target.value)} /></td>
                    <td><input inputMode="decimal" value={s.hi} onChange={(e) => up('hi', e.target.value)} /></td>
                    <td><input value={s.note} onChange={(e) => up('note', e.target.value)} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <button className="primary" type="button" onClick={saveSilos}>保存各仓参数</button>
      </section>

      <section className="card-panel">
        <h3>图纸参考底图</h3>
        <p className="muted small">上传筒仓布置图，在总览“图纸参考图”中作为浅色底图，可调透明度与对位。底图只作参照，仓号位置始终按上述固定布局。</p>
        <div className="row gap wrap">
          <label className="file-btn">选择图片
            <input type="file" accept="image/*" onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = '';
              if (!f) return;
              if (f.size > 3 * 1024 * 1024) return notify('图片超过 3 MB，请压缩后再上传（本机存储空间有限）');
              const r = new FileReader();
              r.onload = () => setBg({ bgImage: String(r.result) });
              r.readAsDataURL(f);
            }} />
          </label>
          {L.bgImage && <button type="button" onClick={() => setBg({ bgImage: null })}>移除底图</button>}
        </div>
        {L.bgImage && (
          <div className="form-grid">
            <Field label={`透明度 ${L.bgOpacity.toFixed(2)}`}><input type="range" min={0.05} max={1} step={0.05} value={L.bgOpacity} onChange={(e) => setBg({ bgOpacity: Number(e.target.value) })} /></Field>
            <Field label={`缩放 ${L.bgScale.toFixed(2)}`}><input type="range" min={0.5} max={2} step={0.01} value={L.bgScale} onChange={(e) => setBg({ bgScale: Number(e.target.value) })} /></Field>
            <Field label={`左右偏移 ${L.bgOffsetX}%`}><input type="range" min={-30} max={30} step={0.5} value={L.bgOffsetX} onChange={(e) => setBg({ bgOffsetX: Number(e.target.value) })} /></Field>
            <Field label={`上下偏移 ${L.bgOffsetY}%`}><input type="range" min={-30} max={30} step={0.5} value={L.bgOffsetY} onChange={(e) => setBg({ bgOffsetY: Number(e.target.value) })} /></Field>
          </div>
        )}
      </section>

      <section className="card-panel">
        <h3>仓壁截面数据页的预警值与控制值（旧版，仅作用于“仓壁截面数据”页）</h3>
        <p className="text-warn small">八点距离差、角仓组合位移、垂准仪平台中心偏移、九仓总览的指标对照，请在“更多 → 指标配置”中设置。</p>
        <p className="muted small">
          请填写项目批准的数值。未填写时只展示实测数据，不给出“合格”“超标”等结论。数值、来源、版本、设置人均填写后才启用判断；
          预警判断只针对定义明确、数据完整的指标。图形和颜色不能代替测量复核或工程验收结论。
        </p>
        <div className="form-grid">
          <Field label="合成偏移 预警值 (mm)"><input inputMode="decimal" value={th.rw} onChange={(e) => setTh({ ...th, rw: e.target.value })} /></Field>
          <Field label="合成偏移 控制值 (mm)"><input inputMode="decimal" value={th.rc} onChange={(e) => setTh({ ...th, rc: e.target.value })} /></Field>
          <Field label="单向分量 预警值 (mm)"><input inputMode="decimal" value={th.cw} onChange={(e) => setTh({ ...th, cw: e.target.value })} /></Field>
          <Field label="单向分量 控制值 (mm)"><input inputMode="decimal" value={th.cc} onChange={(e) => setTh({ ...th, cc: e.target.value })} /></Field>
          <Field label="阈值来源" wide><input value={th.source} onChange={(e) => setTh({ ...th, source: e.target.value })} placeholder="如 批准的滑模专项方案 第 x 条" /></Field>
          <Field label="版本"><input value={th.version} onChange={(e) => setTh({ ...th, version: e.target.value })} /></Field>
          <Field label="设置人"><input value={th.setBy} onChange={(e) => setTh({ ...th, setBy: e.target.value })} /></Field>
        </div>
        <div className="row gap">
          <button className="primary" type="button" onClick={saveThresholds}>保存阈值</button>
          <button type="button" onClick={() => {
            setTh({ rw: '', rc: '', cw: '', cc: '', source: '', version: '', setBy: '' });
            setData((d) => ({ ...d, thresholds: { resultantWarning: null, resultantControl: null, componentWarning: null, componentControl: null, source: '', version: '', setBy: '', setAt: '' } }));
          }}>清除阈值</button>
        </div>
        {t.setAt && <p className="small muted">当前阈值保存于 {t.setAt}{thresholdsReady(t) ? '（已启用）' : '（信息不完整，未启用）'}</p>}
      </section>
    </div>
  );
}

/** 设计仓壁位置不变（竖直仓壁）的确认：范围内设计距离变化默认取 0 */
function VerticalWallSection({ data, setData, notify }: Props) {
  const vw = data.verticalWall;
  const [f, setF] = useState({ confirmed: vw.confirmed, from: numStr(vw.from), to: numStr(vw.to), basis: vw.basis });
  const save = () => {
    const from = toNum(f.from), to = toNum(f.to);
    if (from === null || to === null || Number.isNaN(from) || Number.isNaN(to) || from >= to) return notify('请填写有效的标高范围（下限小于上限）');
    if (f.confirmed && !f.basis.trim()) return notify('确认“设计仓壁位置不变”时，请填写依据（如设计图编号）');
    setData((d) => ({ ...d, verticalWall: { confirmed: f.confirmed, from, to, basis: f.basis.trim() } }));
    notify(f.confirmed ? `已确认：${from}～${to} m 范围内设计距离变化默认取 0` : '未确认：所有读数须逐条录入设计修正值');
  };
  return (
    <section className="card-panel">
      <h3>设计仓壁位置（八点距离差的设计修正）</h3>
      <p className="muted small">只有确认所比较高度范围内设计仓壁位置不变，设计距离变化才能取 0。范围外或未确认时，录入页要求逐条填写设计修正值；缺少时只显示原始差值，不输出方向结论。</p>
      <div className="form-grid">
        <Field label="标高下限 (m)"><input inputMode="decimal" value={f.from} onChange={(e) => setF({ ...f, from: e.target.value })} /></Field>
        <Field label="标高上限 (m)"><input inputMode="decimal" value={f.to} onChange={(e) => setF({ ...f, to: e.target.value })} /></Field>
        <Field label="依据" wide><input value={f.basis} onChange={(e) => setF({ ...f, basis: e.target.value })} placeholder="如 设计图 S-xx：该范围仓壁竖直" /></Field>
        <label className="field wide check-row"><input type="checkbox" checked={f.confirmed} onChange={(e) => setF({ ...f, confirmed: e.target.checked })} />已确认该标高范围内设计仓壁位置不变</label>
      </div>
      <button className="primary" type="button" onClick={save}>保存</button>
    </section>
  );
}

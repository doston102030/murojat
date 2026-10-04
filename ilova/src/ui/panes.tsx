/* Yorliqlar ichidagi ko'rinishlar: svod (qog'oz varaq), solishtirish, murojaatlar (virtual ro'yxat). */
import { memo, useCallback, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { TITLE } from '../engine/core';
import type { Analysis, BriefRow, CmpView, DisplayRow, SvodView } from '../engine/protocol';
import { nf, MoreList } from './common';

/* ---------------------------------------------------------------- svod */
const A = [99, 190, 123], B = [255, 235, 132], C = [248, 105, 107];       // Excel'dagi 3 rangli shkala
function heat(v: number, lo: number, mid: number, hi: number) {
  const mix = (p: number[], q: number[], t: number) => p.map((x, i) => Math.round(x + (q[i] - x) * t));
  const c = hi === lo ? B : v <= mid ? mix(A, B, mid === lo ? 1 : (v - lo) / (mid - lo)) : mix(B, C, hi === mid ? 1 : (v - mid) / (hi - mid));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}

export const SvodTable = memo(function SvodTable({ v }: { v: SvodView }) {
  const tot = v.orgs.map(o => o.jami).sort((a, b) => a - b), n = tot.length;
  const pos = (n - 1) / 2, lo = tot[0], hi = tot[n - 1];
  const mid = tot[Math.floor(pos)] + (tot[Math.ceil(pos)] - tot[Math.floor(pos)]) * (pos - Math.floor(pos));
  return (
    <div className="scroll">
      <table className="svod">
        <thead><tr>
          <th scope="col">Ижрочи ташкилот</th>
          {v.cats.map(c => <th scope="col" className="c" key={c}>{c}</th>)}
          <th scope="col" className="c">Общий итог</th><th scope="col" className="c">Янги келган</th>
        </tr></thead>
        <tbody>
          {v.orgs.map(o => (
            <tr key={o.nom}>
              <td className="org">{o.nom}</td>
              {o.s.map((x, j) => x ? <td className="c" key={j}>{x}</td> : <td className="c z" key={j}>·</td>)}
              <td className="c tot" style={{ background: heat(o.jami, lo, mid, hi) }}>{o.jami}</td>
              <td className="c nw">{o.yangi || ''}</td>
            </tr>
          ))}
        </tbody>
        <tfoot><tr>
          <td>Общий итог</td>
          {v.ustun.map((x, j) => <td className="c" key={j}>{x}</td>)}
          <td className="c">{v.jami}</td><td className="c nw">{v.yangi}</td>
        </tr></tfoot>
      </table>
    </div>
  );
});

export function GhostSvod({ cats }: { cats: string[] }) {
  return (
    <div className="scroll">
      <table className="svod ghost">
        <thead><tr><th scope="col">Ижрочи ташкилот</th>{cats.map(c => <th scope="col" className="c" key={c}>{c}</th>)}<th scope="col" className="c">Общий итог</th><th scope="col" className="c">Янги келган</th></tr></thead>
        <tbody>{[0, 1, 2].map(i => <tr key={i}><td>—</td>{cats.map(c => <td className="c" key={c}>·</td>)}<td className="c">·</td><td className="c">·</td></tr>)}</tbody>
      </table>
    </div>
  );
}

/** Svod — Excel varag'idagidek: oq varaq, pastida tayyor fayldagi varaqlar yorliqlari («Лист2» — svodning o'zi) */
export function Paper({ date, children, note }: { date: string; children: ReactNode; note?: ReactNode }) {
  return (
    <div className="paperwrap">
      <div className="paper">
        <p className="rep-title">{TITLE}</p>
        <div className="rep-meta"><span className="legend">Общий итог: kam <i /> ko'p</span><span className="rep-date">{date}</span></div>
        {children}
        {note}
        <div className="sheets" aria-label="Tayyor fayldagi varaqlar"><span>жараён</span><span className="on">Лист2</span><span>жараён (2)</span></div>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- solishtirish */
export function ComparePane({ c, prevName }: { c: CmpView; prevName: string }) {
  const d = c.total - c.prevTotal;
  const one = (r: BriefRow, i: number) => (
    <li key={i}><span className="mono">{r.id}</span> {r.person} <span className="muted">· {r.org}{r.cat ? ' · ' + r.cat : ''}</span></li>
  );
  const none = !c.removed.count && !c.added.count && !c.changed.count;
  return (
    <div className="cmp">
      <p className="hint">Oldingi hisobot: {prevName}</p>
      <div className="kpis">
        <div className="kpi"><b>{nf(c.prevTotal)} → {nf(c.total)}</b><span>jami murojaat{d ? ` (${d > 0 ? '+' : '−'}${Math.abs(d)})` : ''}</span></div>
        <div className="kpi"><b>{c.removed.count}</b><span>chiqib ketgan</span></div>
        <div className="kpi"><b>{c.added.count}</b><span>yangi qo'shilgan</span></div>
        <div className="kpi"><b>{c.changed.count}</b><span>o'zgargan</span></div>
      </div>
      {c.orgDelta.length ? (
        <div className="cmp-sec"><h3>Bo'limlar bo'yicha o'zgarish</h3>
          <ul>{c.orgDelta.map(o => <li key={o.org}>{o.org}: <span className={`delta ${o.to > o.from ? 'up' : 'down'}`}>{o.from} → {o.to}</span></li>)}</ul>
        </div>
      ) : null}
      {c.removed.count ? <div className="cmp-sec"><h3>Chiqib ketgan ({c.removed.count})</h3><MoreList items={c.removed.list} total={c.removed.count} limit={40} render={one} /></div> : null}
      {c.added.count ? <div className="cmp-sec"><h3>Yangi qo'shilgan ({c.added.count})</h3><MoreList items={c.added.list} total={c.added.count} limit={40} render={one} /></div> : null}
      {c.changed.count ? (
        <div className="cmp-sec"><h3>O'zgargan ({c.changed.count})</h3>
          <MoreList items={c.changed.list} total={c.changed.count} limit={40} render={(x, i) => (
            <li key={i}><span className="mono">{x.id}</span> {x.person}: {x.diffs.map(f => `${f.header} — ${f.from || 'bo\'sh'} → ${f.to || 'bo\'sh'}`).join('; ')}</li>
          )} />
        </div>
      ) : null}
      {none ? <p className="muted">Farq yo'q: ikkala faylda bir xil murojaatlar.</p> : null}
    </div>
  );
}

/* ---------------------------------------------------------------- murojaatlar: virtual ro'yxat
   20 000 qator bo'lsa ham faqat ko'rinib turgan ~30 qator chiziladi. */
const ROW_H = 26, VIEW_H = 470, OVERSCAN = 12;
/* Qator, raqam, fuqaro, tuman, toifa, ijrochi, muddat, yo'naltirilgan, yangilangan (jami ~1180px — tor ekranda gorizontal aylantiriladi) */
const COL_W = [56, 158, 180, 120, 150, 200, 92, 132, 132];

export const RowsPane = memo(function RowsPane({ rows, newFrom, analysis }: { rows: DisplayRow[]; newFrom: number; analysis: Analysis | null }) {
  const box = useRef<HTMLDivElement>(null);
  const [top, setTop] = useState(0);
  const [height, setHeight] = useState(VIEW_H);
  const onScroll = useCallback(() => { if (box.current) setTop(box.current.scrollTop); }, []);
  useLayoutEffect(() => { if (box.current) setHeight(box.current.clientHeight || VIEW_H); }, []);
  const catOf = useMemo(() => {
    if (!analysis || analysis.rowCat.length !== rows.length) return () => null;
    const { rowCat, catNames } = analysis;
    return (i: number) => (rowCat[i] >= 0 ? catNames[rowCat[i]] : null);
  }, [analysis, rows.length]);

  const n = rows.length;
  const first = Math.max(0, Math.floor(top / ROW_H) - OVERSCAN);
  const last = Math.min(n, Math.ceil((top + height) / ROW_H) + OVERSCAN);
  const slice = [];
  for (let i = first; i < last; i++) {
    const r = rows[i], nw = i >= newFrom, cat = catOf(i);
    slice.push(
      <tr key={i} className={(i % 2 ? 'odd' : 'even') + (nw ? ' nw' : '')} style={{ height: ROW_H }}>
        <td className="no mono">{4 + i}</td>
        <td className="id" title={r.id}>{r.linkA ? <a href={r.linkA} target="_blank" rel="noopener noreferrer">{r.id}</a> : r.id}{nw ? <span className="tag">янги</span> : null}</td>
        <td title={r.person}>{r.person}</td>
        <td title={r.district}>{r.district}</td>
        <td title={cat ?? ''}>{cat ?? <span className="muted">?</span>}</td>
        <td title={r.org}>{r.org}</td>
        <td className="dt">{r.deadline}</td>
        <td className="dt">{r.sent}</td>
        <td className="dt n">{r.upd}</td>
      </tr>,
    );
  }
  return (
    <div className="scroll tall" ref={box} onScroll={onScroll} style={{ height: Math.min(VIEW_H, ROW_H * (n + 1) + 40) }}>
      <table className="rows virt">
        <colgroup>
          {COL_W.map((w, i) => <col key={i} style={{ width: w }} />)}
        </colgroup>
        <thead><tr>
          <th scope="col">Qator</th><th scope="col">Мурожаат рақами</th><th scope="col">Фуқаро</th><th scope="col">Туман/шаҳар</th>
          <th scope="col">Тоифа</th><th scope="col">Ижрочи ташкилот</th><th scope="col">Муддат</th><th scope="col">Йўналтирилган</th><th scope="col">Янгиланган</th>
        </tr></thead>
        <tbody>
          {first > 0 ? <tr className="pad" aria-hidden="true"><td colSpan={9} style={{ height: first * ROW_H }} /></tr> : null}
          {slice}
          {last < n ? <tr className="pad" aria-hidden="true"><td colSpan={9} style={{ height: (n - last) * ROW_H }} /></tr> : null}
        </tbody>
      </table>
    </div>
  );
});

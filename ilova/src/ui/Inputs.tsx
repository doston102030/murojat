/* Chap ustun: fayllar, hisobot sanasi, oldingi hisobot va tasnif qoidalari. */
import { useEffect, useState, type ReactNode } from 'react';
import { collator, dateLabels, isValidDate, rulesMap } from '../engine/core';
import { Win, nf } from './common';
import { Icon, type IconName } from './icons';
import type { SlotStatus, State } from './state';

function FileDrop({ id, inputId, status, idle, onFile, children }: { id: string; inputId: string; status: SlotStatus; idle: IconName; onFile(f: File): void; children: ReactNode }) {
  const [over, setOver] = useState(false);
  const icon: IconName = status === 'ready' ? 'xls' : status === 'loading' ? 'busy' : status === 'error' ? 'error' : idle;
  return (
    <label className={'drop' + (status === 'ready' ? ' has' : '') + (over ? ' over' : '')} id={id} htmlFor={inputId}
      onDragEnter={e => { e.preventDefault(); setOver(true); }} onDragOver={e => { e.preventDefault(); setOver(true); }}
      onDragLeave={() => setOver(false)} onDragEnd={() => setOver(false)}
      onDrop={e => { e.preventDefault(); setOver(false); const f = e.dataTransfer?.files?.[0]; if (f) onFile(f); }}>
      <Icon name={icon} size={44} className={'drop-ico' + (status === 'loading' ? ' spin' : '')} />
      <span className="dropbody">{children}</span>
      <input type="file" id={inputId} accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) onFile(f); }} />
    </label>
  );
}
const Idle = ({ a, b }: { a: string; b: string }) => <><strong>{a}</strong><small>{b}</small><span className="btn sm" aria-hidden="true">Fayl tanlash…</span></>;

export interface InputsProps {
  s: State;
  allCats: string[];
  onFile(which: 'exp' | 'prev', f: File): void;
  onDate(date: string): void;
  onClearPrev(): void;
  onRules(pairs: Array<[string, string]>): void;
  onAddCat(name: string): void;
}

export function Inputs({ s, allCats, onFile, onDate, onClearPrev, onRules, onAddCat }: InputsProps) {
  const [date, setDate] = useState(s.date);
  useEffect(() => { setDate(s.date); }, [s.date]);
  const [catNew, setCatNew] = useState('');
  const lab = dateLabels(s.date);
  const rules = Array.from(rulesMap(s.rules)).sort((a, b) => collator.compare(a[0], b[0]));
  const exp = s.exp, prev = s.prev;
  const prevDate = prev.info?.reportDate && isValidDate(prev.info.reportDate) ? dateLabels(prev.info.reportDate).dmy : null;

  return (
    <div className="col">
      <Win icon="xls" title="1. Portal ro'yxati" min>
        <FileDrop id="dropExp" inputId="fileExp" status={exp.status} idle="xls" onFile={f => onFile('exp', f)}>
          {exp.status === 'ready' && exp.info ? <><strong>{exp.name}</strong><small>{nf(exp.info.rowCount)} ta murojaat · boshqa fayl uchun bosing yoki tashlang</small></>
            : exp.status === 'loading' ? <><strong>{exp.name}</strong><small>o'qilmoqda…</small></>
            : exp.status === 'error' ? <><strong>{exp.name}</strong><small>o'qilmadi — boshqa fayl tanlang</small></>
            : <Idle a="Excel faylni shu yerga tashlang" b="yoki tugmani bosib tanlang (.xlsx)" />}
        </FileDrop>
        <p className="hint">«жараён» varag'i: sarlavha qatori, ostida portaldagi ro'yxat. Yangi kelganlar ro'yxati eng pastda turadi.</p>
      </Win>

      <Win icon="cal" title="2. Hisobot sanasi" min>
        <div className="row">
          <input type="date" id="sana" aria-label="Hisobot sanasi" value={date}
            onChange={e => { setDate(e.target.value); if (isValidDate(e.target.value)) onDate(e.target.value); }}
            onBlur={() => { if (!isValidDate(date)) setDate(s.date); }} />
        </div>
        <p className="hint" id="sanaHint">Svodga yoziladi: «{lab.sheet}» va «{lab.newCol}».</p>
      </Win>

      <Win icon="folder" title="3. Oldingi hisobot" tag={<span className="opt">ixtiyoriy</span>} min>
        <FileDrop id="dropPrev" inputId="filePrev" status={prev.status} idle="folder" onFile={f => onFile('prev', f)}>
          {prev.status === 'ready' && prev.info ? <><strong>{prev.name}</strong><small>{nf(prev.info.rowCount)} ta murojaat{prevDate ? ` · ${prevDate}` : ''}</small></>
            : prev.status === 'loading' ? <><strong>{prev.name}</strong><small>o'qilmoqda…</small></>
            : prev.status === 'error' ? <><strong>{prev.name}</strong><small>o'qilmadi</small></>
            : <Idle a="Avvalgi tayyor faylni tashlang" b="nima chiqib ketgani va o'zgargani ko'rsatiladi" />}
        </FileDrop>
        {prev.status !== 'none' ? <div className="row" id="prevTools"><button type="button" className="btn link" id="prevClear" onClick={onClearPrev}>Solishtirishni olib tashlash</button></div> : null}
      </Win>

      <details className="win" id="rules">
        <summary className="title"><Icon name="gear" /><h2 id="rulesSum">Tasnif qoidalari ({rules.length} ta)</h2><span className="tb arrow" aria-hidden="true" /></summary>
        <div className="win-b" id="rulesBody">
          <p className="hint">Portaldagi tasnif svodda qaysi toifaga tushishi. O'zgartirsangiz, darhol qayta hisoblanadi va eslab qolinadi.</p>
          <div className="scroll field">
            <table className="rules">
              <thead><tr><th scope="col">Portal tasnifi</th><th scope="col">Svod toifasi</th></tr></thead>
              <tbody>
                {rules.map(([t, c], i) => (
                  <tr key={t}>
                    <td>{t}</td>
                    <td><select id={`rule-${i}`} aria-label={`${t} toifasi`} value={c} onChange={e => onRules([[t, e.target.value]])}>
                      {(allCats.includes(c) ? allCats : [...allCats, c]).map(k => <option key={k} value={k}>{k}</option>)}
                    </select></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <form className="row" onSubmit={e => { e.preventDefault(); const v = catNew.trim(); if (!v || v === 'Общий итог') return; onAddCat(v); setCatNew(''); }}>
            <input type="text" id="catNew" placeholder="Yangi toifa nomi" aria-label="Yangi toifa nomi" value={catNew} onChange={e => setCatNew(e.target.value)} />
            <button type="submit" className="btn" id="catAdd">Toifa qo'shish</button>
          </form>
          {s.note ? <p className="msg bad">{s.note}</p> : null}
        </div>
      </details>
    </div>
  );
}

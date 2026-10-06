/* O'ng ustun: holat, tekshiruvlar, savollar va yorliqlar (svod / solishtirish / murojaatlar). */
import { useEffect, useRef, useState, type Dispatch, type ReactNode } from 'react';
import { dateLabels, fmtSerial } from '../engine/core';
import type { ExpInfo } from '../engine/protocol';
import { Check, Dlg, ErrText, MoreList, Spinner, StatusBox, Win, nf, type Kind } from './common';
import { Icon, type IconName } from './icons';
import { ComparePane, GhostSvod, Paper, RowsPane, SvodTable } from './panes';
import { isBusy, listDay, phaseOf, readyResult, staleDay, type Action, type State, type Tab } from './state';

export interface OutputProps {
  s: State;
  dispatch: Dispatch<Action>;
  allCats: string[];
  onSave(): void;
  onDedupe(): void;
  onRules(pairs: Array<[string, string]>): void;
  onForgetLast(): void;
  onReset(): void;
}

const NEWCAT = '__yangi__';

const TAB_WIN: Record<Tab, [IconName, string]> = {
  svod: ['logo', 'Svod — «Лист2» varag\'i'],
  cmp: ['folder', 'Solishtirish — oldingi hisobot bilan'],
  rows: ['xls', 'Murojaatlar — «жараён» varag\'i'],
};

function Tabs({ tabs, cur, onTab, tag, children }: { tabs: Array<[Tab, string, number | null]>; cur: Tab; onTab(t: Tab): void; tag?: ReactNode; children: ReactNode }) {
  const active = tabs.some(t => t[0] === cur) ? cur : tabs[0][0];
  return (
    <Win icon={TAB_WIN[active][0]} title={TAB_WIN[active][1]} tag={tag} className="tabbox">
      <div className="tabs" role="tablist">
        {tabs.map(([id, name, cnt]) => (
          <button type="button" role="tab" key={id} id={`tab-${id}`} className={'tab' + (active === id ? ' on' : '')} aria-selected={active === id}
            data-act="tab" data-tab={id} data-snd="tab" onClick={() => onTab(id)}>
            {name}{cnt != null ? <span className="cnt">{nf(cnt)}</span> : null}
          </button>
        ))}
      </div>
      <div className="tabpane" role="tabpanel" aria-labelledby={`tab-${active}`}>{children}</div>
    </Win>
  );
}

/* ---------------------------------------------------------------- yangi kelganlar */
function NewBlock({ s, info, dispatch }: { s: State; info: ExpInfo; dispatch: Dispatch<Action> }) {
  const n = info.rowCount, k = s.newCount;
  const [val, setVal] = useState(String(k));
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => { setVal(String(k)); }, [k, s.editNew]);
  useEffect(() => { if (s.editNew) input.current?.focus(); }, [s.editNew]);

  const stale = staleDay(s), want = dateLabels(s.date), got = stale ? dateLabels(stale) : null;
  if (stale && got && !s.editNew) {
    return (
      <Check kind="ok" title={k ? `Yangi kelganlar: ${nf(k)} ta` : `Yangi kelganlar: 0 ta — ${want.dmy} kuni kelgan murojaat yo'q`}>
        <span id="staleNew">Ro'yxat {got.dmy} kuniniki ({info.full ? 'hisobot holati' : 'oxirgi yangilanish'} {fmtSerial(info.lastUpd)}).
          {k ? ' Son siz qo\'ygan bo\'yicha olindi.' : ` ${want.dmy} kuni yo'naltirilgan murojaat yo'q.`}</span>
        <span>{got.dmy} hisoboti kerak bo'lsa — <button type="button" className="btn link" data-act="useListDay" onClick={() => dispatch({ type: 'setDate', date: stale })}>sanani {got.dmy} qilish</button>.
          {' '}<button type="button" className="btn link" data-act="editNew" onClick={() => dispatch({ type: 'editNew' })}>O'zgartirish</button></span>
      </Check>
    );
  }
  if (s.newOk && !s.editNew) {
    const dmy = dateLabels(info.full ? listDay(info) ?? s.date : s.date).dmy;
    const why = s.pick !== null ? 'Son siz tasdiqlagan bo\'yicha olindi.'
      : k ? `«Ижрога йўналтирилган сана» ${dmy} bo'lganlar — hisobot kuni kelganlar.`
      : `Hisobot kuni (${dmy}) yo'naltirilgan murojaat yo'q.`;
    return (
      <Check kind="ok" title={`Yangi kelganlar: ${nf(k)} ta`}>
        <span>{why}</span>
        <span><button type="button" className="btn link" data-act="editNew" onClick={() => dispatch({ type: 'editNew' })}>O'zgartirish</button></span>
      </Check>
    );
  }
  const why = got ? `Ro'yxat ${got.dmy} kuniniki. Jadval oxiridan nechta qator «${want.newCol}» bo'lib yozilsin?`
    : 'Yangi kelganlar sonini qo\'lda yozing. Odatda u hisobot kuni bo\'yicha olinadi.';
  const parsed = Number(val), valid = val.trim() !== '' && Number.isInteger(parsed) && parsed >= 0 && parsed <= n;
  const confirm = () => { if (valid) dispatch({ type: 'pickNew', n: parsed }); else input.current?.focus(); };
  return (
    <Check kind="warn" title="Yangi kelganlar sonini tasdiqlang">
      <div className="need">
        <span>{why}</span>
        <div className="chips">
          <button type="button" className="btn sm" data-act="pickNew" data-n="0" onClick={() => dispatch({ type: 'pickNew', n: 0 })}>0 ta</button>
        </div>
        <div className="row">
          <label htmlFor="yangiSon">Yangi kelganlar soni</label>
          <input type="number" id="yangiSon" ref={input} min={0} max={n} step={1} value={val} aria-invalid={!valid}
            onChange={e => setVal(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); confirm(); } }} />
          <button type="button" className="btn" data-act="confirmNew" onClick={confirm}>Tasdiqlash</button>
        </div>
        <span>Hozirgi tanlov: {nf(k)} ta.</span>
      </div>
    </Check>
  );
}

/* ---------------------------------------------------------------- noma'lum tasniflar */
function UnknownBlock({ unknown, allCats, onRules }: { unknown: Array<{ text: string; count: number }>; allCats: string[]; onRules(p: Array<[string, string]>): void }) {
  const [pick, setPick] = useState<Record<string, string>>({});
  const [custom, setCustom] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState<string | null>(null);
  const save = () => {
    const pairs: Array<[string, string]> = [];
    for (const u of unknown) {
      const sel = pick[u.text] || '', val = (sel === NEWCAT ? custom[u.text] || '' : sel).trim();
      if (!val) { setMsg('Har bir tasnifga toifa tanlang.'); return; }
      if (val === 'Общий итог') { setMsg('«Общий итог» nomi svodda band — boshqa nom yozing.'); return; }
      pairs.push([u.text, val]);
    }
    setMsg(null);
    onRules(pairs);
  };
  return (
    <Check kind="warn" title={`${unknown.length} ta tasnifning svod toifasi belgilanmagan`}>
      <div className="need">
        <span>Portalda yangi tasnif chiqibdi. Har biriga toifa tanlang — keyingi safar o'zi qo'yiladi.</span>
        {unknown.map((u, i) => (
          <div className="unk" key={u.text}>
            <span className="q">{u.text} <span className="muted">· {u.count} ta murojaat</span></span>
            <span className="row">
              <select id={`un-${i}`} aria-label={`${u.text} toifasi`} value={pick[u.text] || ''} onChange={e => setPick({ ...pick, [u.text]: e.target.value })}>
                <option value="">— tanlang —</option>
                {allCats.map(c => <option key={c} value={c}>{c}</option>)}
                <option value={NEWCAT}>Yangi toifa…</option>
              </select>
              {pick[u.text] === NEWCAT ? (
                <input type="text" id={`unNew-${i}`} placeholder="Toifa nomi" aria-label="Yangi toifa nomi" autoFocus
                  value={custom[u.text] || ''} onChange={e => setCustom({ ...custom, [u.text]: e.target.value })} />
              ) : null}
            </span>
          </div>
        ))}
        <div className="row">
          <button type="button" className="btn" data-act="saveUnknown" onClick={save}>Saqlash va davom etish</button>
          {msg ? <span className="msg bad">{msg}</span> : null}
        </div>
      </div>
    </Check>
  );
}

/* ---------------------------------------------------------------- bo'sh holat */
function Idle({ s, allCats, onForget }: { s: State; allCats: string[]; onForget(): void }) {
  const L = s.last;
  if (L && L.svod.orgs.length) {
    let dmy = L.sana, sheet = L.sana;
    try { const l = dateLabels(L.sana); dmy = l.dmy; sheet = l.sheet; } catch { /* eski yozuv */ }
    return (
      <>
        <StatusBox kind="idle" title={`Oxirgi svod · ${dmy}`} className="result">
          <div className="hero"><div className="kpis">
            <div className="kpi"><b>{nf(L.svod.jami)}</b><span>jami murojaat</span></div>
            <div className={'kpi new' + (L.svod.yangi ? ' hot' : '')}><b>{nf(L.svod.yangi)}</b><span>yangi kelgan</span></div>
            <div className="kpi"><b>{L.svod.orgs.length}</b><span>bo'lim</span></div>
          </div></div>
          <p className="hint">Bu oxirgi marta tayyorlangan svod. Yangi ro'yxatni tashlasangiz, shu joy yangilanadi va Excel faylni saqlash tugmasi chiqadi.</p>
          <div className="row"><button type="button" className="btn sm" id="lastClear" onClick={onForget}>Tozalash</button><span className="hint">eslab qolingan svod o'chiriladi; saqlangan Excel fayllarga tegmaydi</span></div>
        </StatusBox>
        <Tabs tabs={[['svod', 'Svod', null]]} cur="svod" onTab={() => {}}><Paper date={sheet}><SvodTable v={L.svod} /></Paper></Tabs>
      </>
    );
  }
  return (
    <>
      <StatusBox kind="idle" title="Fayl kutilmoqda">
        <Dlg icon="info"><p><b>Ro'yxatni tashlaganingizda shu yerda svod chiqadi.</b> Har bir bo'lim bo'yicha toifalar, jami va yangi kelganlar soni ko'rinadi. Tayyor fayl qayta o'qib tekshiriladi, keyin uni bitta tugma bilan saqlaysiz: «жараён», «Лист2» (svod) va «жараён (2)» varaqlari, filtr va havolalari bilan.</p></Dlg>
      </StatusBox>
      <Tabs tabs={[['svod', 'Svod', null]]} cur="svod" onTab={() => {}}><Paper date="—"><GhostSvod cats={allCats} /></Paper></Tabs>
    </>
  );
}

/* ---------------------------------------------------------------- asosiy */
export function Output({ s, dispatch, allCats, onSave, onDedupe, onRules, onForgetLast, onReset }: OutputProps) {
  if (s.crash) return <StatusBox kind="bad" title="Dvigatel to'xtadi"><Dlg icon="error"><div className="msg bad"><p>{s.crash}</p></div><p className="hint">Sahifani yangilang (F5) va faylni qayta tashlang.</p></Dlg></StatusBox>;
  if (s.exp.status === 'error' && s.exp.error)
    return <StatusBox kind="bad" title="Fayl o'qilmadi"><Dlg icon="error"><div className="msg bad"><ErrText error={s.exp.error} /></div><p className="hint">Faylni tuzatib yoki boshqasini tanlab, qayta tashlang.</p><div className="row"><button type="button" className="btn sm" id="clearAll" onClick={onReset}>Tozalash</button></div></Dlg></StatusBox>;
  if (s.exp.status === 'loading') return <StatusBox kind="busy" title="O'qilmoqda…"><p className="hint">Fayl ochilmoqda: {s.exp.name}</p></StatusBox>;
  if (s.exp.status !== 'ready' || !s.exp.info) return <Idle s={s} allCats={allCats} onForget={onForgetLast} />;

  const info = s.exp.info, n = info.rowCount, a = s.analysis && s.analysis.seq === s.seq ? s.analysis : null;
  const fresh = a ?? s.analysis;                 // yangisi kelguncha oldingisi ko'rsatiladi
  const busy = isBusy(s), result = readyResult(s), phase = phaseOf(s);
  const built = s.build.seq === s.seq ? s.build : null;
  const failed = !!(built && ((built.result && !built.result.verify.ok) || built.status === 'error'));
  const unknown = fresh?.unknown ?? [], dups = fresh?.dups ?? { count: 0, list: [] };
  const day = listDay(info), newFrom = s.newOk ? n - s.newCount : n;
  const need = info.problemCount > 0 || unknown.length > 0 || dups.count > 0 || !s.newOk || s.editNew;
  const [kind, title]: [Kind, ReactNode] = phase === 'busy' ? ['busy', 'Hisoblanmoqda…']
    : phase === 'ok' ? ['ok', 'Tayyor — tekshiruvdan o\'tdi']
    : phase === 'warn' ? ['warn', 'Sizdan javob kerak']
    : ['bad', failed ? 'Tekshiruvdan o\'tmadi — fayl berilmaydi' : 'Faylni tuzatish kerak'];

  const labels = dateLabels(s.date);
  const updTxt = info.lastUpd === null ? '' : info.full ? ` Hisobot holati: ${fmtSerial(info.lastUpd)}.` : ` Ro'yxatdagi oxirgi yangilanish: ${fmtSerial(info.lastUpd)}.`;
  const ahead = day !== null && day > s.date ? day : null;      // ro'yxat hisobot sanasidan keyingi kunniki
  const pv = fresh?.preview ?? null;
  const cmpCnt = fresh?.cmp ? fresh.cmp.removed.count + fresh.cmp.added.count + fresh.cmp.changed.count : null;

  return (
    <>
      <StatusBox kind={kind} title={title} className="result">
        <div className="hero">
          <div className="kpis">
            <div className="kpi"><b>{nf(n)}</b><span>jami murojaat</span></div>
            <div className={'kpi new' + (s.newCount ? ' hot' : '')}><b>{nf(s.newCount)}</b><span>yangi kelgan{s.newOk ? '' : ' (tasdiqlanmagan)'}</span></div>
            {pv ? <><div className="kpi"><b>{pv.orgs.length}</b><span>bo'lim</span></div><div className="kpi"><b>{pv.cats.length}</b><span>toifa</span></div></> : null}
          </div>
          <div className="save">
            <button type="button" className={'btn primary' + (result ? ' go' : '')} id="saveBtn" data-act="save" data-snd="none" disabled={!result || s.saving} onClick={onSave}>
              <Icon name="floppy" size={32} /><span>{s.saving ? 'Saqlanmoqda…' : 'Excel faylni saqlash'}</span>
            </button>
            <small>{result ? result.filename : need ? 'Pastdagi savollarga javob bergach, fayl tayyor bo\'ladi.' : busy ? 'Fayl yig\'ilmoqda va tekshirilmoqda…' : ''}</small>
            {s.saveMsg ? <span className={`msg ${s.saveMsg.ok ? 'ok' : 'bad'}`}>{s.saveMsg.text}</span> : null}
          </div>
        </div>

        <ul className="checks">
          <Check kind={ahead ? 'warn' : 'ok'} title="Fayl o'qildi">
            {info.full
              ? <span id="fullReport">Portalning to'liq hisoboti («{info.sheetName}» varag'i): {nf(info.full.total)} ta murojaatdan {nf(n)} tasi olindi — «Жараёнда», «Янги» holatidagi va «Юқори ташкилотлардан келиб тушган» yo'nalishidagilar. Ular «Ижрога йўналтирилган сана» bo'yicha tartiblandi.{updTxt}</span>
              : <span>«{info.sheetName}» varag'i, sarlavha {info.headerRow}-qatorda, {nf(n)} ta murojaat ({info.firstRow}–{info.lastRow}-qatorlar).{updTxt}</span>}
            {ahead ? <span id="aheadDay">Ro'yxat {dateLabels(ahead).dmy} kuniniki, hisobot sanasi esa undan oldingi kun — {labels.dmy}. <button type="button" className="btn link" data-act="useListDay" onClick={() => dispatch({ type: 'setDate', date: ahead })}>Sanani {dateLabels(ahead).dmy} qilish</button></span> : null}
          </Check>
          {info.problemCount ? (
            <Check kind="bad" title={`Jadvalda ${nf(info.problemCount)} ta to'ldirilmagan yoki noto'g'ri joy bor`}>
              <div className="need bad">
                <MoreList items={info.problems} total={info.problemCount} render={(p, i) => <li key={i}>{p}</li>} />
                <span>Faylda shu joylarni tuzatib, qayta tashlang.</span>
              </div>
            </Check>
          ) : null}
          {dups.count ? (
            <Check kind="bad" title={`${dups.count} ta qator ikki marta kiritilgan`}>
              <div className="need bad">
                <MoreList items={dups.list} total={dups.count} render={(d, i) => <li key={i}><span className="mono">{d.id}</span> {d.task} — manbadagi {d.firstR}- va {d.againR}-qatorlar</li>} />
                <div className="row"><button type="button" className="btn" data-act="dedupe" onClick={onDedupe}>Takrorlarni olib tashlash (birinchisi qoladi)</button></div>
              </div>
            </Check>
          ) : null}
          <NewBlock s={s} info={info} dispatch={dispatch} />
          {unknown.length ? <UnknownBlock key={unknown.map(u => u.text).join('|')} unknown={unknown} allCats={allCats} onRules={onRules} />
            : pv && fresh ? <Check kind="ok" title={`Tasnif qo'yildi: ${fresh.kinds} xil tasnif → ${pv.cats.length} ta toifa`} /> : null}
          {built?.status === 'error' && built.error ? <Check kind="bad" title="Faylni yig'ishda xato"><div className="need bad"><ErrText error={built.error} /></div></Check> : null}
          {built?.result ? (built.result.verify.ok
            ? <Check kind="ok" title="Tayyor fayl tekshirildi — farq yo'q"><span>Fayl qayta o'qildi: {nf(built.result.verify.cells)} ta katak manba bilan solishtirildi, svod «жараён (2)» varag'idan qayta sanaldi, kesh yozuvlari tekshirildi.</span></Check>
            : <Check kind="bad" title="Tayyor fayl tekshiruvdan o'tmadi"><div className="need bad"><ul>{built.result.verify.errors.slice(0, 12).map((x, i) => <li key={i}>{x}</li>)}</ul><span>Fayl berilmaydi. Manba faylni tekshirib, qayta tashlang.</span></div></Check>) : null}
        </ul>
      </StatusBox>

      <Tabs tabs={[['svod', 'Svod', null], ['cmp', 'Solishtirish', cmpCnt], ['rows', 'Murojaatlar', n]]} cur={s.tab} onTab={t => dispatch({ type: 'tab', tab: t })}
        tag={<button type="button" className="btn sm clear" id="clearAll" title="Fayllarni olib tashlab, sahifani boshidan boshlash" onClick={onReset}>Tozalash</button>}>
        {s.tab === 'cmp' ? (
          s.prev.status === 'error' && s.prev.error ? <div className="msg bad"><p><b>Oldingi hisobot o'qilmadi.</b></p><ErrText error={s.prev.error} /></div>
            : s.prev.status === 'loading' ? <p className="hint"><Spinner /> Oldingi hisobot o'qilmoqda…</p>
            : fresh?.cmp ? <ComparePane c={fresh.cmp} prevName={s.prev.name} />
            : <div className="empty"><p>Chapdagi «Oldingi hisobot» qutisiga avvalgi tayyor faylni tashlang. Nima chiqib ketgani, nima qo'shilgani va qaysi murojaat o'zgargani shu yerda chiqadi.</p></div>
        ) : s.tab === 'rows' ? (
          <RowsPane rows={info.rows} newFrom={newFrom} analysis={fresh} />
        ) : pv ? (
          <Paper date={labels.sheet} note={s.newOk ? null : <p className="hint">«Янги келган» ustuni tasdiqlanmagan son bo'yicha ko'rsatilgan.</p>}
            sheets={{ main: <RowsPane rows={info.rows} newFrom={newFrom} analysis={fresh} />, src: <RowsPane kind="src" rows={info.rows} newFrom={newFrom} analysis={fresh} /> }}>
            <SvodTable v={pv} />
          </Paper>
        ) : (
          <div className="empty"><p>{fresh ? 'Yuqoridagi tasniflarga toifa tanlanganidan keyin svod shu yerda chiqadi.' : 'Svod hisoblanmoqda…'}</p></div>
        )}
      </Tabs>
    </>
  );
}

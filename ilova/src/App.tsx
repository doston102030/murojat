/* Ilova: holat (reducer) + dvigatel (Web Worker) + ikki ustun. */
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { BASE_RULES, XLSX_MIME, collator } from './engine/core';
import type { Which } from './engine/protocol';
import { Boot } from './ui/Boot';
import { EngineClient } from './ui/client';
import { Icon, IconDefs } from './ui/icons';
import { Inputs } from './ui/Inputs';
import { Output } from './ui/Output';
import { forgetLast, loadLast, loadRules, loadShared, pushLast, pushRules, saveFile, saveLast, saveRules, type RulePair } from './ui/platform';
import { greet, play, setSound, soundOn, unlock, type SoundName } from './ui/sound';
import { initState, phaseOf, readyResult, reducer } from './ui/state';
import { Taskbar } from './ui/Taskbar';

export function App() {
  const [s, dispatch] = useReducer(reducer, undefined, () => initState(loadRules(), loadLast()));
  const client = useMemo(() => new EngineClient(), []);
  const ids = useRef({ exp: 0, prev: 0 });
  const live = useRef(s);
  live.current = s;
  const phase = phaseOf(s);

  /* kirish ekrani: ovoz yoqilgan bo'lsa chiqadi (bosish brauzerga ovoz ruxsatini beradi); avtomatik testda chiqmaydi */
  const [boot, setBoot] = useState(() => soundOn() && !navigator.webdriver);
  const [enter, setEnter] = useState(false);
  /* «Boshlash» bosildi: kuy + salom. Xush kelibsiz ekrani salom tugaguncha turadi (ms qaytaradi). */
  const onBootSound = useCallback(async (withSound: boolean) => {
    if (!withSound) { setSound(false, true); return 900; }
    unlock(); play('start');
    const sec = await greet();
    return Math.max(1300, Math.round(sec * 1000) + 300);
  }, []);
  const onBootDone = useCallback(() => { setBoot(false); setEnter(true); }, []);

  /* ovozlar: har bir bosishda «tik», tugmaning data-snd'si bo'lsa — o'sha ovoz ('none' — jim) */
  useEffect(() => {
    const down = () => unlock();
    const click = (e: MouseEvent) => {
      const el = e.target instanceof Element ? e.target.closest<HTMLElement>('button, summary, a[href], label.drop') : null;
      if (!el || (el as HTMLButtonElement).disabled) return;
      const k = el.dataset.snd ?? 'click';
      if (k !== 'none') play(k as SoundName);
    };
    const change = (e: Event) => { if (e.target instanceof HTMLSelectElement) play('click'); };
    window.addEventListener('pointerdown', down, true);
    window.addEventListener('keydown', down, true);
    window.addEventListener('click', click, true);
    window.addEventListener('change', change, true);
    return () => {
      window.removeEventListener('pointerdown', down, true);
      window.removeEventListener('keydown', down, true);
      window.removeEventListener('click', click, true);
      window.removeEventListener('change', change, true);
    };
  }, []);

  /* holat o'zgarsa — ovoz: tayyor («ta-da!», shu fayl uchun qayta tayyorlansa — qisqa), savol, xato */
  const heard = useRef({ phase, okFor: 0 });
  useEffect(() => {
    const h = heard.current;
    if (phase === h.phase) return;
    h.phase = phase;
    const id = live.current.exp.id;
    if (phase === 'ok') { play(h.okFor === id ? 'okSmall' : 'ok'); h.okFor = id; }
    else if (phase === 'warn') play('warn');
    else if (phase === 'bad') play('bad');
    document.body.classList.toggle('busy', phase === 'busy');
  }, [phase]);

  /* dvigateldan kelgan javoblar */
  useEffect(() => client.subscribe(m => {
    switch (m.t) {
      case 'loaded': return m.which === 'exp' ? dispatch({ type: 'loaded', which: 'exp', id: m.id, info: m.info }) : dispatch({ type: 'loaded', which: 'prev', id: m.id, info: m.info });
      case 'loadError': return dispatch({ type: 'loadError', which: m.which, id: m.id, error: m.error });
      case 'deduped': return dispatch({ type: 'deduped', id: m.id, info: m.info });
      case 'analysis': return dispatch({ type: 'analysis', seq: m.seq, analysis: m.analysis });
      case 'built': return dispatch({ type: 'built', seq: m.seq, result: m.result });
      case 'buildError': return dispatch({ type: 'buildError', seq: m.seq, error: m.error });
      case 'crash': return dispatch({ type: 'crash', message: m.message });
    }
  }), [client]);

  /* kiritish o'zgarsa (seq) — qayta hisob. Eski javoblar seq bo'yicha tashlanadi. */
  useEffect(() => {
    if (s.exp.status !== 'ready') return;
    client.send({
      t: 'compute', seq: s.seq, expId: s.exp.id, prevId: s.prev.status === 'ready' ? s.prev.id : null,
      rules: s.rules, newCount: s.newCount, confirmed: s.newOk && !s.editNew, date: s.date,
    });
  }, [s.seq, client]);            // seq barcha kiritishlarni qamraydi (reducer'dagi bump)

  /* Claude ichida ochilgan bo'lsa — umumiy xotiradagi qoidalar */
  useEffect(() => { void loadShared().then(x => { if (x) dispatch({ type: 'shared', rules: x.rules, last: x.last }); }); }, []);

  /* qoidalar shu brauzerda eslab qolinadi */
  useEffect(() => { saveRules(s.rules); }, [s.rules]);

  /* tayyor svod — keyingi ochilishda bosh sahifada ko'rinadi */
  const result = readyResult(s);
  useEffect(() => {
    if (!result) return;
    const last = { at: new Date().toISOString(), sana: live.current.date, svod: result.svod };
    dispatch({ type: 'last', last });
    saveLast(last);
    void pushLast(last);
  }, [result]);

  /* fayl ustiga emas, sahifaga tashlansa — brauzer faylni ochib yubormasin */
  useEffect(() => {
    const stop = (e: DragEvent) => { if (!(e.target instanceof Element) || !e.target.closest('.drop')) e.preventDefault(); };
    window.addEventListener('dragover', stop); window.addEventListener('drop', stop);
    return () => { window.removeEventListener('dragover', stop); window.removeEventListener('drop', stop); };
  }, []);

  /* telefonda: fayl o'qilgach natijaga o'tish */
  const expReadyId = s.exp.status === 'ready' ? s.exp.id : 0;
  useEffect(() => {
    if (expReadyId && window.matchMedia?.('(max-width: 900px)').matches) document.getElementById('out')?.scrollIntoView({ block: 'start' });
  }, [expReadyId]);

  const onFile = useCallback(async (which: Which, file: File) => {
    play('drop');
    const id = ++ids.current[which];
    dispatch({ type: 'loadStart', which, id, name: file.name });
    try {
      const bytes = await file.arrayBuffer();
      if (id !== ids.current[which]) return;
      client.send({ t: 'load', which, id, name: file.name, bytes }, [bytes]);
    } catch {
      dispatch({ type: 'loadError', which, id, error: { name: 'EngineError', message: `${file.name}: faylni o'qib bo'lmadi (ruxsat yo'q yoki fayl band).`, items: [] } });
    }
  }, [client]);

  const onClearPrev = useCallback(() => {
    const id = ++ids.current.prev;
    client.send({ t: 'clear', which: 'prev', id });
    dispatch({ type: 'clearPrev', id });
  }, [client]);

  /* «Tozalash»: ikkala fayl, eslab qolingan svod va sana — sahifa boshidan */
  const onReset = useCallback(() => {
    const expId = ++ids.current.exp, prevId = ++ids.current.prev;
    client.send({ t: 'clear', which: 'exp', id: expId });
    client.send({ t: 'clear', which: 'prev', id: prevId });
    dispatch({ type: 'reset', expId, prevId });
    void forgetLast();
  }, [client]);

  const onForgetLast = useCallback(() => {
    dispatch({ type: 'forgetLast' });
    void forgetLast();
  }, []);

  const onRules = useCallback((pairs: RulePair[]) => {
    dispatch({ type: 'setRules', pairs });
    void pushRules(pairs).then(ok => { if (!ok) dispatch({ type: 'note', note: 'Qoida shu brauzerda saqlandi, lekin umumiy xotiraga yozilmadi.' }); });
  }, []);

  const onSave = useCallback(async () => {
    const r = readyResult(live.current);
    if (!r || live.current.saving) return;
    dispatch({ type: 'saving' });
    const t0 = performance.now();
    play('save');                                            // «vush», tugagach — qo'ng'iroq
    const msg = await saveFile(r.bytes, r.filename, XLSX_MIME);
    play(msg.ok ? 'done' : 'bad', Math.max(0, 0.5 - (performance.now() - t0) / 1000));
    dispatch({ type: 'saved', msg });
  }, []);

  const onDedupe = useCallback(() => { client.send({ t: 'dedupe', id: live.current.exp.id }); }, [client]);

  const allCats = useMemo(() => {
    const set = new Set<string>(BASE_RULES.map(r => r[1]));
    for (const [, c] of s.rules) if (c) set.add(c);
    for (const c of s.cats) set.add(c);
    return Array.from(set).sort(collator.compare);
  }, [s.rules, s.cats]);

  return (
    <>
      <IconDefs />
      {boot ? <Boot onSound={onBootSound} onDone={onBootDone} /> : null}
      <div className={'desk' + (enter ? ' enter' : '')} inert={boot}>
        <div className="wrap body">
          <header className="mast">
            <div className="orb"><Icon name="logo" size={52} /></div>
            <div className="mast-txt">
              <h1>Jarayondagi murojaatlar svodi</h1>
              <p>Portaldan olingan ro'yxatni tashlang: tasnif qo'yiladi, svod hisoblanadi va shablondagi Excel tayyor bo'ladi.</p>
            </div>
            <div className="lock"><Icon name="lock" size={20} /><span>Fayl shu brauzerning o'zida ishlanadi, tashqariga yuborilmaydi</span></div>
          </header>
          <div className="grid">
            <Inputs s={s} allCats={allCats} onFile={onFile} onDate={date => dispatch({ type: 'setDate', date })}
              onClearPrev={onClearPrev} onRules={onRules} onAddCat={name => dispatch({ type: 'addCat', name })} />
            <div className="col" id="out" aria-live="polite">
              <Output s={s} dispatch={dispatch} allCats={allCats} onSave={onSave} onDedupe={onDedupe} onRules={onRules} onForgetLast={onForgetLast} onReset={onReset} />
            </div>
          </div>
          <footer className="foot">
            <span className="px"><b>xlsx</b><i>3 varaq, svod bilan</i></span>
            <span className="px g"><b>tekshiruv</b><i>har safar</i></span>
            <span className="px o"><b>fayl</b><i>brauzerda qoladi</i></span>
            <span className="px"><b>react</b><i>worker · qotmaydi</i></span>
            <span className="px r"><b>ovoz</b><i>stereo</i></span>
          </footer>
        </div>
      </div>
      <div inert={boot}><Taskbar phase={phase} canSave={!!result} onSave={onSave} /></div>
    </>
  );
}

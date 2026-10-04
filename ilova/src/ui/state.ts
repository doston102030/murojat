/* Sahifa holati — bitta reducer. Asosiy qoida: kiritilgan narsa o'zgarsa, seq oshadi va eski natija
   darhol bekor bo'ladi (saqlash tugmasi o'chadi). Dvigateldan kelgan javob faqat o'z seq/id'si mos kelsa qabul qilinadi. */
import { norm, todayTashkent } from '../engine/core';
import type { Analysis, Built, ErrInfo, ExpInfo, TableInfo, Which } from '../engine/protocol';
import type { LastSvod, RulePair, SaveMsg } from './platform';

export type Tab = 'svod' | 'cmp' | 'rows';
export type SlotStatus = 'none' | 'loading' | 'ready' | 'error';
export interface Slot<I> { id: number; name: string; status: SlotStatus; info: I | null; error: ErrInfo | null }
export interface BuildState { seq: number; status: 'idle' | 'building' | 'ok' | 'error'; result: Built | null; error: ErrInfo | null }

export interface State {
  exp: Slot<ExpInfo>;
  prev: Slot<TableInfo>;
  date: string;
  newCount: number;
  newOk: boolean;           // yangi kelganlar soni tasdiqlangan (yoki aniq topilgan)
  editNew: boolean;         // foydalanuvchi sonni qayta tahrirlamoqda
  rules: RulePair[];        // foydalanuvchi qo'shgan qoidalar
  cats: string[];           // qo'lda qo'shilgan toifalar
  seq: number;
  analysis: Analysis | null;
  build: BuildState;
  saving: boolean;
  saveMsg: SaveMsg | null;
  tab: Tab;
  note: string | null;
  last: LastSvod | null;
  crash: string | null;
}

const emptySlot = <I,>(): Slot<I> => ({ id: 0, name: '', status: 'none', info: null, error: null });
const idleBuild = (seq: number): BuildState => ({ seq, status: 'idle', result: null, error: null });

export function initState(rules: RulePair[], last: LastSvod | null): State {
  return {
    exp: emptySlot(), prev: emptySlot(), date: todayTashkent(), newCount: 0, newOk: false, editNew: false,
    rules, cats: [], seq: 1, analysis: null, build: idleBuild(1), saving: false, saveMsg: null, tab: 'svod',
    note: null, last, crash: null,
  };
}

export type Action =
  | { type: 'loadStart'; which: Which; id: number; name: string }
  | { type: 'loaded'; which: 'exp'; id: number; info: ExpInfo }
  | { type: 'loaded'; which: 'prev'; id: number; info: TableInfo }
  | { type: 'loadError'; which: Which; id: number; error: ErrInfo }
  | { type: 'clearPrev'; id: number }
  | { type: 'deduped'; id: number; info: ExpInfo }
  | { type: 'setDate'; date: string }
  | { type: 'pickNew'; n: number }
  | { type: 'editNew' }
  | { type: 'setRules'; pairs: RulePair[] }
  | { type: 'addCat'; name: string }
  | { type: 'analysis'; seq: number; analysis: Analysis }
  | { type: 'built'; seq: number; result: Built }
  | { type: 'buildError'; seq: number; error: ErrInfo }
  | { type: 'saving' }
  | { type: 'saved'; msg: SaveMsg }
  | { type: 'tab'; tab: Tab }
  | { type: 'note'; note: string | null }
  | { type: 'shared'; rules: RulePair[]; last: LastSvod | null }
  | { type: 'last'; last: LastSvod }
  | { type: 'crash'; message: string };

/** Kiritish o'zgardi: yangi seq, eski natija bekor */
const bump = (s: State): State => ({ ...s, seq: s.seq + 1, build: idleBuild(s.seq + 1), saveMsg: null });

export function mergeRules(base: RulePair[], pairs: RulePair[]): RulePair[] {
  const m = new Map(base.map(([t, c]) => [norm(t), norm(c)] as const));
  for (const [t, c] of pairs) if (norm(t)) m.set(norm(t), norm(c));
  return Array.from(m);
}

export function reducer(s: State, a: Action): State {
  switch (a.type) {
    case 'loadStart': {
      const slot = { id: a.id, name: a.name, status: 'loading' as const, info: null, error: null };
      if (a.which === 'exp') return bump({ ...s, exp: slot, analysis: null, newCount: 0, newOk: false, editNew: false, tab: 'svod' });
      return bump({ ...s, prev: slot, tab: 'cmp' });
    }
    case 'loaded': {
      if (a.which === 'exp') {
        if (a.id !== s.exp.id) return s;
        const det = a.info.det;
        return bump({ ...s, exp: { ...s.exp, status: 'ready', info: a.info }, newCount: det.count, newOk: det.sure, editNew: false });
      }
      if (a.id !== s.prev.id) return s;
      return bump({ ...s, prev: { ...s.prev, status: 'ready', info: a.info } });
    }
    case 'loadError': {
      const slot = a.which === 'exp' ? s.exp : s.prev;
      if (a.id !== slot.id) return s;
      const next = { ...slot, status: 'error' as const, info: null, error: a.error };
      return bump(a.which === 'exp' ? { ...s, exp: next as Slot<ExpInfo>, analysis: null } : { ...s, prev: next as Slot<TableInfo> });
    }
    case 'clearPrev':
      return bump({ ...s, prev: { ...emptySlot<TableInfo>(), id: a.id }, tab: s.tab === 'cmp' ? 'svod' : s.tab });
    case 'deduped': {
      if (a.id !== s.exp.id || s.exp.status !== 'ready') return s;
      return bump({ ...s, exp: { ...s.exp, info: a.info }, newCount: a.info.det.count, newOk: a.info.det.sure, editNew: false });
    }
    case 'setDate':
      return a.date === s.date ? s : bump({ ...s, date: a.date });
    case 'pickNew': {
      const max = s.exp.info ? s.exp.info.rowCount : 0;
      if (!Number.isInteger(a.n) || a.n < 0 || a.n > max) return s;
      return bump({ ...s, newCount: a.n, newOk: true, editNew: false });
    }
    case 'editNew':
      return bump({ ...s, editNew: true });
    case 'setRules':
      return bump({ ...s, rules: mergeRules(s.rules, a.pairs), note: null });
    case 'addCat': {
      const name = norm(a.name);
      return !name || s.cats.includes(name) ? s : { ...s, cats: [...s.cats, name] };
    }
    case 'analysis':
      if (a.seq !== s.seq) return s;
      return { ...s, analysis: a.analysis, build: a.analysis.willBuild ? { seq: a.seq, status: 'building', result: null, error: null } : idleBuild(a.seq) };
    case 'built':
      if (a.seq !== s.seq) return s;
      return { ...s, build: { seq: a.seq, status: 'ok', result: a.result, error: null } };
    case 'buildError':
      if (a.seq !== s.seq) return s;
      return { ...s, build: { seq: a.seq, status: 'error', result: null, error: a.error } };
    case 'saving':
      return { ...s, saving: true, saveMsg: null };
    case 'saved':
      return { ...s, saving: false, saveMsg: a.msg };
    case 'tab':
      return { ...s, tab: a.tab };
    case 'note':
      return { ...s, note: a.note };
    case 'shared': {
      const rules = mergeRules(a.rules, s.rules);              // shu brauzerdagi o'zgarishlar ustun
      const changed = rules.length !== s.rules.length || rules.some(([t, c], i) => s.rules[i]?.[0] !== t || s.rules[i]?.[1] !== c);
      const next = { ...s, rules, last: s.last ?? a.last };
      return changed ? bump(next) : next;
    }
    case 'last':
      return { ...s, last: a.last };
    case 'crash':
      return { ...s, crash: a.message };
  }
}

/* ---------------------------------------------------------------- hosila qiymatlar */
export const isBusy = (s: State) =>
  s.exp.status === 'loading' || s.prev.status === 'loading' ||
  (s.exp.status === 'ready' && (!s.analysis || s.analysis.seq !== s.seq)) || s.build.status === 'building';

/** Saqlashga tayyor, tekshiruvdan o'tgan va aynan hozirgi kiritishlarga tegishli natija */
export const readyResult = (s: State): Built | null =>
  s.build.status === 'ok' && s.build.seq === s.seq && s.build.result && s.build.result.verify.ok ? s.build.result : null;

/** Hozirgi holat bir so'zda: holat oynasi, pastki panel va ovozlar shunga qaraydi */
export type Phase = 'idle' | 'busy' | 'ok' | 'warn' | 'bad';
export function phaseOf(s: State): Phase {
  if (s.crash || (s.exp.status === 'error' && s.exp.error)) return 'bad';
  if (s.exp.status === 'loading') return 'busy';
  if (s.exp.status !== 'ready' || !s.exp.info) return 'idle';
  if (isBusy(s)) return 'busy';
  if (readyResult(s)) return 'ok';
  const built = s.build.seq === s.seq ? s.build : null;
  const failed = !!(built && ((built.result && !built.result.verify.ok) || built.status === 'error'));
  return failed || s.exp.info.problemCount ? 'bad' : 'warn';
}

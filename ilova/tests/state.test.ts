/* Sahifa holati: yangi kelganlar soni sanaga qarab, «Tozalash». */
import { describe, expect, it } from 'vitest';
import type { ExpInfo } from '../src/engine/protocol';
import { initState, reducer, staleDay, type State } from '../src/ui/state';
import { day } from './fixture';

const info = (lastUpd: number | null, sure = true): ExpInfo => ({
  name: 'Янги.xlsx', sheetName: 'жараён', headerRow: 2, firstRow: 4, lastRow: 125, rowCount: 122,
  problems: [], problemCount: 0, reportDate: null, lastUpd, full: null, rows: [],
  det: { count: 29, sure, kind: sure ? 'restart' : 'many', boundaryRow: 97, tableEnd: true, candidates: [{ count: 29, row: 97 }] },
});
const loaded = (date: string, lastUpd: number | null, sure = true): State => {
  let s = reducer(initState([], null), { type: 'setDate', date });
  s = reducer(s, { type: 'loadStart', which: 'exp', id: 1, name: 'Янги.xlsx' });
  return reducer(s, { type: 'loaded', which: 'exp', id: 1, info: info(lastUpd, sure) });
};
const kecha = day('2026-10-03', 16, 45);

describe('yangi kelganlar — sanaga qarab', () => {
  it('ro\'yxat shu kunniki — pastdagi ro\'yxat yangi kelgan', () => {
    const s = loaded('2026-10-03', kecha);
    expect(staleDay(s)).toBeNull();
    expect([s.newCount, s.newOk]).toEqual([29, true]);
  });
  it('kechagi ro\'yxat bugungi sana bilan — bugun kelgan yo\'q: 0, so\'ralmaydi', () => {
    const s = loaded('2026-10-04', kecha);
    expect(staleDay(s)).toBe('2026-10-03');
    expect([s.newCount, s.newOk]).toEqual([0, true]);
  });
  it('kechagi ro\'yxatda qo\'lda qo\'yilgan son faqat o\'sha sana uchun', () => {
    const s = loaded('2026-10-04', kecha);
    expect(reducer(s, { type: 'editNew' }).editNew).toBe(true);
    const forced = reducer(s, { type: 'pickNew', n: 3 });
    expect([forced.newCount, forced.newOk, forced.editNew]).toEqual([3, true, false]);
    expect(reducer(forced, { type: 'setDate', date: '2026-10-05' }).newCount).toBe(0);         // boshqa sana — yana 0
    expect(reducer(forced, { type: 'setDate', date: '2026-10-03' }).newCount).toBe(29);        // ro'yxat kuni — pastdagi ro'yxat
    const again = reducer(forced, { type: 'loaded', which: 'exp', id: 1, info: info(kecha) });
    expect(again.newCount).toBe(0);                                                              // fayl qayta o'qilsa — qo'lda qo'yilgani unutiladi
  });
  it('sana ro\'yxat kuniga qaytsa — yana pastdagi ro\'yxat; tasdiqlangan son saqlanadi', () => {
    const s = loaded('2026-10-03', kecha, false);
    expect(s.newOk).toBe(false);
    const picked = reducer(s, { type: 'pickNew', n: 5 });
    expect([picked.newCount, picked.newOk]).toEqual([5, true]);
    const ahead = reducer(picked, { type: 'setDate', date: '2026-10-04' });
    expect([ahead.newCount, ahead.newOk]).toEqual([0, true]);
    const back = reducer(ahead, { type: 'setDate', date: '2026-10-03' });
    expect([back.newCount, back.newOk]).toEqual([5, true]);
  });
  it('ro\'yxat hisobot sanasidan keyingi kunniki yoki yangilanish sanasi yo\'q — pastdagi ro\'yxat', () => {
    expect(loaded('2026-10-02', kecha).newCount).toBe(29);
    expect(loaded('2026-10-04', null).newCount).toBe(29);
  });
});

describe('tozalash', () => {
  it('fayllar, eslab qolingan svod va sana — boshidan', () => {
    const s = { ...loaded('2026-10-01', kecha), last: { at: '', sana: '2026-10-03', svod: { cats: [], orgs: [], ustun: [], jami: 122, yangi: 29 } } };
    const r = reducer(s, { type: 'reset', expId: 2, prevId: 5 });
    expect([r.exp.status, r.prev.status, r.last, r.newCount]).toEqual(['none', 'none', null, 0]);
    expect(r.date).toBe(initState([], null).date);
    expect(r.seq).toBeGreaterThan(s.seq);
    expect(reducer(r, { type: 'loaded', which: 'exp', id: 1, info: info(kecha) }).exp.status).toBe('none');   // eski javob qaytmaydi
  });
  it('faqat eslab qolingan svodni unutish', () => {
    const s = { ...initState([], null), last: { at: '', sana: '2026-10-03', svod: { cats: [], orgs: [], ustun: [], jami: 1, yangi: 0 } } };
    expect(reducer(s, { type: 'forgetLast' }).last).toBeNull();
  });
});

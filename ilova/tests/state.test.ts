/* Sahifa holati: ro'yxat boshqa kunniki bo'lsa, hisobot sanasi so'raladi. */
import { describe, expect, it } from 'vitest';
import type { ExpInfo } from '../src/engine/protocol';
import { dateAsk, initState, reducer, type State } from '../src/ui/state';
import { day } from './fixture';

const info = (lastUpd: number | null): ExpInfo => ({
  name: 'Янги.xlsx', sheetName: 'жараён', headerRow: 2, firstRow: 4, lastRow: 125, rowCount: 122,
  problems: [], problemCount: 0, reportDate: null, lastUpd, rows: [],
  det: { count: 29, sure: true, kind: 'restart', boundaryRow: 97, tableEnd: true, candidates: [{ count: 29, row: 97 }] },
});
const loaded = (date: string, lastUpd: number | null): State => {
  let s = reducer(initState([], null), { type: 'setDate', date });
  s = reducer(s, { type: 'loadStart', which: 'exp', id: 1, name: 'Янги.xlsx' });
  return reducer(s, { type: 'loaded', which: 'exp', id: 1, info: info(lastUpd) });
};

describe('ro\'yxat kuni va hisobot sanasi', () => {
  it('kechagi ro\'yxat bugungi sana bilan — so\'raladi', () => {
    expect(dateAsk(loaded('2026-10-04', day('2026-10-03', 16, 45)))).toBe('2026-10-03');
  });
  it('kuni bir xil yoki yangilanish sanasi yo\'q — so\'ralmaydi', () => {
    expect(dateAsk(loaded('2026-10-03', day('2026-10-03', 16, 45)))).toBeNull();
    expect(dateAsk(loaded('2026-10-04', null))).toBeNull();
  });
  it('«qolsin» — javob eslab qolinadi; sana yoki fayl o\'zgarsa, qayta so\'raladi', () => {
    const s = loaded('2026-10-04', day('2026-10-03', 16, 45));
    const kept = reducer(s, { type: 'keepDate' });
    expect(dateAsk(kept)).toBeNull();
    expect(kept.seq).toBeGreaterThan(s.seq);                       // qayta hisob boshlanadi
    expect(dateAsk(reducer(kept, { type: 'setDate', date: '2026-10-05' }))).toBe('2026-10-03');
    const again = reducer(reducer(kept, { type: 'loadStart', which: 'exp', id: 2, name: 'b.xlsx' }), { type: 'loaded', which: 'exp', id: 2, info: info(day('2026-10-03')) });
    expect(dateAsk(again)).toBe('2026-10-03');
  });
  it('tozalash: fayl olib tashlanadi, eslab qolingan svod unutiladi', () => {
    const s = { ...loaded('2026-10-04', day('2026-10-03', 16, 45)), last: { at: '', sana: '2026-10-04', svod: { cats: [], orgs: [], ustun: [], jami: 122, yangi: 29 } } };
    const cleared = reducer(s, { type: 'clearExp', id: 2 });
    expect(cleared.exp.status).toBe('none');
    expect(cleared.seq).toBeGreaterThan(s.seq);
    expect(dateAsk(cleared)).toBeNull();
    expect(reducer(cleared, { type: 'loaded', which: 'exp', id: 1, info: info(null) }).exp.status).toBe('none');   // eski javob qaytmaydi
    expect(reducer(cleared, { type: 'forgetLast' }).last).toBeNull();
  });
  it('«sanani ro\'yxat kuni qilish» — savol yo\'qoladi', () => {
    const s = loaded('2026-10-04', day('2026-10-03', 16, 45));
    expect(dateAsk(reducer(s, { type: 'setDate', date: '2026-10-03' }))).toBeNull();
  });
});

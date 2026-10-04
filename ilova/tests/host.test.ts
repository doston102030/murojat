/* Worker xostı: poyga holatlari (race) — eskirgan fayl yoki hisob yangi holatni bosib ketmasligi kerak. */
import { describe, expect, it } from 'vitest';
import { createHost } from '../src/engine/host';
import type { Reply, Request } from '../src/engine/protocol';
import { portalFile, portalRows } from './fixture';

function harness() {
  const out: Reply[] = [];
  const host = createHost(msg => { out.push(msg); });
  const send = (q: Request) => host.handle(q);
  const buf = async (n: number, nNew: number) => (await portalFile(portalRows(n, nNew))).slice().buffer as ArrayBuffer;
  const until = async (test: () => boolean) => { for (let i = 0; i < 400 && !test(); i++) await new Promise(r => setTimeout(r, 10)); expect(test()).toBe(true); };
  return { out, send, buf, until };
}
const base = { rules: [] as Array<[string, string]>, confirmed: true, date: '2026-10-03' };

describe('dvigatel xostı', () => {
  it('oxirgi tashlangan fayl yutadi, oldingisi kech tugasa ham', async () => {
    const h = harness();
    const [bigBytes, smallBytes] = [await h.buf(3000, 10), await h.buf(5, 1)];
    const big = h.send({ t: 'load', which: 'exp', id: 1, name: 'katta.xlsx', bytes: bigBytes });
    const small = h.send({ t: 'load', which: 'exp', id: 2, name: 'kichik.xlsx', bytes: smallBytes });
    await Promise.all([big, small]);
    const loaded = h.out.filter(m => m.t === 'loaded');
    expect(loaded).toHaveLength(1);
    expect(loaded[0]).toMatchObject({ id: 2, info: { name: 'kichik.xlsx', rowCount: 5 } });
  });

  it('buzilgan fayl xatosi ham eskirsa — tashlab yuboriladi', async () => {
    const h = harness();
    const okBytes = await h.buf(4, 1);
    const bad = h.send({ t: 'load', which: 'exp', id: 1, name: 'bad.xlsx', bytes: new Uint8Array([1, 2, 3]).buffer });
    const good = h.send({ t: 'load', which: 'exp', id: 2, name: 'ok.xlsx', bytes: okBytes });
    await Promise.all([bad, good]);
    expect(h.out.map(m => m.t)).toEqual(['loaded']);
  });

  it('hisob: tahlil darhol, keyin tekshirilgan fayl', async () => {
    const h = harness();
    await h.send({ t: 'load', which: 'exp', id: 1, name: 'a.xlsx', bytes: await h.buf(20, 3) });
    await h.send({ t: 'compute', seq: 1, expId: 1, prevId: null, newCount: 3, ...base });
    const a = h.out.find(m => m.t === 'analysis');
    expect(a && a.t === 'analysis' && a.analysis.willBuild).toBe(true);
    const b = h.out.find(m => m.t === 'built');
    expect(b && b.t === 'built' && b.result.verify.ok).toBe(true);
    expect(b && b.t === 'built' && b.result.svod.yangi).toBe(3);
  });

  it('yangi hisob so\'rovi kelsa, eskisining fayli chiqarilmaydi', async () => {
    const h = harness();
    await h.send({ t: 'load', which: 'exp', id: 1, name: 'a.xlsx', bytes: await h.buf(2000, 3) });
    const first = h.send({ t: 'compute', seq: 1, expId: 1, prevId: null, newCount: 3, ...base });
    const second = h.send({ t: 'compute', seq: 2, expId: 1, prevId: null, newCount: 3, ...base, date: '2026-10-04' });
    await Promise.all([first, second]);
    const built = h.out.filter(m => m.t === 'built');
    expect(built).toHaveLength(1);
    expect(built[0]).toMatchObject({ seq: 2, result: { filename: 'Жараёндаги мурожаатлар 04.10.2026й.xlsx' } });
  });

  it('boshqa faylga tegishli hisob so\'rovi bajarilmaydi', async () => {
    const h = harness();
    await h.send({ t: 'load', which: 'exp', id: 5, name: 'a.xlsx', bytes: await h.buf(5, 1) });
    await h.send({ t: 'compute', seq: 1, expId: 4, prevId: null, newCount: 1, ...base });
    await h.send({ t: 'compute', seq: 2, expId: 5, prevId: 9, newCount: 1, ...base });
    expect(h.out.filter(m => m.t === 'analysis')).toHaveLength(0);
  });

  it('tasdiqlanmagan son yoki noma\'lum tasnif — fayl yig\'ilmaydi', async () => {
    const h = harness();
    await h.send({ t: 'load', which: 'exp', id: 1, name: 'a.xlsx', bytes: await h.buf(5, 1) });
    await h.send({ t: 'compute', seq: 1, expId: 1, prevId: null, newCount: 1, ...base, confirmed: false });
    expect(h.out.some(m => m.t === 'built')).toBe(false);
  });

  it('oldingi hisobot bilan solishtirish va uni olib tashlash', async () => {
    const h = harness();
    await h.send({ t: 'load', which: 'exp', id: 1, name: 'a.xlsx', bytes: await h.buf(10, 2) });
    await h.send({ t: 'load', which: 'prev', id: 1, name: 'b.xlsx', bytes: await h.buf(12, 2) });
    await h.send({ t: 'compute', seq: 1, expId: 1, prevId: 1, newCount: 2, ...base });
    const a = h.out.find(m => m.t === 'analysis');
    expect(a && a.t === 'analysis' && a.analysis.cmp).toMatchObject({ prevTotal: 12, total: 10 });
    h.send({ t: 'clear', which: 'prev', id: 2 });
    h.out.length = 0;
    await h.send({ t: 'compute', seq: 2, expId: 1, prevId: null, newCount: 2, ...base });
    const a2 = h.out.find(m => m.t === 'analysis');
    expect(a2 && a2.t === 'analysis' && a2.analysis.cmp).toBeNull();
  });

  it('takrorlarni olib tashlash yangi ro\'yxat va qayta aniqlangan yangi kelganlarni qaytaradi', async () => {
    const h = harness();
    const rows = portalRows(6, 0);
    rows[5][0] = rows[4][0]; rows[5][1] = rows[4][1];
    await h.send({ t: 'load', which: 'exp', id: 1, name: 'a.xlsx', bytes: (await portalFile(rows)).slice().buffer as ArrayBuffer });
    await h.send({ t: 'dedupe', id: 1 });
    const d = h.out.find(m => m.t === 'deduped');
    expect(d && d.t === 'deduped' && d.info.rowCount).toBe(5);
  });
});

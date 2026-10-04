import { describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import {
  BASE_RULES, EngineError, classify, compare, dateLabels, detectNew, findDuplicates, dedupe, rulesMap, svod, textToSerial, fmtSerial,
} from '../src/engine/core';
import { build, readTable, verify } from '../src/engine/xlsx';
import { parse, sax, findAll, textOf, nsAttr, XmlError } from '../src/engine/xml';
import { day, portalFile, portalRows } from './fixture';

describe('sana yorliqlari', () => {
  it('tanlangan sanadan svod va fayl nomi yorliqlari', () => {
    const l = dateLabels('2026-10-03');
    expect(l).toEqual({ dmy: '03.10.2026', sheet: '03.10.2026й', newCol: '3-окт ЯНГИ КЕЛГАН', file: 'Жараёндаги мурожаатлар 03.10.2026й.xlsx' });
  });
  it('mavjud bo\'lmagan sanalarni rad etadi, kabisa kunini qabul qiladi', () => {
    for (const d of ['', '2026-13-40', '2026-00-03', '2026-10-00', '2026-02-29', '2026-04-31', '1900-02-29', '0000-01-01'])
      expect(() => dateLabels(d), d).toThrow(EngineError);
    expect(dateLabels('2024-02-29').dmy).toBe('29.02.2024');
    expect(dateLabels('2000-02-29').dmy).toBe('29.02.2000');
  });
  it('matn ko\'rinishidagi sanalarni Excel raqamiga aylantiradi', () => {
    expect(textToSerial('01.10.2026 09:00')).toBeCloseTo(day('2026-10-01', 9), 9);
    expect(textToSerial('2026-10-01T09:00')).toBeCloseTo(day('2026-10-01', 9), 9);
    expect(textToSerial('31.02.2026')).toBeNull();
    expect(fmtSerial(day('2026-10-01', 9, 5), true)).toBe('01.10.2026 09:05:00');
  });
  it('yaroqsiz sana bilan yig\'ish fayl chiqarmaydi', async () => {
    await expect(build({ rows: [], newCount: 0, date: '2026-02-30', printer: null })).rejects.toThrow(EngineError);
  });
});

describe('XML o\'qigich', () => {
  it('entity, CDATA, izoh, nom fazolari', () => {
    const doc = parse('<?xml version="1.0"?><!-- izoh --><a xmlns:r="http://x/relationships"><b r:id="rId1" t="&lt;&amp;&#x41;&#66;"/><c><![CDATA[<x>]]> &quot;y&quot;</c></a>');
    const b = findAll(doc, 'b')[0];
    expect(b.attrs.t).toBe('<&AB');
    expect(nsAttr(b.attrs, b.ns, 'id', /relationships$/)).toBe('rId1');
    expect(textOf(findAll(doc, 'c')[0])).toBe('<x> "y"');
  });
  it('buzilgan XML — aniq xato', () => {
    for (const bad of ['<a><b></a>', '<a>', '<a x=1/>', '<!DOCTYPE a><a/>', '<a>&foo;</a>', '<a/><b/>', ''])
      expect(() => sax(bad, { open() {}, close() {}, text() {} }), bad).toThrow(XmlError);
  });
  it('qator oxiri va atribut bo\'shliqlarini XML qoidasi bo\'yicha normallashtiradi', () => {
    const doc = parse('<a v="x\ny">p\r\nq</a>');
    expect(doc.attrs.v).toBe('x y');
    expect(doc.text).toBe('p\nq');
  });
});

describe('portal faylini o\'qish', () => {
  it('shared strings, inline matn, uslub belgilari va havolalar', async () => {
    const rows = portalRows(5, 2);
    rows[1][2] = '  Ikki  bo\'shliq ';
    for (const inline of [false, true]) {
      const t = await readTable(await portalFile(rows, { inline, tableEndAt: [2], redAt: [4], links: { 0: 'https://example.uz/1' } }), 'test');
      expect(t.rows.map(r => r.id)).toEqual(rows.map(r => r[0]));
      expect(t.rows[1].v[2].text).toBe('  Ikki  bo\'shliq ');
      expect(t.rows.map(r => r.tableEnd)).toEqual([false, false, true, false, false]);
      expect(t.rows.map(r => r.red)).toEqual([false, false, false, false, true]);
      expect(t.rows[0].linkA).toBe('https://example.uz/1');
      expect(t.problems).toEqual([]);
      expect(t.headerRow).toBe(2);
    }
  });
  it('rich text (<r>) va fonetik qism (<rPh>)', async () => {
    const rows = portalRows(1, 0);
    const bytes = await portalFile(rows);
    const zip = await JSZip.loadAsync(bytes);
    const sst = (await zip.file('xl/sharedStrings.xml')!.async('string'))
      .replace('<si><t xml:space="preserve">REQ-100000</t></si>', '<si><r><t>REQ-</t></r><r><rPr/><t>100000</t></r><rPh><t>X</t></rPh></si>');
    zip.file('xl/sharedStrings.xml', sst);
    const t = await readTable(await zip.generateAsync({ type: 'uint8array' }), 'test');
    expect(t.rows[0].id).toBe('REQ-100000');
  });
  it('sarlavha topilmasa yoki ustunlar tartibi boshqa bo\'lsa — tushunarli xato', async () => {
    const zip = await JSZip.loadAsync(await portalFile(portalRows(2, 0)));
    const s = await zip.file('xl/worksheets/sheet1.xml')!.async('string');
    zip.file('xl/worksheets/sheet1.xml', s.replace(/<row r="2">.*?<\/row>/, ''));
    await expect(readTable(await zip.generateAsync({ type: 'uint8array' }), 'P')).rejects.toThrow(/sarlavhasi bor jadval topilmadi/);
    await expect(readTable(new Uint8Array([1, 2, 3]), 'P')).rejects.toThrow(/xlsx fayl emas/);
  });
  it('bo\'sh va noto\'g\'ri kataklar muammo sifatida ko\'rsatiladi', async () => {
    const rows = portalRows(3, 0);
    rows[0][6] = null; rows[1][12] = 'ertaga'; rows[2][8] = null;
    const t = await readTable(await portalFile(rows), 'P');
    expect(t.problems).toEqual([
      '4-qator: murojaat tasnifi (G ustuni) bo\'sh',
      '5-qator: «Ижрога йўналтирилган сана» sanaga o\'xshamaydi («ertaga»)',
      '6-qator: ijrochi tashkilot (I ustuni) bo\'sh',
    ]);
  });
});

describe('tahlil', () => {
  it('yangi kelganlarni sana tartibi qayta boshlanganidan topadi', async () => {
    const t = await readTable(await portalFile(portalRows(40, 6)), 'P');
    const d = detectNew(t.rows);
    expect(d).toMatchObject({ kind: 'restart', count: 6, sure: true, boundaryRow: 4 + 34 });
  });
  it('sana tartibi uzilmasa — foydalanuvchidan so\'raladi', async () => {
    const t = await readTable(await portalFile(portalRows(10, 0), { tableEndAt: [6] }), 'P');
    expect(detectNew(t.rows)).toMatchObject({ kind: 'ends', sure: false, count: 3 });
  });
  it('noma\'lum tasnif va takrorlar', async () => {
    const rows = portalRows(6, 0);
    rows[2][6] = 'Yangi tasnif';
    rows[5][0] = rows[4][0]; rows[5][1] = rows[4][1];
    const t = await readTable(await portalFile(rows), 'P');
    expect(classify(t.rows, rulesMap())).toEqual([{ text: 'Yangi tasnif', count: 1 }]);
    expect(classify(t.rows, rulesMap([['Yangi tasnif', 'Boshqa']]))).toEqual([]);
    expect(findDuplicates(t.rows)).toHaveLength(1);
    expect(dedupe(t.rows)).toHaveLength(5);
  });
});

describe('Excel yig\'ish va tekshirish', () => {
  async function pipeline(n: number, nNew: number) {
    const t = await readTable(await portalFile(portalRows(n, nNew), { links: { 0: 'https://example.uz/a?x=1&y=2' } }), 'P');
    expect(classify(t.rows, rulesMap())).toEqual([]);
    const model = { rows: t.rows, newCount: nNew, date: '2026-10-03', printer: null };
    const b = await build(model);
    return { t, model, b, v: await verify(b.bytes, model) };
  }

  it('uch varaqli kitob yig\'iladi va qayta o\'qilganda manbaga teng', async () => {
    const { t, b, v } = await pipeline(30, 4);
    expect(v.errors).toEqual([]);
    expect(v.ok).toBe(true);
    expect(b.filename).toBe('Жараёндаги мурожаатлар 03.10.2026й.xlsx');
    const sv = svod(t.rows, 4);
    expect(b.svod.total).toBe(30);
    expect(b.svod.newTotal).toBe(4);
    expect(sv.rowTot.reduce((a, x) => a + x, 0)).toBe(30);

    // tayyor faylni "oldingi hisobot" sifatida qayta o'qish
    const back = await readTable(b.bytes, 'Oldingi');
    expect(back.sheetName).toBe('жараён');
    expect(back.reportDate).toBe('2026-10-03');
    expect(back.rows.map(r => r.id)).toEqual(t.rows.map(r => r.id));
    expect(back.rows.map(r => r.v[7].text)).toEqual(t.rows.map(r => r.cat));
    expect(back.rows[0].linkA).toBe('https://example.uz/a?x=1&y=2');
    const c = compare(back.rows, t.rows);
    expect(c.prevNew).toBe(4);
    expect(c.removed.length + c.added.length + c.changed.length).toBe(0);
  });

  it('tekshiruv soxta o\'zgarishni ushlaydi (bo\'sh tekshiruv emas)', async () => {
    const { model, b } = await pipeline(12, 2);
    const zip = await JSZip.loadAsync(b.bytes);
    const s3 = await zip.file('xl/worksheets/sheet3.xml')!.async('string');
    zip.file('xl/worksheets/sheet3.xml', s3.replace('<c r="D5" s="16"><v>1</v></c>', '<c r="D5" s="16"><v>2</v></c>'));
    const s2 = await zip.file('xl/worksheets/sheet2.xml')!.async('string');
    const m = /<c r="([B-Z])5" s="20"><v>(\d+)/.exec(s2)!;           // 5-qatordagi birinchi to'ldirilgan katak
    zip.file('xl/worksheets/sheet2.xml', s2.replace(m[0], `<c r="${m[1]}5" s="20"><v>${Number(m[2]) + 1}`));
    const v = await verify(await zip.generateAsync({ type: 'uint8array' }), model);
    expect(v.ok).toBe(false);
    expect(v.errors.join('\n')).toMatch(/жараён \(2\): 5-qator manbaga teng emas/);
    expect(v.errors.join('\n')).toContain(`Лист2: ${m[1]}5 da ${Number(m[2]) + 1}`);
  });

  it('yangi kelganlar soni noto\'g\'ri yoki toifa yo\'q bo\'lsa — yig\'ilmaydi', async () => {
    const t = await readTable(await portalFile(portalRows(3, 0)), 'P');
    await expect(build({ rows: t.rows, newCount: 0, date: '2026-10-03', printer: null })).rejects.toThrow(/Toifasi belgilanmagan/);
    classify(t.rows, rulesMap());
    await expect(build({ rows: t.rows, newCount: 4, date: '2026-10-03', printer: null })).rejects.toThrow(/Yangi kelganlar soni/);
  });

  it('katta fayl: 20 000 qator — o\'qish, yig\'ish, tekshirish', async () => {
    const bytes = await portalFile(portalRows(20000, 900, 25));
    const t0 = performance.now();
    const t = await readTable(bytes, 'P');
    const t1 = performance.now();
    classify(t.rows, rulesMap());
    const model = { rows: t.rows, newCount: 900, date: '2026-10-03', printer: null };
    const b = await build(model);
    const t2 = performance.now();
    const v = await verify(b.bytes, model);
    const t3 = performance.now();
    expect(v.ok).toBe(true);
    expect(t.rows).toHaveLength(20000);
    console.log(`20k qator: o'qish ${Math.round(t1 - t0)} ms, yig'ish ${Math.round(t2 - t1)} ms, tekshirish ${Math.round(t3 - t2)} ms`);
    expect(t3 - t0).toBeLessThan(15000);
  });
});

it('BASE_RULES — har bir tasnif bitta toifaga', () => {
  const keys = BASE_RULES.map(r => r[0]);
  expect(new Set(keys).size).toBe(keys.length);
});

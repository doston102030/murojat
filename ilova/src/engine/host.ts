/* Dvigatel "xostı": yuklangan jadvallarni saqlaydi va so'rovlarga javob beradi.
   Odatda Web Worker ichida ishlaydi (worker.ts); Worker ochilmasa — asosiy oqimda (zaxira yo'l).
   Har bir so'rovda id/seq bor: eskirgan javob hech qachon yangi holatni bosib ketmaydi. */
import {
  classify, compare, detectByDay, detectNew, dedupe, findDuplicates, fmtSerial, norm, rulesMap, svod,
  type Row, type Table, type Svod,
} from './core';
import { build, readTable, verify } from './xlsx';
import {
  toErrInfo, type Analysis, type BriefRow, type CmpView, type DisplayRow, type ExpInfo, type Reply, type Request,
  type SvodView, type TableInfo, type Which,
} from './protocol';

export type Post = (msg: Reply, transfer?: Transferable[]) => void;

const CAP = 40;
const tick = () => new Promise<void>(r => setTimeout(r, 0));      // navbatdagi xabarlarga yo'l beradi

const person = (r: Row) => [r.v[2].text, r.v[3].text].filter(Boolean).join(' ');
const showDate = (c: Row['v'][number], dateOnly = false) => {
  if (c.kind !== 'num') return c.text;
  const s = fmtSerial(c.num);
  return dateOnly && s.endsWith(' 00:00') ? s.slice(0, 10) : s;
};
const brief = (r: Row): BriefRow => ({ id: r.id, person: person(r), org: r.org, cat: r.cat ?? (r.v[7].text || null) });

export function svodView(sv: Svod): SvodView {
  return { cats: sv.cats, orgs: sv.orgs.map((o, i) => ({ nom: o, s: sv.cnt[i], jami: sv.rowTot[i], yangi: sv.newBy[i] })), ustun: sv.colTot, jami: sv.total, yangi: sv.newTotal };
}

function tableInfo(name: string, t: Table, rows: Row[]): TableInfo {
  let lastUpd: number | null = t.full ? t.full.asOf : null;          // to'liq hisobotda — hisobot paytining o'zi
  if (!t.full) for (const r of rows) { const c = r.v[13]; if (c.kind === 'num' && (lastUpd === null || (c.num as number) > lastUpd)) lastUpd = c.num; }
  return {
    name, sheetName: t.sheetName, headerRow: t.headerRow, firstRow: rows.length && !t.full ? rows[0].r : t.firstRow,
    lastRow: rows.length && !t.full ? rows[rows.length - 1].r : t.lastRow, rowCount: rows.length,
    problems: t.problems.slice(0, 50), problemCount: t.problems.length, reportDate: t.reportDate, lastUpd, full: t.full,
  };
}
function expInfo(name: string, t: Table, rows: Row[]): ExpInfo {
  return {
    ...tableInfo(name, t, rows), det: t.full ? detectByDay(rows, t.full.asOf) : detectNew(rows),
    rows: rows.map((r): DisplayRow => ({
      r: r.r, id: r.id, linkA: r.linkA, person: person(r), district: r.v[5].text, org: r.org,
      deadline: showDate(r.v[11], true), sent: showDate(r.v[12]), upd: showDate(r.v[13]),
    })),
  };
}
function cmpView(prevRows: Row[], rows: Row[]): CmpView {
  const c = compare(prevRows, rows);
  const val = (x: string | number | null, date: boolean) => (date && typeof x === 'number' ? fmtSerial(x, true) : x == null ? '' : String(x));
  return {
    prevTotal: c.prevTotal, total: c.total, prevNew: c.prevNew, orgDelta: c.orgDelta,
    removed: { count: c.removed.length, list: c.removed.slice(0, CAP).map(brief) },
    added: { count: c.added.length, list: c.added.slice(0, CAP).map(brief) },
    changed: {
      count: c.changed.length,
      list: c.changed.slice(0, CAP).map(x => ({ id: x.row.id, person: person(x.row), diffs: x.diffs.map(d => ({ header: d.header, from: val(d.from, d.date), to: val(d.to, d.date) })) })),
    },
  };
}

interface Slot { id: number; name: string; table: Table; rows: Row[] }

export function createHost(post: Post) {
  const slots: Record<Which, Slot | null> = { exp: null, prev: null };
  const latestLoad: Record<Which, number> = { exp: 0, prev: 0 };
  let latestSeq = 0;

  async function load(which: Which, id: number, name: string, bytes: ArrayBuffer) {
    latestLoad[which] = id;
    slots[which] = null;
    try {
      const table = await readTable(bytes, which === 'exp' ? 'Portal ro\'yxati' : 'Oldingi hisobot');
      if (latestLoad[which] !== id) return;                       // ustidan yangi fayl tashlangan
      slots[which] = { id, name, table, rows: table.rows };
      if (which === 'exp') post({ t: 'loaded', which, id, info: expInfo(name, table, table.rows) });
      else post({ t: 'loaded', which, id, info: tableInfo(name, table, table.rows) });
    } catch (e) {
      if (latestLoad[which] !== id) return;
      post({ t: 'loadError', which, id, error: toErrInfo(e) });
    }
  }

  async function compute(q: Extract<Request, { t: 'compute' }>) {
    latestSeq = q.seq;
    const exp = slots.exp, prev = slots.prev;
    if (!exp || exp.id !== q.expId || (prev ? prev.id : null) !== q.prevId) return;   // holat o'zgargan — eskirgan so'rov
    const rows = exp.rows;
    const unknown = classify(rows, rulesMap(q.rules));
    const dups = findDuplicates(rows);
    const newCount = Math.max(0, Math.min(q.newCount, rows.length));
    const preview = unknown.length ? null : svodView(svod(rows, newCount));
    const catNames: string[] = [], catPos = new Map<string, number>(), rowCat = new Int32Array(rows.length);
    rows.forEach((r, i) => {
      if (!r.cat) { rowCat[i] = -1; return; }
      let k = catPos.get(r.cat);
      if (k === undefined) { k = catNames.length; catPos.set(r.cat, k); catNames.push(r.cat); }
      rowCat[i] = k;
    });
    const willBuild = !exp.table.problems.length && !unknown.length && !dups.length && q.confirmed;
    const analysis: Analysis = {
      seq: q.seq, unknown, kinds: new Set(rows.map(r => norm(r.tasnif))).size, preview, catNames, rowCat,
      dups: { count: dups.length, list: dups.slice(0, 12).map(d => ({ id: d.again.id, task: d.again.task, firstR: d.first.r, againR: d.again.r })) },
      cmp: prev ? cmpView(prev.rows, rows) : null, willBuild,
    };
    post({ t: 'analysis', seq: q.seq, analysis }, [rowCat.buffer]);
    if (!willBuild) return;

    // Toifalar shu paytdagi holicha muzlatiladi: keyingi so'rov qatorlarni qayta tasniflasa ham bu yig'ish buzilmaydi
    const model = { rows: rows.map(r => ({ ...r })), newCount, date: q.date, printer: exp.table.printer };
    await tick();
    if (q.seq !== latestSeq) return;
    try {
      const b = await build(model);
      await tick();
      if (q.seq !== latestSeq) return;
      const v = await verify(b.bytes, model);
      if (q.seq !== latestSeq) return;
      const buf = b.bytes.byteOffset === 0 && b.bytes.byteLength === b.bytes.buffer.byteLength ? b.bytes.buffer as ArrayBuffer : b.bytes.slice().buffer;
      post({ t: 'built', seq: q.seq, result: { bytes: buf, filename: b.filename, labels: b.labels, svod: svodView(b.svod), verify: v } }, [buf]);
    } catch (e) {
      if (q.seq !== latestSeq) return;
      post({ t: 'buildError', seq: q.seq, error: toErrInfo(e) });
    }
  }

  return {
    handle(q: Request): Promise<void> | void {
      switch (q.t) {
        case 'load': return load(q.which, q.id, q.name, q.bytes);
        case 'clear': latestLoad[q.which] = q.id; slots[q.which] = null; return;
        case 'dedupe': {
          const exp = slots.exp;
          if (!exp || exp.id !== q.id) return;
          exp.rows = dedupe(exp.rows);
          post({ t: 'deduped', id: q.id, info: expInfo(exp.name, exp.table, exp.rows) });
          return;
        }
        case 'compute': return compute(q);
      }
    },
  };
}

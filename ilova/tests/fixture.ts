/* Testlar uchun sun'iy portal fayllari (haqiqiy shaxsiy ma'lumot yo'q). */
import JSZip from 'jszip';
import { BASE_RULES, HEADERS, colName } from '../src/engine/core';

export type Val = string | number | null;
const NS = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/* Uslublar: s=0 oddiy, s=1 — pastki chegarasiz (jadval oxiri belgisi), s=2 — qizil shrift */
const STYLES = `<?xml version="1.0" encoding="UTF-8"?><styleSheet xmlns="${NS}">` +
  '<fonts count="2"><font><sz val="11"/></font><font><color rgb="FFFF0000"/></font></fonts>' +
  '<borders count="2"><border><left/><right/><top/><bottom/></border><border><left style="thin"/><right style="thin"/><top style="thin"/><bottom/></border></borders>' +
  '<cellXfs count="3"><xf fontId="0" borderId="0"/><xf fontId="0" borderId="1"/><xf fontId="1" borderId="0"/></cellXfs></styleSheet>';

export interface FixtureOpts {
  inline?: boolean;                 // inlineStr o'rniga shared strings
  sheetName?: string;
  tableEndAt?: number[];            // shu indeksdagi qatorlar A katagi s=1
  redAt?: number[];                 // shu indeksdagi qatorlar N katagi s=2
  headerRow?: number;
  svodDate?: string;                // Лист2 varag'iga «dd.mm.yyyyй» yorlig'i
  links?: Record<number, string>;   // qator indeksi -> A katak havolasi
}

export async function portalFile(rows: Val[][], o: FixtureOpts = {}): Promise<Uint8Array> {
  const zip = new JSZip();
  const sst: string[] = [], sstIdx = new Map<string, number>();
  const sid = (t: string) => { let i = sstIdx.get(t); if (i === undefined) { i = sst.length; sstIdx.set(t, i); sst.push(t); } return i; };
  const cell = (c: number, r: number, v: Val, s = 0) => {
    const ref = colName(c + 1) + r, st = s ? ` s="${s}"` : '';
    if (v == null) return s ? `<c r="${ref}"${st}/>` : '';
    if (typeof v === 'number') return `<c r="${ref}"${st}><v>${v}</v></c>`;
    return o.inline ? `<c r="${ref}"${st} t="inlineStr"><is><t xml:space="preserve">${esc(v)}</t></is></c>` : `<c r="${ref}"${st} t="s"><v>${sid(v)}</v></c>`;
  };
  const hr = o.headerRow ?? 2, first = hr + 2;
  const xml = [`<row r="${hr}">${HEADERS.map((h, c) => cell(c, hr, h)).join('')}</row>`];
  rows.forEach((vals, i) => {
    const r = first + i;
    xml.push(`<row r="${r}">${vals.map((v, c) => cell(c, r, v, c === 0 && o.tableEndAt?.includes(i) ? 1 : c === 13 && o.redAt?.includes(i) ? 2 : 0)).join('')}</row>`);
  });
  const sheets: Array<[string, string]> = [[o.sheetName ?? 'жараён', 'sheet1.xml']];
  if (o.svodDate) sheets.push(['Лист2', 'sheet2.xml']);
  const linkEntries = Object.entries(o.links ?? {});
  const hl = linkEntries.length ? `<hyperlinks>${linkEntries.map(([i], k) => `<hyperlink ref="A${first + Number(i)}" r:id="rId${k + 1}"/>`).join('')}</hyperlinks>` : '';
  zip.file('[Content_Types].xml', '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/></Types>');
  zip.file('_rels/.rels', `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${REL}/officeDocument" Target="xl/workbook.xml"/></Relationships>`);
  zip.file('xl/workbook.xml', `<workbook xmlns="${NS}" xmlns:r="${REL}"><sheets>${sheets.map(([n], k) => `<sheet name="${esc(n)}" sheetId="${k + 1}" r:id="rId${k + 1}"/>`).join('')}</sheets></workbook>`);
  zip.file('xl/_rels/workbook.xml.rels', `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
    sheets.map(([, f], k) => `<Relationship Id="rId${k + 1}" Type="${REL}/worksheet" Target="worksheets/${f}"/>`).join('') +
    `<Relationship Id="rId8" Type="${REL}/sharedStrings" Target="sharedStrings.xml"/><Relationship Id="rId9" Type="${REL}/styles" Target="styles.xml"/></Relationships>`);
  zip.file('xl/worksheets/sheet1.xml', `<worksheet xmlns="${NS}" xmlns:r="${REL}"><sheetData>${xml.join('')}</sheetData>${hl}</worksheet>`);
  if (linkEntries.length) zip.file('xl/worksheets/_rels/sheet1.xml.rels', `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
    linkEntries.map(([, url], k) => `<Relationship Id="rId${k + 1}" Type="${REL}/hyperlink" Target="${esc(url)}" TargetMode="External"/>`).join('') + '</Relationships>');
  if (o.svodDate) zip.file('xl/worksheets/sheet2.xml', `<worksheet xmlns="${NS}"><sheetData><row r="2"><c r="D2" t="inlineStr"><is><t>${o.svodDate}</t></is></c></row></sheetData></worksheet>`);
  zip.file('xl/sharedStrings.xml', `<sst xmlns="${NS}" count="${sst.length}" uniqueCount="${sst.length}">${sst.map(t => `<si><t xml:space="preserve">${esc(t)}</t></si>`).join('')}</sst>`);
  zip.file('xl/styles.xml', STYLES);
  return zip.generateAsync({ type: 'uint8array' });
}

/** Excel sana raqami: 2026-10-01 00:00 = 46296 */
export const day = (iso: string, hh = 9, mm = 0) => Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10), hh, mm) / 86400000 + 25569;

/** n ta qator: asosiy ro'yxat + oxirida nNew ta yangi kelgan (sana tartibi qayta boshlanadi) */
export function portalRows(n: number, nNew: number, orgCount = 6): Val[][] {
  const main = n - nNew, out: Val[][] = [];
  for (let i = 0; i < n; i++) {
    const isNew = i >= main, k = isNew ? i - main : i;
    const org = 'Ташкилот ' + ((i % orgCount) + 1);
    out.push([`REQ-${100000 + i}`, String(1 + (i % 3)), 'Фамилия' + (i % 97), 'Исм' + (i % 31), 'Андижон вилояти', 'Туман ' + (i % 7),
      BASE_RULES[i % BASE_RULES.length][0], null, org, org, org, day('2026-10-20', 0), day('2026-09-01') + k * 0.001, day('2026-10-02') + (i % 50) * 0.01]);
  }
  return out;
}

/* Tez, DOM'siz XML o'qigich (Web Worker ichida ham ishlaydi — u yerda DOMParser yo'q).
   Ikki qatlam:
     sax()   — oqimli: har bir teg uchun chaqiriladi, daraxt qurmaydi (katta varaqlar uchun);
     parse() — kichik fayllar uchun yengil daraxt (workbook, rels, styles).
   xlsx ichidagi XML uchun yetarli: nom fazolari, entity, CDATA, izoh, <?...?>. DOCTYPE rad etiladi
   (xlsx'da bo'lmaydi; entity-bomba xavfini ham yopadi). */

export class XmlError extends Error {
  override name = 'XmlError';
}

export type Attrs = Record<string, string>;

export interface SaxHandler {
  open(local: string, attrs: Attrs, ns: NsScope): void;
  close(local: string): void;
  text(text: string): void;
}

/** Prefiks -> nom fazosi (ichma-ich e'lonlar hisobga olinadi). */
export interface NsScope {
  uri(prefix: string): string | undefined;
}

const ENTITY: Record<string, string> = { lt: '<', gt: '>', amp: '&', quot: '"', apos: "'" };
const ENTITY_RE = /&(#x[0-9a-fA-F]+|#[0-9]+|[A-Za-z]+);/g;

function decode(s: string, attr: boolean): string {
  if (s.indexOf('\r') >= 0) s = s.replace(/\r\n?/g, '\n');               // XML qator oxiri normallashuvi
  if (attr && /[\t\n]/.test(s)) s = s.replace(/[\t\n]/g, ' ');            // atribut qiymati normallashuvi
  if (s.indexOf('&') < 0) return s;
  return s.replace(ENTITY_RE, (_m, e: string) => {
    if (e.charCodeAt(0) === 35) {
      const code = e.charCodeAt(1) === 120 ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      if (!(code >= 0 && code <= 0x10ffff)) throw new XmlError(`noto'g'ri belgi kodi &${e};`);
      return String.fromCodePoint(code);
    }
    const v = ENTITY[e];
    if (v === undefined) throw new XmlError(`noma'lum entity &${e};`);
    return v;
  });
}

const localOf = (q: string) => { const k = q.indexOf(':'); return k < 0 ? q : q.slice(k + 1); };
const isSpace = (c: number) => c === 32 || c === 9 || c === 10 || c === 13;

class Scope implements NsScope {
  private frames: Array<Record<string, string> | null> = [];
  push(attrs: Attrs, hasNs: boolean) {
    if (!hasNs) { this.frames.push(null); return; }
    const f: Record<string, string> = {};
    for (const k in attrs) {
      if (k === 'xmlns') f[''] = attrs[k];
      else if (k.startsWith('xmlns:')) f[k.slice(6)] = attrs[k];
    }
    this.frames.push(f);
  }
  pop() { this.frames.pop(); }
  uri(prefix: string) {
    if (prefix === 'xml') return 'http://www.w3.org/XML/1998/namespace';
    for (let i = this.frames.length - 1; i >= 0; i--) { const f = this.frames[i]; if (f && prefix in f) return f[prefix]; }
    return undefined;
  }
}

/** Oqimli o'qish. Teglar to'g'ri yopilmagan bo'lsa XmlError. */
export function sax(src: string, h: SaxHandler): void {
  const n = src.length, stack: string[] = [], scope = new Scope();
  let i = 0, seenRoot = false;
  if (src.charCodeAt(0) === 0xfeff) i = 1;                                  // BOM
  while (i < n) {
    const lt = src.indexOf('<', i);
    const end = lt < 0 ? n : lt;
    if (end > i) {
      const raw = src.slice(i, end);
      if (stack.length) h.text(decode(raw, false));
      else if (raw.trim()) throw new XmlError('ildiz tegidan tashqarida matn bor');
    }
    if (lt < 0) break;
    const c1 = src.charCodeAt(lt + 1);
    if (c1 === 47) {                                                        // </yopuvchi>
      const gt = src.indexOf('>', lt);
      if (gt < 0) throw new XmlError('yopuvchi teg tugamagan');
      const q = src.slice(lt + 2, gt).trim(), top = stack.pop();
      if (top !== q) throw new XmlError(`«${q}» yopildi, lekin «${top ?? 'hech narsa'}» ochiq edi`);
      scope.pop();
      h.close(localOf(q));
      i = gt + 1;
    } else if (c1 === 33) {                                                 // <!-- --> / <![CDATA[ ]]> / <!DOCTYPE>
      if (src.startsWith('<!--', lt)) {
        const e = src.indexOf('-->', lt + 4);
        if (e < 0) throw new XmlError('izoh tugamagan');
        i = e + 3;
      } else if (src.startsWith('<![CDATA[', lt)) {
        const e = src.indexOf(']]>', lt + 9);
        if (e < 0 || !stack.length) throw new XmlError('CDATA noto\'g\'ri');
        h.text(src.slice(lt + 9, e).replace(/\r\n?/g, '\n'));
        i = e + 3;
      } else throw new XmlError('DOCTYPE qo\'llanmaydi');
    } else if (c1 === 63) {                                                 // <?xml ...?>
      const e = src.indexOf('?>', lt + 2);
      if (e < 0) throw new XmlError('<? tugamagan');
      i = e + 2;
    } else {                                                                // <ochuvchi atr="...">
      let p = lt + 1;
      while (p < n) { const c = src.charCodeAt(p); if (isSpace(c) || c === 47 || c === 62) break; p++; }
      const q = src.slice(lt + 1, p);
      if (!q) throw new XmlError('teg nomi yo\'q');
      if (!stack.length && seenRoot) throw new XmlError('ikkinchi ildiz teg');
      const attrs: Attrs = {};
      let hasNs = false, self = false;
      for (;;) {
        while (p < n && isSpace(src.charCodeAt(p))) p++;
        if (p >= n) throw new XmlError(`«${q}» tegi tugamagan`);
        const c = src.charCodeAt(p);
        if (c === 62) { p++; break; }
        if (c === 47) {
          if (src.charCodeAt(p + 1) !== 62) throw new XmlError(`«${q}» tegi buzilgan`);
          self = true; p += 2; break;
        }
        const a0 = p;
        while (p < n) { const d = src.charCodeAt(p); if (d === 61 || isSpace(d) || d === 62 || d === 47) break; p++; }
        const an = src.slice(a0, p);
        while (p < n && isSpace(src.charCodeAt(p))) p++;
        if (src.charCodeAt(p) !== 61 || !an) throw new XmlError(`«${q}» tegida atribut buzilgan`);
        p++;
        while (p < n && isSpace(src.charCodeAt(p))) p++;
        const quote = src.charCodeAt(p);
        if (quote !== 34 && quote !== 39) throw new XmlError(`«${an}» atributi qo'shtirnoqsiz`);
        const e = src.indexOf(quote === 34 ? '"' : "'", p + 1);
        if (e < 0) throw new XmlError(`«${an}» atributi tugamagan`);
        const val = src.slice(p + 1, e);
        if (val.indexOf('<') >= 0) throw new XmlError(`«${an}» atributida «<» bor`);
        attrs[an] = decode(val, true);
        if (an.charCodeAt(0) === 120 && (an === 'xmlns' || an.startsWith('xmlns:'))) hasNs = true;
        p = e + 1;
      }
      seenRoot = true;
      stack.push(q);
      scope.push(attrs, hasNs);
      h.open(localOf(q), attrs, scope);
      if (self) { stack.pop(); scope.pop(); h.close(localOf(q)); }
      i = p;
    }
  }
  if (stack.length) throw new XmlError(`«${stack[stack.length - 1]}» tegi yopilmagan`);
  if (!seenRoot) throw new XmlError('bo\'sh hujjat');
}

/* ---------------------------------------------------------------- yengil daraxt */
export interface XEl {
  local: string;
  attrs: Attrs;
  kids: XEl[];
  text: string;          // shu tegning o'zidagi matn (bolalarnikisiz)
  /** atributlardagi prefiks -> nom fazosi (masalan r:id uchun) */
  ns: NsScope;
}

export function parse(src: string): XEl {
  const top: XEl = { local: '#doc', attrs: {}, kids: [], text: '', ns: { uri: () => undefined } };
  const stack: XEl[] = [top];
  sax(src, {
    open(local, attrs, ns) {
      // Atribut prefikslarining nom fazosi shu paytda (ochilish vaqtida) yozib olinadi
      const snap: Record<string, string | undefined> = {};
      for (const k in attrs) { const c = k.indexOf(':'); if (c > 0 && k.slice(0, c) !== 'xmlns') snap[k.slice(0, c)] = ns.uri(k.slice(0, c)); }
      const el: XEl = { local, attrs, kids: [], text: '', ns: { uri: p => snap[p] } };
      stack[stack.length - 1].kids.push(el);
      stack.push(el);
    },
    close() { stack.pop(); },
    text(t) { stack[stack.length - 1].text += t; },
  });
  return top.kids[0];
}

/** Barcha avlodlar (o'zi ham) — getElementsByTagNameNS('*', local) kabi, hujjat tartibida. */
export function findAll(el: XEl, local: string, out: XEl[] = []): XEl[] {
  if (el.local === local) out.push(el);
  for (const k of el.kids) findAll(k, local, out);
  return out;
}
export const findFirst = (el: XEl, local: string): XEl | undefined => findAll(el, local)[0];
export function textOf(el: XEl): string {
  if (!el.kids.length) return el.text;
  let s = el.text;
  for (const k of el.kids) s += textOf(k);
  return s;
}

/** Prefiksli atribut: masalan r:id — prefiks qaysi bo'lishidan qat'i nazar nom fazosi bo'yicha. */
export function nsAttr(attrs: Attrs, ns: NsScope, local: string, uriTest: RegExp): string | null {
  for (const k in attrs) {
    const c = k.indexOf(':');
    if (c <= 0 || k.slice(c + 1) !== local) continue;
    const uri = ns.uri(k.slice(0, c));
    if (uri && uriTest.test(uri)) return attrs[k];
  }
  return null;
}

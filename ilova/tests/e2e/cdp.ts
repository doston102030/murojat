/* Headless Chrome/Edge'ni DevTools protokoli orqali boshqarish (qo'shimcha npm paketlarsiz). */
import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { once } from 'node:events';
import { join } from 'node:path';

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

export interface Page {
  send<T = Record<string, unknown>>(method: string, params?: Record<string, unknown>): Promise<T>;
  /** Sahifada funksiyani bajaradi (argumentlar JSON orqali). */
  run<T>(fn: (...args: never[]) => T | Promise<T>, ...args: unknown[]): Promise<T>;
  errors: string[];
  close(): Promise<void>;
}

export async function launch(dir: string): Promise<Page> {
  const exe = [process.env.BROWSER, 'C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    '/usr/bin/google-chrome', '/usr/bin/chromium', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'].find(p => p && existsSync(p));
  if (!exe) throw new Error('Chrome yoki Edge topilmadi; BROWSER o\'zgaruvchisida yo\'lini bering');
  const profile = join(dir, 'profile');
  mkdirSync(profile, { recursive: true });
  const proc: ChildProcess = spawn(exe, ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--disable-background-networking',
    '--remote-debugging-address=127.0.0.1', '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank'], { stdio: 'ignore', windowsHide: true });
  const portFile = join(profile, 'DevToolsActivePort');
  // Windows'da Chrome faylni yozib turgan paytda o'qish EBUSY beradi — to'liq yozilguncha qayta urinamiz
  let port = '';
  for (let i = 0; i < 300 && !/^\d+$/.test(port); i++) {
    try { if (existsSync(portFile)) port = readFileSync(portFile, 'utf8').split(/\r?\n/)[0]; } catch { /* hali band */ }
    if (!/^\d+$/.test(port)) await sleep(50);
  }
  if (!/^\d+$/.test(port)) throw new Error('Brauzer ishga tushmadi (DevToolsActivePort yo\'q)');
  const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json() as Array<{ type: string; webSocketDebuggerUrl: string }>;
  const ws = new WebSocket(targets.find(t => t.type === 'page')!.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.addEventListener('open', res, { once: true }); ws.addEventListener('error', rej, { once: true }); });

  let next = 0;
  const pending = new Map<number, { res(v: unknown): void; rej(e: Error): void }>();
  const errors: string[] = [];
  ws.addEventListener('message', ev => {
    const m = JSON.parse(String(ev.data));
    if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails?.exception?.description || m.params.exceptionDetails?.text);
    if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') errors.push(m.params.args.map((a: { value?: unknown; description?: string }) => a.value ?? a.description).join(' '));
    if (!m.id || !pending.has(m.id)) return;
    const p = pending.get(m.id)!; pending.delete(m.id);
    if (m.error) p.rej(new Error(JSON.stringify(m.error))); else p.res(m.result);
  });
  const send = <T,>(method: string, params: Record<string, unknown> = {}) => new Promise<T>((res, rej) => {
    const id = ++next; pending.set(id, { res: res as (v: unknown) => void, rej });
    ws.send(JSON.stringify({ id, method, params }));
  });
  await send('Runtime.enable'); await send('Page.enable');
  return {
    send, errors,
    async run<T>(fn: (...args: never[]) => T | Promise<T>, ...args: unknown[]) {
      const r = await send<{ result: { value: T }; exceptionDetails?: { exception?: { description?: string }; text?: string } }>('Runtime.evaluate', {
        expression: `(${fn.toString()})(...${JSON.stringify(args)})`, awaitPromise: true, returnByValue: true,
      });
      if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
      return r.result.value;
    },
    async close() {
      try { await send('Browser.close'); } catch { /* yopilib bo'lgan */ }
      ws.close();
      if (proc.exitCode === null) { await Promise.race([once(proc, 'exit'), sleep(2000)]); if (proc.exitCode === null) proc.kill(); }
      try { rmSync(profile, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 }); } catch { /* qulflangan kesh keyin o'chadi */ }
    },
  };
}

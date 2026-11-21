// Headless-Chrome check of the page in plugin mode: serves dist/, fakes the
// JUCE bridge (window.__JUCE__.backend) that the plugin's WebView injects,
// and plays the C++ side: sends the session state, host automation, host
// notes and meters, and checks what the page sends back. Screenshots to
// out/screenshot-plugin*.png. Needs `npm run build` first.
//
//   node scripts/check-plugin-ui.ts

import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, extname } from 'node:path';

const CHROME = process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = 4176, DEBUG = 9336;
const UI_W = 1360, UI_H = 850;   // src/plugin.ts
const MIME: Record<string, string> = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml' };

const server = createServer((req, res) => {
  let p = join('dist', decodeURIComponent((req.url ?? '/').split('?')[0]));
  if (!existsSync(p) || p.endsWith('/')) p = 'dist/index.html';
  res.setHeader('content-type', MIME[extname(p)] ?? 'application/octet-stream');
  res.end(readFileSync(p));
}).listen(PORT);

const chrome = spawn(CHROME, [
  '--headless=new', `--remote-debugging-port=${DEBUG}`, `--window-size=${UI_W},${UI_H}`, '--hide-scrollbars',
  '--no-first-run', '--no-default-browser-check', '--user-data-dir=/tmp/ft-siege-chrome-plugin', 'about:blank',
], { stdio: 'ignore' });

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// What JUCE injects, reduced to the two calls the page uses. Everything the
// page emits is recorded in window.__sent; window.__toPage(msg) is the C++ side.
const FAKE_JUCE = `
  window.__sent = [];
  const listeners = new Map();
  window.__JUCE__ = { backend: {
    emitEvent: (id, payload) => window.__sent.push({ id, payload: JSON.parse(JSON.stringify(payload)) }),
    addEventListener: (id, fn) => { (listeners.get(id) ?? listeners.set(id, []).get(id)).push(fn); },
  } };
  window.__toPage = (msg) => (listeners.get('siege') ?? []).forEach((fn) => fn(msg));
`;

let failures = 0;
const check = (ok: boolean, what: string) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`); if (!ok) failures++; };

async function main(): Promise<void> {
  let targets: { webSocketDebuggerUrl: string; type: string }[] = [];
  for (let i = 0; i < 50 && targets.length === 0; i++) {
    await sleep(200);
    try { targets = (await (await fetch(`http://127.0.0.1:${DEBUG}/json`)).json()).filter((t: { type: string }) => t.type === 'page'); } catch { /* not up yet */ }
  }
  if (targets.length === 0) throw new Error('chrome did not start');
  const ws = new WebSocket(targets[0].webSocketDebuggerUrl);
  await new Promise((r) => (ws.onopen = r));
  let id = 0;
  const pending = new Map<number, (v: unknown) => void>();
  const logs: string[] = [];
  ws.onmessage = (e) => {
    const m = JSON.parse(String(e.data));
    if (m.id && pending.has(m.id)) { pending.get(m.id)!(m.result ?? m.error); pending.delete(m.id); }
    else if (m.method === 'Runtime.consoleAPICalled') logs.push(`[${m.params.type}] ${m.params.args.map((a: { value?: unknown; description?: string }) => a.value ?? a.description).join(' ')}`);
    else if (m.method === 'Runtime.exceptionThrown') logs.push(`[exception] ${m.params.exceptionDetails.text} ${m.params.exceptionDetails.exception?.description ?? ''}`);
  };
  const send = (method: string, params: Record<string, unknown> = {}) => new Promise<unknown>((r) => { pending.set(++id, r); ws.send(JSON.stringify({ id, method, params })); });
  const evaluate = async (expression: string) => {
    const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }) as { result?: { value?: unknown }; exceptionDetails?: { text: string } };
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.text);
    return r.result?.value;
  };
  type Sent = { id: string; payload: { type: string; [k: string]: unknown } };
  const takeSent = async () => (await evaluate('window.__sent.splice(0)')) as Sent[];

  await send('Runtime.enable');
  await send('Page.enable');
  await send('Page.addScriptToEvaluateOnNewDocument', { source: FAKE_JUCE });
  await send('Emulation.setDeviceMetricsOverride', { width: UI_W, height: UI_H, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: `http://127.0.0.1:${PORT}/` });
  await sleep(2000);

  // 1. the page asks for the state and loads nothing by itself
  let sent = await takeSent();
  check(sent.length === 1 && sent[0].payload.type === 'ready', `on open the page only asks for the state (sent: ${sent.map((s) => s.payload.type).join(', ')})`);
  check(await evaluate("document.documentElement.classList.contains('in-plugin')") === true, 'plugin mode is on');
  check(await evaluate("getComputedStyle(document.querySelector('.power-wrap')).display") === 'none', 'the power switch is hidden');

  // 2. the session state arrives: the sound, the preset name, your presets
  await evaluate(`window.__toPage({ type: 'state', values: { u1Level: 0.8, u1Dist: 55, tailMix: 0.6, early: 0.7 }, preset: 'Taiko Line', last: 'Taiko Line',
    user: [{ name: 'Mine', values: { u1Size: 2 } }, { bogus: true }] })`);
  await sleep(200);
  sent = await takeSent();
  check(sent.every((s) => s.payload.type === 'current'), `the state is not echoed back as parameters (sent: ${sent.map((s) => s.payload.type).join(', ') || 'nothing'})`);
  check(await evaluate('window.__siege.values.u1Dist') === 55, 'the state sets the values');
  check(await evaluate("document.querySelector('#preset-name').textContent") === 'Taiko Line', 'the header shows the session preset');
  check(await evaluate("document.querySelectorAll('#browser-list .card[data-tag=user]').length") === 1, 'your presets from the file are in the browser (the malformed one is dropped)');

  // 3. host automation moves knobs and opens a unit without being sent back
  await evaluate("window.__toPage({ type: 'params', values: { u1Dist: 120, volume: 0.5, u2Level: 0.6 } })");
  await sleep(100);
  sent = await takeSent();
  check(sent.length === 0, 'automation is not echoed back');
  check(await evaluate('window.__siege.values.u1Dist') === 120, 'automation updates the values');
  check(await evaluate("document.querySelector('#master').value") === '0.5', 'automation of the volume moves the master slider');

  // 4. loading a preset on the page sends the whole sound, then its name
  await evaluate("window.__siege.loadPreset('War Drum Solo')");
  sent = await takeSent();
  const preset = sent.find((s) => s.payload.type === 'preset');
  const current = sent.filter((s) => s.payload.type === 'current').pop();
  check(!!preset && (preset.payload.values as Record<string, number>).u1Size === 1.6, 'loading a preset sends its values');
  check(current?.payload.name === 'War Drum Solo', 'and its name, to keep with the session');

  // 5. a knob moved on the page becomes a parameter change and marks the sound edited
  await evaluate("document.querySelector('.knob').dispatchEvent(new WheelEvent('wheel', { deltaY: -100, bubbles: true, cancelable: true }))");
  sent = await takeSent();
  check(sent.some((s) => s.payload.type === 'param'), `turning a knob sends a parameter (sent: ${sent.map((s) => s.payload.type).join(', ') || 'nothing'})`);
  check(sent.some((s) => s.payload.type === 'current' && s.payload.name === ''), 'and marks the sound edited');

  // 6. the on-screen keyboard plays through the plugin
  await evaluate("window.__siege.synth.noteOn(60, 100); window.__siege.synth.noteOff(60)");
  sent = await takeSent();
  check(sent.map((s) => s.payload.type).join(',') === 'noteOn,noteOff', 'notes from the page go to the plugin');

  // 7. host notes light the keys; meters, the seismograph, the field display and the host tempo show up
  await evaluate(`window.__toPage({ type: 'notes', list: [[64, 100, 0]] });
    window.__toPage({ type: 'stats', voices: 3, load: 0.042, peakL: 0.5, peakR: 0.4, tempo: 122,
      scope: Array.from({ length: 1024 }, (_, i) => Math.sin(i / 20) * 0.5),
      display: [200, 3, 10, 120, 1, 20, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 255, 128, 64, 255, 2, 0, 0, 0] })`);
  await sleep(100);
  check(String(await evaluate("document.querySelector('#tempo')?.textContent")).includes('122 bpm'), 'the host tempo shows in the status line, beside the stop button');
  check(String(await evaluate("[...document.querySelectorAll('.readline')].map((e) => e.textContent).join(' | ')")).includes('wind +1.00'), 'the field line shows the wind from the display bytes');

  // 8. the keyboard hits the same key at the same place when the page is scaled
  const playAt = async () => {
    await takeSent();
    await evaluate(`(() => {
      const c = document.querySelector('#keyboard'); const r = c.getBoundingClientRect();
      const x = r.left + r.width * 0.437, y = r.top + r.height * 0.8;
      for (const t of ['pointerdown', 'pointerup']) c.dispatchEvent(new PointerEvent(t, { clientX: x, clientY: y, buttons: 1, bubbles: true, pointerId: 1 }));
    })()`);
    return ((await takeSent()).find((s) => s.payload.type === 'noteOn')?.payload.note) as number | undefined;
  };
  const full = await playAt();
  await send('Emulation.setDeviceMetricsOverride', { width: UI_W / 2, height: UI_H / 2, deviceScaleFactor: 1, mobile: false });
  await sleep(300);
  const half = await playAt();
  check(full !== undefined && full === half, `a key played on a half-size page is the same key (${full} at full size, ${half} at half)`);
  await send('Emulation.setDeviceMetricsOverride', { width: UI_W, height: UI_H, deviceScaleFactor: 1, mobile: false });
  await sleep(300);

  // 9. saving a sound goes to the plugin's file
  await evaluate('document.querySelector("#save").click()');
  await sleep(200);
  await evaluate('const n = document.querySelector("#save-name"); n.value = "Check Sound"; n.dispatchEvent(new Event("input")); document.querySelector("#savebar").requestSubmit()');
  sent = await takeSent();
  const save = sent.find((s) => s.payload.type === 'saveUser');
  const saved = (save?.payload.presets ?? []) as { name: string }[];
  check(saved.map((p) => p.name).join(',') === 'Check Sound,Mine', `saving writes your presets through the plugin (${saved.map((p) => p.name).join(', ')})`);

  // 10. the host swaps the whole state (its preset menu, a session load)
  await evaluate("window.__toPage({ type: 'state', values: { u1Level: 0.8, u1Dist: 30 }, preset: '', last: 'War Drum Solo', user: [] })");
  await sleep(100);
  check(await evaluate("document.querySelector('#preset-tag').textContent") === 'edited', 'an edited session shows as edited');
  check(await evaluate("document.querySelector('#preset-name').textContent") === 'War Drum Solo', 'under the name it came from');
  await evaluate("document.querySelector('#browser-close')?.click()");
  await sleep(300);

  // 11. every page fits the design size; the army with every unit on scrolls
  await evaluate("window.__siege.loadPreset('Battlefield Kit')");
  await sleep(300);
  mkdirSync('out', { recursive: true });
  const heights: string[] = [];
  let tallest = 0;
  for (let t = 0; t < 3; t++) {
    await evaluate(`document.querySelectorAll('#tabs .tab')[${t}].click()`);
    await sleep(700);
    const h = await evaluate("document.querySelector('#app').offsetHeight") as number;
    heights.push(`${['army', 'field', 'drill'][t]} ${h}`);
    tallest = Math.max(tallest, h);
    const shot = await send('Page.captureScreenshot', { format: 'png' }) as { data: string };
    writeFileSync(`out/screenshot-plugin-${t + 1}.png`, Buffer.from(shot.data, 'base64'));
  }
  check(tallest <= UI_H, `every page fits ${UI_W}x${UI_H} at full size (${heights.join(', ')})`);
  console.log('wrote out/screenshot-plugin-{1..3}.png');

  // 12. a window smaller than the design shows the whole page, scaled
  await send('Emulation.setDeviceMetricsOverride', { width: 1050, height: Math.round(1050 * UI_H / UI_W), deviceScaleFactor: 1, mobile: false });
  await evaluate("document.querySelectorAll('#tabs .tab')[1].click()");   // field
  await sleep(500);
  const box = await evaluate("(() => { const r = document.querySelector('#app').getBoundingClientRect(); return [r.right, r.bottom, innerWidth, innerHeight]; })()") as number[];
  check(box[0] <= box[2] + 0.5 && box[1] <= box[3] + 0.5, `at 1050 wide the field view fits (${Math.round(box[0])}x${Math.round(box[1])} in ${box[2]}x${box[3]})`);
  const small = await send('Page.captureScreenshot', { format: 'png' }) as { data: string };
  writeFileSync('out/screenshot-plugin-small.png', Buffer.from(small.data, 'base64'));
  console.log('wrote out/screenshot-plugin-small.png');

  const errors = logs.filter((l) => l.startsWith('[error]') || l.startsWith('[exception]'));
  for (const l of errors) console.log('  console', l);
  check(errors.length === 0, 'no console errors');
  if (failures) process.exitCode = 1;
  ws.close();
}

main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => { chrome.kill(); server.close(); });

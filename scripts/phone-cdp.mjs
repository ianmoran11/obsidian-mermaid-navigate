// Development only. Connects to the USB-forwarded Obsidian WebView, never bundled.
import fs from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
export async function connect() {
  const pages = await (await fetch('http://127.0.0.1:9223/json/list')).json();
  const page = pages.find(page => page.title.includes('Obsidian'));
  if (!page) throw new Error('No Obsidian WebView on forwarded port 9223');
  const socket = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
  let id = 0;
  const pending = new Map();
  socket.onmessage = event => {
    const message = JSON.parse(event.data);
    const handler = pending.get(message.id);
    if (handler) { pending.delete(message.id); message.error ? handler.reject(message.error) : handler.resolve(message.result); }
  };
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const requestId = ++id;
    const timer = setTimeout(() => { pending.delete(requestId); reject(new Error(`CDP timeout: ${method}`)); }, 15000);
    pending.set(requestId, {
      resolve: value => { clearTimeout(timer); resolve(value); },
      reject: error => { clearTimeout(timer); reject(error); },
    });
    socket.send(JSON.stringify({ id: requestId, method, params }));
  });
  const evaluate = async expression => {
    const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
    return result.result.value;
  };
  return { send, evaluate, close: () => socket.close() };
}
if (process.argv[1]?.endsWith('phone-cdp.mjs')) {
  const client = await connect();
  try {
    if (process.argv[2] === '--screenshot') {
      const display = process.env.ANDROID_DISPLAY_ID;
      const data = execFileSync('adb', ['exec-out', 'screencap', '-p', ...(display ? ['-d', display] : [])], { timeout: 10000 });
      const start = data.indexOf(Buffer.from([137,80,78,71,13,10,26,10]));
      if (start < 0) throw new Error('No PNG returned by Android');
      await fs.writeFile(process.argv[3], data.subarray(start));
      console.log(`Saved ${process.argv[3]}`);
    } else {
      console.log(JSON.stringify(await client.evaluate(process.argv[2]), null, 2));
    }
  } finally { client.close(); }
}

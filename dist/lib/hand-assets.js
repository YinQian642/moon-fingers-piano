const CACHE = 'moonlight-hand-assets-v1';
const MODEL = ['hand_landmarker.task', 7819105, 'fbc2a30080c3c557093b5ddfc334698132eb341044ccee322ccf8bcf3607cde1'];
const SIMD = ['wasm/vision_wasm_internal.wasm', 9574032, 'f00ec4731faa23b3e714d00e88d4d10e2df5c0a427d3a2b4ae6e3526fdd14ef7'];
const SCALAR = ['wasm/vision_wasm_nosimd_internal.wasm', 9448638, '3821ea9b1f7fb8c549ef2a064ef5c85750bf375c545a49fd6eea0df44a95f1f4'];
const simdProbe = new Uint8Array([0,97,115,109,1,0,0,0,1,5,1,96,0,1,123,3,2,1,0,10,10,1,8,0,65,0,253,15,253,98,11]);

function check(signal) {
  if (signal?.aborted) throw new DOMException('识别已取消', 'AbortError');
}

export async function downloadBytes(url, {
  signal, onProgress = () => {}, idleMs = 30000, retries = 2, fetcher = fetch,
  expectedLength, verify, recover, label = '识别资源'
} = {}) {
  let chunks = [], received = 0;
  function reset() { chunks = []; received = 0; }
  for (let attempt = 0; attempt <= retries; attempt++) {
    check(signal);
    const controller = new AbortController();
    let timer, stalled = false;
    const abort = () => controller.abort();
    signal?.addEventListener('abort', abort, {once: true});
    function touch(timeout = idleMs) {
      clearTimeout(timer);
      timer = setTimeout(() => { stalled = true; abort(); }, timeout);
    }
    function append(bytes) {
      if (!bytes.length) return;
      received += bytes.length;
      if (expectedLength && received > expectedLength) {
        reset();
        throw Error('文件大小有误');
      }
      chunks.push(bytes);
      touch();
      onProgress(received, attempt);
    }
    try {
      // A request may queue behind another large transfer before headers arrive.
      // Apply the shorter progress watchdog only after that transfer starts.
      touch(expectedLength ? Math.max(idleMs, 120000) : idleMs);
      const resume = expectedLength && received > 0 && received < expectedLength;
      const headers = resume ? {Range: `bytes=${received}-`} : {};
      const response = await fetcher(url, {
        headers, signal: controller.signal, cache: attempt ? 'reload' : 'default'
      });
      if (response.status === 206) {
        const range = response.headers.get('content-range');
        // Range offsets must refer to the decoded representation already in memory.
        if (!resume || response.headers.get('content-encoding') || range !== `bytes ${received}-${expectedLength - 1}/${expectedLength}`) {
          reset();
          throw Error('续传区间不匹配');
        }
      } else if (response.status === 200) {
        reset(); // The server may ignore Range and return the complete file.
      } else {
        if (response.status === 416) reset();
        throw Error(`HTTP ${response.status}`);
      }
      onProgress(received, attempt);
      touch();
      if (response.body?.getReader) {
        const reader = response.body.getReader();
        try {
          for (;;) {
            const {done, value} = await reader.read();
            if (done) break;
            append(value);
          }
        } finally { reader.releaseLock(); }
      } else {
        append(new Uint8Array(await response.arrayBuffer()));
      }
      check(signal);
      if (expectedLength && received !== expectedLength) throw Error('下载中断');
      const bytes = new Uint8Array(received);
      let offset = 0;
      for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
      if (verify && !await verify(bytes)) {
        reset();
        throw Error('文件校验失败');
      }
      return bytes;
    } catch (error) {
      check(signal);
      if (recover && (received === 0 || attempt === retries)) {
        clearTimeout(timer);
        abort();
        return recover(chunks, received);
      }
      if (attempt === retries) throw Error(`${label}加载失败（${stalled ? '下载停滞' : error.message}），请重新开启摄像头。`);
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener('abort', abort);
      controller.abort();
    }
  }
}

async function valid(bytes, spec) {
  if (bytes.byteLength !== spec[1]) return false;
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map(x => x.toString(16).padStart(2, '0')).join('') === spec[2];
}

async function recoverParts(vendor, spec, prefix, received, signal, report) {
  const partSize = 512 * 1024;
  const bytes = new Uint8Array(spec[1]);
  let offset = 0;
  for (const chunk of prefix) { bytes.set(chunk, offset); offset += chunk.length; }
  let nextPart = Math.floor(received / partSize);
  let completed = nextPart * partSize;
  async function readNext() {
    while (nextPart * partSize < bytes.length) {
      const index = nextPart++;
      const start = index * partSize;
      const url = new URL(`hand-parts/${spec[2]}/${index}.bin`, vendor);
      const part = await downloadBytes(url, {
        expectedLength: Math.min(partSize, bytes.length - start), signal, label: '识别资源分段'
      });
      bytes.set(part, start);
      completed += part.length;
      report(Math.max(received, completed), 1);
    }
  }
  await Promise.all([readNext(), readNext()]);
  if (!await valid(bytes, spec)) throw Error('识别资源分段校验失败，请重新开启摄像头。');
  return bytes;
}

export async function loadHandAssets(signal, onStatus = () => {}) {
  check(signal);
  const wasm = WebAssembly.validate(simdProbe) ? SIMD : SCALAR;
  const vendor = new URL('../vendor/', import.meta.url);
  const sizes = [0, 0], total = MODEL[1] + wasm[1];
  const group = new AbortController();
  const abort = () => group.abort();
  signal?.addEventListener('abort', abort, {once: true});
  let cache, lastStatus = 0;
  async function load(spec, index) {
    const url = new URL(spec[0], vendor).href, key = `${url}?sha256=${spec[2]}`;
    try {
      const hit = await cache?.match(key);
      if (hit) {
        const bytes = new Uint8Array(await hit.arrayBuffer());
        if (await valid(bytes, spec)) { sizes[index] = bytes.length; return bytes; }
        await cache.delete(key);
      }
    } catch { /* Storage access is optional. */ }
    function report(n, attempt) {
        sizes[index] = n;
        const now = Date.now();
        if (now - lastStatus < 200 && n !== spec[1]) return;
        lastStatus = now;
        const percent = Math.floor(100 * (sizes[0] + sizes[1]) / total);
        onStatus(`${attempt ? '重新连接，' : ''}加载识别资源… ${percent}%`);
    }
    const bytes = await downloadBytes(url, {
      signal: group.signal, expectedLength: spec[1], verify: bytes => valid(bytes, spec),
      label: index === 0 ? '手势模型' : '识别引擎', onProgress: report,
      recover: (prefix, received) => recoverParts(vendor, spec, prefix, received, group.signal, report)
    });
    check(group.signal);
    try { await cache?.put(key, new Response(bytes)); } catch { /* Storage may be full. */ }
    return bytes;
  }
  try {
    onStatus('检查已保存的识别资源…');
    try { cache = await globalThis.caches?.open(CACHE); } catch { /* Private browsing. */ }
    check(signal);
    const [modelAssetBuffer, wasmBinary] = await Promise.all([load(MODEL, 0), load(wasm, 1)]);
    check(signal);
    return {
      modelAssetBuffer,
      // Also support a cached v2 client, which calls release() during teardown.
      release() {},
      bundleUrl: new URL('vision_bundle_bytes.mjs', vendor).href,
      files: {
        wasmBinary,
        wasmLoaderPath: new URL(wasm[0].replace(/\.wasm$/, '.js'), vendor).href,
        wasmBinaryPath: new URL(wasm[0], vendor).href
      }
    };
  } finally {
    group.abort();
    signal?.removeEventListener('abort', abort);
  }
}

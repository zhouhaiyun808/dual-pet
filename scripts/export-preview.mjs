// Build a portable browser-only demo from the real page renderers.
// Transform only the exported bundles, never the production/native guards.
import { build } from 'esbuild';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import assert from 'node:assert/strict';
import vm from 'node:vm';

const root = fileURLToPath(new URL('../', import.meta.url));
const inlineScript = value => value.replace(/<\/script/gi, '<\\/script');
const attribute = value => value.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');

async function bundle(source, name) {
  const result = await build({
    absWorkingDir: root, stdin: { contents: source, resolveDir: path.join(root, 'src'), loader: 'ts', sourcefile: `${name}.ts` },
    bundle: true, write: false, format: 'iife', target: 'es2022', minify: true,
    outfile: `${name}.js`, define: { 'location.search': JSON.stringify('?preview=1') },
    plugins: [{ name: 'offline-preview-messaging', setup(builder) {
      builder.onLoad({ filter: /preview-bridge\.ts$/ }, async args => {
        const original = await readFile(args.path, 'utf8');
        const from = "window.parent.postMessage({ type: 'dual-pet-preview-ready' }, location.origin)";
        assert.ok(original.includes(from), 'Preview ready protocol changed; review offline export');
        const adapted = original.replace(from, "window.parent.postMessage({ type: 'dual-pet-preview-ready' }, location.origin === 'null' ? '*' : location.origin)")
          .replaceAll('location.origin', 'offlineOrigin');
        // srcdoc inherits the parent security origin, but its URL is about:srcdoc.
        return { contents: `const offlineOrigin = window.parent.location.origin;\n${adapted}`, loader: 'ts' };
      });
    } }],
  });
  const js = result.outputFiles.find(file => file.path.endsWith('.js')).text;
  const css = result.outputFiles.find(file => file.path.endsWith('.css'))?.text ?? '';
  new vm.Script(js); // Syntax check only; no DOM/native execution.
  return { js, css };
}

async function child(name, id) {
  let source = await readFile(path.join(root, 'src', `${name}.ts`), 'utf8');
  if (name === 'settings') {
    // Unapproved artwork is unrelated to this portable UI review; do not ship
    // large candidate images or broken local asset links in the HTML export.
    const art = /  <section class="card" aria-labelledby="art-heading">[\s\S]*?<\/section>/;
    assert.ok(art.test(source));
    source = source.replace(art, '  <p class="notice">离线演示仅审看计数与成长界面；未附带美术候选资源。</p>');
  }
  const { js, css } = await bundle(source, name);
  return `<!doctype html><html lang="zh-CN"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style></head><body><main id="${id}"></main><script>${inlineScript(js)}</script></body></html>`;
}

const counter = await child('counter', 'counter-app');
const settings = await child('settings', 'settings-app');
let source = await readFile(path.join(root, 'src/preview.ts'), 'utf8');
for (const name of ['counter', 'settings']) {
  const from = `src="/${name}.html?preview=1"`;
  assert.ok(source.includes(from), 'Preview iframe changed; review offline export');
  source = source.replace(from, `srcdoc="\${offline${name}}"`);
}
source = `const offlinecounter = ${JSON.stringify(attribute(counter))};\nconst offlinesettings = ${JSON.stringify(attribute(settings))};\n` + source;
source = source.replace('const origin = location.origin;', "const origin = location.origin; const targetOrigin = origin === 'null' ? '*' : origin;");
assert.equal((source.match(/postMessage\(message\(\), origin\)/g) ?? []).length, 2);
source = source.replaceAll('postMessage(message(), origin)', 'postMessage(message(), targetOrigin)');
// Source-window and receive-origin checks remain in place even for opaque file
// origins; wildcard target delivery goes only to the two known iframe windows.
const { js, css } = await bundle(source, 'preview');
const html = `<!doctype html><html lang="zh-CN"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Dual Pet · 离线演示</title><style>${css}</style></head><body><noscript>请下载文件后用允许JavaScript的浏览器打开。</noscript><main id="preview-app"></main><script>${inlineScript(js)}</script></body></html>`;
assert.ok(!/<script\b[^>]*\bsrc=|<link\b[^>]*\bhref=/i.test(html), 'External bundle reference');
assert.ok(!html.includes('127.0.0.1'), 'Export must not need the development server');
const destination = path.join(root, 'exports', 'Dual-Pet-Preview.html');
await mkdir(path.dirname(destination), { recursive: true });
await writeFile(destination, html);
console.log(`Exported ${destination} (${Buffer.byteLength(html)} bytes); three bundles parsed, no external scripts/styles.`);

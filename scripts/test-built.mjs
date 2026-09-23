import { Miniflare } from 'miniflare';
import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';

// Run only the built artifact, against a disposable in-memory D1 database.
// No local environment file or OpenAI credential is loaded.
const root = fileURLToPath(new URL('..', import.meta.url));
const server = resolve(root, 'dist/server');
const files = await readdir(server, { recursive: true });
const modules = ['index.js', ...files.filter(f => /\.m?js$/.test(f) && f !== 'index.js')]
  .map(f => ({ type: 'ESModule', path: resolve(server, f) }));
const mf = new Miniflare({
  modules, modulesRoot: server,
  compatibilityDate: '2026-05-15', compatibilityFlags: ['nodejs_compat'],
  d1Databases: { DB: 'qa-built-worker' },
  assets: { directory: resolve(root, 'dist/client'), routerConfig: { has_user_worker: true } },
  port: 0, host: '127.0.0.1',
  bindings: { OPENAI_REQUESTS_ENABLED: 'false' },
});
try {
  const address = await mf.ready;
  const base = address.origin;
  const db = await mf.getD1Database('DB');
  for (const migration of (await readdir(resolve(root, 'drizzle'))).filter(f => f.endsWith('.sql')).sort()) {
    const sql = await readFile(resolve(root, 'drizzle', migration), 'utf8');
    for (const statement of sql.split('--> statement-breakpoint').map(s => s.trim()).filter(Boolean)) await db.prepare(statement).run();
  }
  const response = await fetch(base);
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.ok(html.includes('AI Sana'));
  const assets = [...html.matchAll(/(?:src|href)="(\/[^"?]+\.(?:js|css))"/g)].map(match => match[1]);
  assert.ok(assets.length > 0, 'SSR must link the client assets.');
  for (const path of new Set(assets)) {
    const asset = await fetch(base + path);
    assert.equal(asset.status, 200, path);
    assert.ok((await asset.arrayBuffer()).byteLength > 0);
  }
  console.log('PASS: built Worker renders the app and serves its client assets.');
  await new Promise((done, fail) => {
    const child = spawn(process.execPath, [resolve(root, 'scripts/test-api.mjs')], {
      cwd: root, env: { ...process.env, TEST_URL: base }, stdio: 'inherit',
    });
    child.on('error', fail);
    child.on('exit', code => code === 0 ? done() : fail(new Error('API check exit ' + code)));
  });
} finally {
  await mf.dispose();
}

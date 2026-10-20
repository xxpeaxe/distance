import fs from 'node:fs';
import ts from 'typescript';
import assert from 'node:assert/strict';
const code = ts.transpileModule(fs.readFileSync('app/api/export-map/route.ts', 'utf8'), {compilerOptions: {module: ts.ModuleKind.ESNext}}).outputText;
const {GET} = await import('data:text/javascript;base64,' + Buffer.from(code).toString('base64'));
const request = (q = 'x=126.97&y=37.55&level=6') => new Request(`https://example.com/api/export-map?${q}`);
delete process.env.KAKAO_REST_API_KEY;
assert.equal((await GET(request())).status, 503);
process.env.KAKAO_REST_API_KEY = 'test-key';
let calls = 0;
globalThis.fetch = async (url, options) => {
  calls++;
  assert.equal(url.origin, 'https://dapi.kakao.com');
  assert.equal(url.pathname, '/v2/maps/staticmap');
  assert.equal(url.searchParams.get('center'), '126.97,37.55');
  assert.equal(url.searchParams.get('size'), '900x500');
  assert.equal(url.searchParams.get('scale'), '1');
  assert.equal(url.searchParams.get('logo_pos'), 'BOTTOM_RIGHT');
  assert.equal(options.headers.Authorization, 'KakaoAK test-key');
  assert.equal(options.redirect, 'error');
  return new Response(new Uint8Array([137, 80, 78, 71]), {headers: {'content-type': 'image/png'}});
};
for (const q of ['', 'x=&y=37&level=6', 'x=127&y=37&level=1.5', 'x=127&y=37&level=16', 'x=0&y=37&level=6', 'x=https://example.com&y=37&level=6']) {
  assert.equal((await GET(request(q))).status, 400);
}
assert.equal(calls, 0);
const response = await GET(request());
assert.equal(response.status, 200);
assert.equal(response.headers.get('content-type'), 'image/png');
assert.equal(response.headers.get('cache-control'), 'no-store');
assert.deepEqual(new Uint8Array(await response.arrayBuffer()), new Uint8Array([137, 80, 78, 71]));
globalThis.fetch = async () => new Response('upstream secret', {status: 403});
assert.equal((await GET(request())).status, 502);
globalThis.fetch = async () => new Response('<html>wrong format</html>', {headers: {'content-type': 'text/html'}});
assert.equal((await GET(request())).status, 502);
globalThis.fetch = async () => {throw new Error('timeout with secret');};
const error = await GET(request()); assert.equal(error.status, 502);
assert.equal((await error.text()).includes('secret'), false);
console.log('PASS: export map validates bounds, protects REST key, fixes API host/size/logo, passes PNG, handles upstream failures');

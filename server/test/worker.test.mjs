import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';

const ORIGIN = 'https://nisisinnjukuoyaji-ai.github.io';
// 最小の JPEG ヘッダ（FF D8 FF E0 ...）
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, ...Array(60).fill(7)]).toString('base64');
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, ...Array(60).fill(7)]).toString('base64');

let worker;
let calls = [];
let nextReply;

before(async () => {
  await build({ entryPoints: ['src/index.ts'], bundle: true, format: 'esm', platform: 'node', outfile: 'dist/test-worker.mjs', logLevel: 'error' });
  worker = (await import('../dist/test-worker.mjs')).default;
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), headers: new Headers(init.headers), body: JSON.parse(init.body) });
    return new Response(JSON.stringify(nextReply), { status: 200, headers: { 'content-type': 'application/json' } });
  };
});

const message = (stop_reason, payload) => ({
  id: 'msg_1', type: 'message', role: 'assistant', model: 'claude-opus-5-5', stop_reason, stop_sequence: null,
  content: payload ? [{ type: 'text', text: JSON.stringify(payload) }] : [],
  usage: { input_tokens: 1500, output_tokens: 300 },
});

const guess = (value, confidence, candidates = []) => ({ value, confidence, candidates });
const GOOD = {
  isGear: true,
  category: guess('effect', 'high'),
  type: guess('オーバードライブ', 'high'),
  brand: guess('Ibanez', 'high'),
  model: guess('Tube Screamer', 'medium', ['TS808']),
  modelNumber: guess('TS9', 'medium', ['TS808', 'TS9DX', 'TS10']),
  color: guess('緑', 'high'),
  features: ['3ノブ', 'ラバーフットスイッチ'],
  evidence: '筐体に Ibanez のロゴと TS9 の表記が見える',
};

function kv() {
  const m = new Map();
  return { get: async k => m.get(k) ?? null, put: async (k, v) => void m.set(k, v) };
}
const env = (extra = {}) => ({ ANTHROPIC_API_KEY: 'sk-test', ALLOWED_ORIGINS: ORIGIN, ...extra });
const post = (body, origin = ORIGIN) => new Request('https://api.example/v1/identify', {
  method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json', 'CF-Connecting-IP': '203.0.113.9' }, body: JSON.stringify(body),
});

test('CORS preflight は許可オリジンにだけ許可ヘッダを返す', async () => {
  const ok = await worker.fetch(new Request('https://api.example/v1/identify', { method: 'OPTIONS', headers: { Origin: ORIGIN } }), env());
  assert.equal(ok.status, 204);
  assert.equal(ok.headers.get('Access-Control-Allow-Origin'), ORIGIN);
  const ng = await worker.fetch(new Request('https://api.example/v1/identify', { method: 'OPTIONS', headers: { Origin: 'https://evil.example' } }), env());
  assert.equal(ng.headers.get('Access-Control-Allow-Origin'), null);
});

test('許可されていないオリジンは 403、API は呼ばない', async () => {
  calls = [];
  const res = await worker.fetch(post({ image: { mediaType: 'image/jpeg', data: JPEG } }, 'https://evil.example'), env());
  assert.equal(res.status, 403);
  assert.equal(calls.length, 0);
});

test('形式が一致しない画像は 400', async () => {
  calls = [];
  const res = await worker.fetch(post({ image: { mediaType: 'image/jpeg', data: PNG } }), env());
  assert.equal(res.status, 400);
  assert.equal((await res.json()).error.code, 'bad_image');
  assert.equal(calls.length, 0);
});

test('正常系: Claude に画像と構造化出力を要求し、正規化した結果を返す', async () => {
  calls = [];
  nextReply = message('end_turn', { ...GOOD, type: guess('ドライブ', 'high') });
  const res = await worker.fetch(post({ image: { mediaType: 'image/jpeg', data: JPEG } }), env());
  assert.equal(res.status, 200);
  const body = await res.json();

  const req = calls[0];
  assert.match(req.url, /\/v1\/messages/);
  assert.equal(req.headers.get('x-api-key'), 'sk-test');
  assert.match(req.headers.get('anthropic-beta'), /server-side-fallback-2026-07-01/);
  assert.equal(req.body.model, 'claude-opus-5-5');
  assert.equal(req.body.fallbacks, 'default');
  assert.equal(req.body.output_config.effort, 'medium');
  assert.equal(req.body.output_config.format.type, 'json_schema');
  assert.deepEqual(req.body.messages[0].content[0].source, { type: 'base64', media_type: 'image/jpeg', data: JPEG });

  assert.equal(body.schemaVersion, 1);
  assert.equal(body.result.brand.value, 'Ibanez');
  // 選択肢にない種類は value から外して候補へ
  assert.equal(body.result.type.value, '');
  assert.equal(body.result.type.confidence, 'low');
  // 候補は最大3件、value と重複しない
  assert.deepEqual(body.result.modelNumber.candidates, ['TS808', 'TS9DX', 'TS10']);
});

test('refusal は 422 で返す', async () => {
  nextReply = message('refusal', null);
  const res = await worker.fetch(post({ image: { mediaType: 'image/jpeg', data: JPEG } }), env());
  assert.equal(res.status, 422);
  assert.equal((await res.json()).error.code, 'refused');
});

test('日次上限を超えると 429、API は呼ばない', async () => {
  nextReply = message('end_turn', GOOD);
  const e = env({ USAGE: kv(), FREE_DAILY_LIMIT: '1' });
  const first = await worker.fetch(post({ image: { mediaType: 'image/jpeg', data: JPEG } }), e);
  assert.equal(first.status, 200);
  assert.equal(first.headers.get('X-Quota-Remaining'), '0');
  calls = [];
  const second = await worker.fetch(post({ image: { mediaType: 'image/jpeg', data: JPEG } }), e);
  assert.equal(second.status, 429);
  assert.equal(calls.length, 0);
});

test('API キー未設定なら 503', async () => {
  const res = await worker.fetch(post({ image: { mediaType: 'image/jpeg', data: JPEG } }), env({ ANTHROPIC_API_KEY: '' }));
  assert.equal(res.status, 503);
});

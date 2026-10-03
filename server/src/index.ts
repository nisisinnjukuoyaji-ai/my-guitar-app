import { AccessError, consumeQuota, resolveCaller, type AccessEnv } from './access';
import { IdentifyError, identifyGear, type ImageMediaType } from './identify';
import { SCHEMA_VERSION } from './schema';

export interface Env extends AccessEnv {
  ANTHROPIC_API_KEY: string; // wrangler secret put ANTHROPIC_API_KEY で設定（コードやリポジトリには置かない）
  ALLOWED_ORIGINS: string; // カンマ区切り。例: https://nisisinnjukuoyaji-ai.github.io
  CLAUDE_MODEL?: string;
  CLAUDE_EFFORT?: string;
}

const DEFAULT_MODEL = 'claude-opus-5-5';
const MAX_BODY_BYTES = 6 * 1024 * 1024;
const MAX_IMAGE_BYTES = 4 * 1024 * 1024;

// 申告された形式と実際のファイル先頭バイトが一致するかを確認する
const SIGNATURES: Record<ImageMediaType, (b: Uint8Array) => boolean> = {
  'image/jpeg': b => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  'image/png': b => b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47,
  'image/webp': b => String.fromCharCode(...b.slice(0, 4)) === 'RIFF' && String.fromCharCode(...b.slice(8, 12)) === 'WEBP',
};

function corsHeaders(request: Request, env: Env): Record<string, string> {
  const origin = request.headers.get('Origin');
  const allowed = env.ALLOWED_ORIGINS.split(',').map(s => s.trim()).filter(Boolean);
  if (!origin || !allowed.includes(origin)) return { Vary: 'Origin' };
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

function json(body: unknown, status: number, headers: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers },
  });
}

const fail = (status: number, code: string, message: string, headers: Record<string, string>) =>
  json({ error: { code, message } }, status, headers);

function parseImage(body: unknown): { mediaType: ImageMediaType; data: string } | string {
  const image = (body as { image?: { mediaType?: unknown; data?: unknown } } | null)?.image;
  if (!image || typeof image.data !== 'string' || typeof image.mediaType !== 'string') return '画像がありません';
  if (!Object.hasOwn(SIGNATURES, image.mediaType)) return 'JPEG / PNG / WebP の画像を送ってください';
  const mediaType = image.mediaType as ImageMediaType;
  const data = image.data;
  if (data.length * 0.75 > MAX_IMAGE_BYTES) return '画像が大きすぎます';
  if (data.length < 16 || !/^[A-Za-z0-9+/]+={0,2}$/.test(data)) return '画像データが不正です';
  let head: Uint8Array;
  try {
    head = Uint8Array.from(atob(data.slice(0, 16)), c => c.charCodeAt(0));
  } catch {
    return '画像データが不正です';
  }
  if (!SIGNATURES[mediaType](head)) return '画像の形式が一致しません';
  return { mediaType, data };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const cors = corsHeaders(request, env);

    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    if (url.pathname === '/v1/health') return json({ ok: true, schemaVersion: SCHEMA_VERSION }, 200, cors);
    if (url.pathname !== '/v1/identify') return fail(404, 'not_found', 'Not found', cors);
    if (request.method !== 'POST') return fail(405, 'method_not_allowed', 'POST only', cors);

    // ブラウザからは許可したサイトのみ。Origin は偽装できるので、本当の防御は下の利用回数制限と（将来の）認証
    if (!cors['Access-Control-Allow-Origin']) return fail(403, 'origin_not_allowed', 'このサイトからは利用できません', cors);
    if (!env.ANTHROPIC_API_KEY) return fail(503, 'not_configured', 'AI 判定の設定が完了していません', cors);

    const length = Number(request.headers.get('Content-Length') ?? 0);
    if (length > MAX_BODY_BYTES) return fail(413, 'too_large', '画像が大きすぎます', cors);

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return fail(400, 'bad_request', 'リクエストの形式が不正です', cors);
    }
    const image = parseImage(body);
    if (typeof image === 'string') return fail(400, 'bad_image', image, cors);

    let quota: { limit: number; remaining: number } | null;
    try {
      const caller = await resolveCaller(request, env);
      quota = await consumeQuota(caller, env);
    } catch (err) {
      if (err instanceof AccessError) return fail(err.status, err.code, err.message, cors);
      throw err;
    }
    if (!quota) return fail(429, 'quota_exceeded', '本日の AI 判定の上限に達しました', cors);
    const quotaHeaders = { ...cors, 'X-Quota-Limit': String(quota.limit), 'X-Quota-Remaining': String(quota.remaining) };

    const effort = env.CLAUDE_EFFORT === 'low' || env.CLAUDE_EFFORT === 'high' ? env.CLAUDE_EFFORT : 'medium';
    try {
      const { result, model, usage } = await identifyGear(image, {
        apiKey: env.ANTHROPIC_API_KEY,
        model: env.CLAUDE_MODEL || DEFAULT_MODEL,
        effort,
      });
      // 画像は保存しない。ログには原価管理用のトークン数だけ残す
      console.log(JSON.stringify({ event: 'identify', model, ...usage }));
      return json({ schemaVersion: SCHEMA_VERSION, result, quota }, 200, quotaHeaders);
    } catch (err) {
      if (err instanceof IdentifyError) {
        const status = err.code === 'upstream_rate_limited' ? 503 : err.code === 'refused' ? 422 : 502;
        return fail(status, err.code, err.message, quotaHeaders);
      }
      console.error('identify failed', err);
      return fail(500, 'internal', 'AI 判定に失敗しました', quotaHeaders);
    }
  },
} satisfies ExportedHandler<Env>;

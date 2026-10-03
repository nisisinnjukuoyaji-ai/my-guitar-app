// 「誰が」「どのプランで」「今日あと何回」使えるかを決める層。
// 有料化するときは resolveCaller を差し替える（例: Sign in with Apple / Firebase Auth の ID トークン検証、
// App Store のレシートや Stripe のサブスク状態からプランを決める）。index.ts 側は変更不要。

export type Plan = 'free' | 'pro';

export interface Caller {
  id: string; // 利用回数の集計キー。個人を特定できる値（生の IP など）は入れない
  plan: Plan;
}

export interface AccessEnv {
  USAGE?: KVNamespace; // 日次の利用回数を数える KV（未設定なら回数制限なし）
  IP_HASH_SALT?: string;
  FREE_DAILY_LIMIT?: string;
  PRO_DAILY_LIMIT?: string;
}

export class AccessError extends Error {
  constructor(readonly status: 401 | 403, readonly code: string, message: string) {
    super(message);
  }
}

async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('');
}

// 現在はログインなしの最小構成: 接続元 IP のハッシュを匿名 ID にして free プラン扱いにする。
export async function resolveCaller(request: Request, env: AccessEnv): Promise<Caller> {
  const ip = request.headers.get('CF-Connecting-IP') ?? 'unknown';
  const id = 'anon:' + (await sha256Hex(`${env.IP_HASH_SALT ?? ''}:${ip}`)).slice(0, 32);
  return { id, plan: 'free' };
}

export function dailyLimit(plan: Plan, env: AccessEnv): number {
  const raw = plan === 'pro' ? env.PRO_DAILY_LIMIT : env.FREE_DAILY_LIMIT;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : plan === 'pro' ? 200 : 10;
}

// 1回分を消費する。上限に達していれば null。KV は結果整合なので厳密な上限ではなく「目安」の制限。
export async function consumeQuota(caller: Caller, env: AccessEnv): Promise<{ limit: number; remaining: number } | null> {
  const limit = dailyLimit(caller.plan, env);
  if (!env.USAGE) return { limit, remaining: limit };

  const day = new Date().toISOString().slice(0, 10);
  const key = `usage:${day}:${caller.id}`;
  const used = Number(await env.USAGE.get(key)) || 0;
  if (used >= limit) return null;
  await env.USAGE.put(key, String(used + 1), { expirationTtl: 60 * 60 * 48 });
  return { limit, remaining: limit - used - 1 };
}

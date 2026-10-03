// AI 判定サーバーとの通信。APIキーはサーバー側にだけあり、ここには置かない。
window.GearAI = (() => {
  'use strict';

  const SUPPORTED_SCHEMA = 1;
  const endpoint = ((window.GEAR_APP_CONFIG || {}).aiEndpoint || '').replace(/\/+$/, '');

  // 有料化のときにログイン後の ID トークンを返す（サーバーの access.ts で検証する）。今は匿名利用。
  async function getAuthToken() {
    return null;
  }

  async function identify(blob) {
    const data = await window.PhotoStore.toBase64(blob);
    const headers = { 'Content-Type': 'application/json' };
    const token = await getAuthToken();
    if (token) headers.Authorization = `Bearer ${token}`;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 90_000);
    let res;
    try {
      res = await fetch(`${endpoint}/v1/identify`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ image: { mediaType: blob.type || 'image/jpeg', data } }),
        signal: controller.signal,
      });
    } catch {
      throw new Error(controller.signal.aborted ? 'AI の応答がありませんでした' : 'AI サーバーに接続できませんでした');
    } finally {
      clearTimeout(timer);
    }

    const body = await res.json().catch(() => null);
    if (!res.ok) throw new Error((body && body.error && body.error.message) || `AI 判定に失敗しました（${res.status}）`);
    if (!body || body.schemaVersion !== SUPPORTED_SCHEMA) throw new Error('アプリを最新版に更新してください');
    return { result: body.result, quota: body.quota || null };
  }

  return { enabled: Boolean(endpoint), identify };
})();

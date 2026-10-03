// 公開してよい設定だけを書くファイル。APIキーなどの秘密情報は絶対に書かない（キーはサーバー側にだけ置く）。
window.GEAR_APP_CONFIG = {
  // AI 判定サーバー（server/ の Cloudflare Worker）の URL。空なら AI 判定ボタンを出さない。
  // 例: 'https://guitar-gear-api.<あなたのサブドメイン>.workers.dev'
  aiEndpoint: '',
};

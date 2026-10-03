# ギター機材管理

ギター・アンプ・キャビネット・エフェクターを登録・編集・削除できる、スマホ（iPhone）向けの Web アプリです。
ビルド不要の HTML / CSS / JavaScript だけで動きます。

公開版（GitHub Pages）: https://nisisinnjukuoyaji-ai.github.io/my-guitar-app/

## 機能

- カテゴリ別タブ（すべて / ギター / アンプ / キャビネット / エフェクター）
- 機材の登録・編集・削除（削除時は確認ダイアログ）
- 項目: メーカー、モデル名、型番、種類、色、状態、購入日、購入価格、シリアル、特徴、メモ
- 写真の撮影・選択と保存（一覧にサムネイル表示）
- **写真から AI で機材を判定して入力欄に自動反映**（下記）
- 検索、ダークモード対応、iPhone のノッチ／ホームバー対応

## 写真からの AI 判定

登録画面で写真を撮影または選択すると、AI が機材の種類・メーカー・モデル名・型番・色・特徴を推定します。

| AI の確信度 | 入力欄の扱い |
|---|---|
| 高い | 自動で入力し「AI」の印を付ける |
| 中くらい | 自動で入力し「要確認」の印を付ける |
| 低い | 空欄のまま、下に「候補」ボタンを出す（タップで入力） |

- 自分で先に入力していた欄は上書きせず、AI の推定は「候補」として出すだけです。
- 入力欄を手で直すと印は消えます。保存するまで何も登録されないので、確認・修正してから保存してください。
- 編集中の機材のカテゴリは AI が勝手に変えません（候補として出します）。

### 仕組み（API キーをブラウザに置かない構成）

```
iPhone（GitHub Pages のアプリ）
   │  写真（長辺1568pxのJPEGに縮小）
   ▼
AI 判定サーバー（server/ ・ Cloudflare Workers）  ← API キーはここの secret にだけ保存
   │  許可サイトの確認・画像形式チェック・1日の回数制限
   ▼
Claude API（画像解析・JSON形式で回答）
```

- API キーはサーバーの secret にだけ置きます。フロントの `config.js` に書くのはサーバーの URL だけです。
- サーバーは写真を保存しません。ログに残すのはトークン数だけです。
- AI の回答はサーバー側で検証してから返します（選択肢にない値は除外、文字数の制限）。

### AI 判定を有効にする手順

Cloudflare アカウント（無料プランで可）と Anthropic の API キーが必要です。

```sh
cd server
npm install
npx wrangler login
npx wrangler secret put ANTHROPIC_API_KEY   # API キーを入力（ファイルには書かない）
npx wrangler secret put IP_HASH_SALT        # 任意のランダムな文字列
npx wrangler kv namespace create USAGE      # 1日の回数制限用。出力された id を wrangler.toml に設定
npx wrangler deploy                         # 表示された https://guitar-gear-api.xxx.workers.dev を控える
```

最後に `config.js` の `aiEndpoint` に、控えた URL を設定してプッシュします。
`aiEndpoint` が空のあいだは AI 判定ボタンが出ず、写真の保存だけが使えます。

設定値（`server/wrangler.toml` の `[vars]`）:

| 名前 | 内容 |
|---|---|
| `ALLOWED_ORIGINS` | 利用を許可するサイト（カンマ区切り） |
| `CLAUDE_MODEL` | 使う Claude のモデル（既定 `claude-opus-5-5`） |
| `CLAUDE_EFFORT` | 推論の深さ `low` / `medium` / `high`（既定 `medium`）。下げると安く速くなる |
| `FREE_DAILY_LIMIT` / `PRO_DAILY_LIMIT` | 1日の判定回数の上限（無料 / 有料プラン） |

### 有料アプリ化を見据えた設計

- **利用者とプランの判定を1か所に集約**: `server/src/access.ts` の `resolveCaller` を差し替えるだけで、ログイン（Sign in with Apple など）や課金状態（App Store / Stripe）に応じたプランに切り替えられます。フロント側は `ai.js` の `getAuthToken` にトークンを返す処理を足すだけです。
- **プラン別の回数制限**: 無料 / 有料で1日の上限を分けてあり、API の原価が青天井にならないようにしています。
- **原価の管理**: モデルと推論の深さは設定で切り替えられます。ログのトークン数から1回あたりの原価を計算できます。
- **互換性**: API の応答に `schemaVersion` を付けているので、サーバーとアプリを別々に更新しても、古いアプリは「更新してください」と表示できます。
- **プライバシー**: 写真はサーバーに保存せず、接続元 IP もハッシュ化して集計に使うだけです。公開前にプライバシーポリシーへ「写真を AI 解析のため外部 API に送信する」旨を記載してください。

## 使い方（ローカル）

```sh
python3 -m http.server 8000
```

ブラウザで http://localhost:8000 を開きます（AI 判定をローカルで試すときは `ALLOWED_ORIGINS` に `http://localhost:8000` を追加）。

iPhone の Safari で開いて「共有 → ホーム画面に追加」すると、アプリのように全画面で使えます。

## データの保存場所

- 機材の情報はブラウザの localStorage、写真は IndexedDB に保存されます。その端末・そのブラウザの中だけに残り、ほかの端末とは共有されません。
- Safari は、ホーム画面に追加していないサイトのデータを、しばらく使わないと消すことがあります。ホーム画面に追加して使うことをおすすめします。

## テスト

```sh
cd server && npm test   # AI 判定サーバーのテスト（Claude API は模擬応答）
```

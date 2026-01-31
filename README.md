# Free Time Finder (Slack版)

Slackでチームメンバー全員の空き時間を検索・共有するBotです。

---

## できること

| 機能 | 説明 |
|------|------|
| 全員の空き時間検索 | 複数人のGoogleカレンダーを参照して、全員が空いている時間を検索 |
| チャンネルに共有 | MTG調整用に空き時間をチャンネルに投稿 |

## 使い方

Slackで `/cal` コマンドを使用します。

| コマンド | 説明 |
|---------|------|
| `/cal` | 今週の空き時間をチャンネルに共有 |
| `/cal help` | ヘルプを表示 |

---

## セットアップ手順

> 困ったとき: 手順通りにいかない場合は、開発者（青木）に相談してください。

### 必要なアカウント

以下のサービスのアカウントが必要です（すべて無料で作成可能）：

1. **Cloudflare** - Botをインターネット上で動かすため
2. **Slack** - ワークスペースの管理者権限が必要
3. **Google Cloud** - Googleカレンダーと連携するため

---

### ステップ1: Slack Appの作成

#### 1-1. アプリを作成

1. [Slack API](https://api.slack.com/apps) にアクセス
2. 「Create New App」をクリック
3. 「From scratch」を選択
4. App Name: `空き時間検索Bot`（好きな名前でOK）
5. ワークスペースを選択→「Create App」

#### 1-2. 権限（スコープ）を設定

1. 左メニュー「OAuth & Permissions」
2. 「Scopes」セクションの「Bot Token Scopes」で「Add an OAuth Scope」
3. 以下を追加：
   - `chat:write` - メッセージを送信するため
   - `commands` - スラッシュコマンドを使うため

#### 1-3. スラッシュコマンドを作成

1. 左メニュー「Slash Commands」
2. 「Create New Command」
3. 以下を入力：
   - Command: `/cal`
   - Request URL: `https://calendar-slack-bot.あなたのサブドメイン.workers.dev/slack/command`
     （デプロイ後に正しいURLに更新します）
   - Short Description: `空き時間検索`
   - Usage Hint: `[help]`
4. 「Save」

#### 1-4. ワークスペースにインストール

1. 左メニュー「OAuth & Permissions」
2. 「Install to Workspace」→「許可する」
3. 表示される「Bot User OAuth Token」（`xoxb-`で始まる）を **コピーして保存**

#### 1-5. Signing Secretを取得

1. 左メニュー「Basic Information」
2. 「App Credentials」セクションの「Signing Secret」を **コピーして保存**

> メモしておくもの:
> - Bot User OAuth Token（xoxb-...）
> - Signing Secret

---

### ステップ2: Google Calendar APIの設定

#### 2-1. Google Cloudプロジェクトの作成

1. [Google Cloud Console](https://console.cloud.google.com/) にアクセス
2. Googleアカウントでログイン
3. 画面上部の「プロジェクトを選択」→「新しいプロジェクト」
4. プロジェクト名を入力（例: `free-time-finder`）→「作成」

#### 2-2. Calendar APIを有効化

1. 左メニュー「APIとサービス」→「ライブラリ」
2. 検索バーで「Google Calendar API」を検索
3. クリックして「有効にする」

#### 2-3. サービスアカウントの作成

1. 左メニュー「APIとサービス」→「認証情報」
2. 「＋認証情報を作成」→「サービスアカウント」
3. サービスアカウント名を入力（例: `free-time-finder`）→「作成して続行」
4. ロールは選択せずに「続行」→「完了」
5. 作成したサービスアカウントをクリック
6. 「キー」タブ→「鍵を追加」→「新しい鍵を作成」
7. 「JSON」を選択→「作成」
8. JSONファイルがダウンロードされる

#### 2-4. JSONファイルから情報を取得

ダウンロードしたJSONファイルをテキストエディタで開き、以下をコピー：

- `client_email` の値（例: `xxx@xxx.iam.gserviceaccount.com`）
- `private_key` の値（`-----BEGIN PRIVATE KEY-----`で始まる長い文字列）

> メモしておくもの:
> - サービスアカウントメールアドレス（client_email）
> - 秘密鍵（private_key）

#### 2-5. 各メンバーのカレンダーへのアクセス権限を付与

**全員分のカレンダーに対して以下を行います：**

1. [Googleカレンダー](https://calendar.google.com/) を開く
2. 左側のカレンダー一覧から、対象カレンダーの「⋮」→「設定と共有」
3. 「特定のユーザーまたはグループと共有する」セクションで「ユーザーやグループを追加」
4. サービスアカウントのメールアドレスを入力
5. 権限を「予定の表示（すべての予定の詳細）」に設定→「送信」
6. 同じ設定画面の「カレンダーの統合」セクションで「カレンダーID」をコピー

> メモしておくもの:
> - 各メンバーのカレンダーID（通常はメールアドレス形式）

---

### ステップ3: Cloudflareへのデプロイ

#### 3-1. Cloudflareアカウント作成

1. [Cloudflare](https://cloudflare.com/) にアクセス
2. 「Sign Up」でアカウント作成

#### 3-2. Wranglerのインストール

ターミナルを開き、以下を実行：

```bash
# プロジェクトフォルダに移動
cd calendar-slack-bot

# 依存関係をインストール
npm install

# Cloudflareにログイン（ブラウザが開きます）
npx wrangler login
```

#### 3-3. シークレットの設定

以下のコマンドを1つずつ実行し、メモしておいた値を入力：

```bash
# Slack Bot Token
npx wrangler secret put SLACK_BOT_TOKEN
# → メモした「Bot User OAuth Token」を貼り付けてEnter

# Slack Signing Secret
npx wrangler secret put SLACK_SIGNING_SECRET
# → メモした「Signing Secret」を貼り付けてEnter

# Googleサービスアカウントメール
npx wrangler secret put GOOGLE_SERVICE_ACCOUNT_EMAIL
# → メモした「サービスアカウントメールアドレス」を貼り付けてEnter

# Google秘密鍵（改行を含む長い文字列）
npx wrangler secret put GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY
# → メモした「秘密鍵」をそのまま貼り付けてEnter

# GoogleカレンダーIDs（カンマ区切りで複数指定）
npx wrangler secret put GOOGLE_CALENDAR_IDS
# → 「user1@gmail.com,user2@gmail.com,user3@gmail.com」のように入力
```

#### 3-4. デプロイ

```bash
npm run deploy
```

成功すると、URLが表示されます（例: `https://calendar-slack-bot.xxx.workers.dev`）

---

### ステップ4: Slack AppのURLを更新

デプロイで表示されたURLを使って、Slack Appの設定を更新します。

1. [Slack API](https://api.slack.com/apps) でアプリを開く
2. 「Slash Commands」→ `/cal` を編集：
   - Request URL: `https://calendar-slack-bot.あなたのサブドメイン.workers.dev/slack/command`
3. 「Save」

---

### ステップ5: 動作確認

1. Slackで任意のチャンネルを開く
2. `/cal` と入力してEnter
3. 全員の空き時間が表示されればOK！

---

## セキュリティについて

### 読み取り専用アクセス

このBotは「読み取り専用」でカレンダーにアクセスします。

**特徴:**
- 予定の追加・削除・変更は**できません**
- 予定の閲覧のみ（空き時間計算のため）
- APIキーなどはCloudflareの「シークレット」として暗号化保存

**安全な理由:**
- シークレットはCloudflareが暗号化して管理
- カレンダーへのアクセスは許可されたカレンダーのみ
- GoogleのAPIは通信が暗号化（HTTPS）されている
- Slackとの通信も署名検証で保護

---

## トラブルシューティング

### コマンドが反応しない

- Slash CommandのRequest URLが正しいか確認
- Cloudflareへのデプロイが成功しているか確認
- Cloudflareのログで確認: `npm run tail`

### 空き時間が表示されない

- 各メンバーのカレンダーでサービスアカウントにアクセス権限を付与したか確認
- カレンダーIDが正しいか確認（カンマ区切りで複数指定）
- GOOGLE_CALENDAR_IDSの設定を確認

### その他の問題

開発者（青木）に連絡してください。

---

## 技術スタック

- Cloudflare Workers
- TypeScript
- Slack API (Block Kit)
- Google Calendar API（サービスアカウント認証、読み取り専用）

---

## 問い合わせ

セットアップで困ったこと、エラーが発生した場合は、開発者（青木）に連絡してください。

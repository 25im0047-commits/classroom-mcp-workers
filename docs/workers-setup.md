# このForkのWorkers運用手順

Google Classroomを学生本人のアカウントで読み取るための個人用構成です。元のリポジトリのMITライセンスと履歴を保持しています。元のコードにある任意のUNIPA連携は、このデプロイでは設定していません。

## 接続先と保存先

- GitHub: https://github.com/25im0047-commits/classroom-mcp-workers
- 実装ブランチ: `cloudflare-personal-deploy`
- Worker: `classroom-mcp-25im0047`
- MCP: `https://classroom-mcp-25im0047.shotakobayashi-dev.workers.dev/mcp`
- Google callback: `https://classroom-mcp-25im0047.shotakobayashi-dev.workers.dev/callback`
- OAuth KV binding: `OAUTH_KV`。専用のNamespaceを使用します。

`PUBLIC_URL`とKV IDは非機密設定として`wrangler.jsonc`にあります。Google資格情報・許可メール・GoogleトークンはGitへ保存しません。`.dev.vars`はローカル開発専用で、本番のSecretsには反映されません。

## Google Cloudで本人が行う設定

1. [Google Cloud Console](https://console.cloud.google.com/)で、この用途のプロジェクトを作成または選択します。支払い設定はこの手順に含みません。
2. APIとサービスのライブラリでGoogle Classroom APIを有効化します。
3. Google Auth Platformのブランド情報を入力します。アプリ名は任意、サポート・連絡先メールは本人が管理できるものにします。
4. AudienceをExternal / Testingにし、Classroomで使うアカウントをテストユーザーに追加します。学校の組織内プロジェクトを使う場合は、その管理方針に従います。
5. Data Accessで`openid`、`https://www.googleapis.com/auth/userinfo.email`、`https://www.googleapis.com/auth/classroom.courses.readonly`、`https://www.googleapis.com/auth/classroom.coursework.me.readonly`を追加します。Googleの画面で最後の権限が`classroom.student-submissions.me.readonly`として扱われてもコードは対応しています。
6. Clientsで「ウェブアプリケーション」のOAuthクライアントを作成します。承認済みリダイレクトURIに上記のGoogle callbackを完全一致で登録します。JavaScriptの承認済みオリジンは不要です。
7. 発行されたIDとSecretを次のCloudflare実行時Secretsへ直接入力します。SecretやGoogleの認証コードをチャットやGitHubへ貼らないでください。

GoogleのExternal / Testingでは、この構成の更新トークンは7日で期限切れになります。Testingでの永続保存はGoogleによる有効期限を延長しません。継続運用ではGoogleの公開・審査要件を確認します。学校が外部アプリを制限している場合は管理者の許可が必要です。[Google OAuthの公式説明](https://developers.google.com/identity/protocols/oauth2#expiration)

## Cloudflareの実行時Secrets

[Cloudflareの専用Worker](https://dash.cloudflare.com/f38e0773ca8b5518385378f84c9497fb/workers/services/view/classroom-mcp-25im0047/production)のSettings → Variables and Secretsで、次をSecret型で設定・反映します。

| 名前                   | 値                                     |
| ---------------------- | -------------------------------------- |
| `GOOGLE_CLIENT_ID`     | 作成したウェブOAuthクライアントID      |
| `GOOGLE_CLIENT_SECRET` | そのクライアントシークレット           |
| `ALLOWED_EMAILS`       | 本人が使うClassroomのメールアドレス1件 |

許可メールは担当者が初回設定します。Googleの2項目はOAuthクライアント作成後に本人が設定します。許可メールの未設定・空欄では全接続を拒否し、既存のMCPアクセス・更新トークンも拒否します。メールを公開ソースへ書かないでください。

ローカル端末から対話入力する場合はNode.js 24を使用し、実装ブランチをチェックアウトして次を実行します。引数やコマンド履歴にSecret値を入れません。

```bash
npx wrangler secret put GOOGLE_CLIENT_ID
npx wrangler secret put GOOGLE_CLIENT_SECRET
```

Google資格情報が未設定の間、`/health`と`/authorize`は503です。未認証の`/mcp`は401です。Google資格情報を設定したら`/health`が200の`status: ok`になることを確認します。これは設定の有無だけを検査し、Googleでのログイン成功を保証しません。

## 接続と実データの確認

OAuthとStreamable HTTPに対応するMCPクライアントで、上記MCP URLへ接続します。MCPのクライアント登録・PKCE・トークン発行はWorkerが処理します。GoogleのOAuthクライアントIDはMCPクライアント側には入力しません。

1. クライアントの接続許可画面で、開始したアプリ名と返送先を確認します。
2. 許可した本人のGoogleアカウントでログインし、Classroomの両方の読み取り権限を許可します。
3. `tools/list`で5つの読み取りツールが表示されることを確認します。
4. `list_courses`で本人の授業を確認します。実授業一覧をClassroomの画面と照合します。
5. 授業IDを指定し、`list_assignments`と`list_my_submissions`を確認します。日時はUTCで返されるため、クライアント側で日本時間へ表示変換します。
6. `list_due_assignments`の`incomplete`と`warnings`を確認します。`UNKNOWN`の提出状態を未提出と断定しないでください。
7. MCPクライアントを再起動して接続を確認し、アクセストークン期限後に更新が成功することを確認します。Googleで許可を取り消した後は再接続が必要です。

資格情報を使ったこの確認は、Googleの設定後に行います。モックテストだけを実Google・学校管理ポリシー・MCPクライアントの互換性の証明として扱いません。

## 実装と検証の境界

OAuth ProviderがKV内のGoogle認証情報を暗号化します。Google更新トークンは暗号化されたgrantだけに入り、MCPアクセストークン用propsから除外します。MCP側はGoogleのトークンそのものを受け取りません。OAuthのブラウザー状態・同意画面、PKCE、resource audience、許可メール、Origin/Hostを検証します。[CloudflareのOAuth構成](https://developers.cloudflare.com/agents/model-context-protocol/protocol/authorization/)

```bash
npm ci
npm run check
npm audit
node scripts/smoke.mjs https://classroom-mcp-25im0047.shotakobayashi-dev.workers.dev --expect-unconfigured
```

Googleの設定後は最後のコマンドから`--expect-unconfigured`を外します。smokeは公開のヘルス・OAuth情報・未認証アクセス拒否を確認し、Googleへの認証や授業へのアクセスは行いません。

SDK v2を2.3.1、SDK v1の推移依存を1.31.0へ統一するoverridesを設定しています。Agents 0.24.0のpeer指定が古い固定版のためです。WranglerとMiniflareも修正版へ更新しています。更新時は`npm ci`、型チェック、workerd統合テスト、auditを再確認してください。overridesを削除する前にAgentsのpeer指定が修正版へ更新されたか確認します。

## 更新・停止

このブランチからの手動デプロイは`npm run check`の成功後に`npm run deploy`を実行します。KVは毎回同じIDを使います。CIはチェック専用であり、自動デプロイやGitHubへのCloudflare APIトークン保存は設定していません。

接続を取り消す場合はMCPクライアント側で削除し、[Googleの接続管理](https://myaccount.google.com/connections)でもアクセスを取り消します。即時停止が必要な場合は専用Workerを無効化・削除します。KV削除はすべての接続を失わせるため、専用Namespaceであることを確認してください。

観測ログは無効のままです。コードは認証コード、Secret、トークン、上流の詳細エラーをログに出しません。ログ設定を変更する場合は、callbackのクエリ文字列やAuthorizationヘッダーが記録されないことを確認してください。

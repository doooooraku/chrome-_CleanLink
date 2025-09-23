# 注意
本ドキュメントは、あなたが提供した **「ソフトウェア開発工程管理.md」** のテンプレとゲート条件に準拠して作成しています。
- 参照: 工程とレビューゲート（S0→S1→S2→C1→T→R）、成果物テンプレ、Gateチェック（S0/S1/S2）。
- 目的: CodexCLIに渡して、そのまま実装・審査・テストに使える粒度に落とし込むこと。

---

# 詳細設計書（CleanLink Mini）

## 用語（かんたん定義）
- **MOD**: モジュール。責務が明確な単位で分割したコードブロック。
- **IndexedDB / chrome.storage.local**: ローカルデータ保存先。永続／設定など用途ごとに使い分ける。
- **optional permissions**: 利用中に追加で権限を求める Chrome の仕組み。

## 1. アーキテクチャ (MOD)
| MOD-ID | 名称 | 実装 | 責務 / 入出力 / 例外 |
|---|---|---|---|
| MOD-01 | Content Script Controller | `src/content/main.ts` | ページ内 `<a>` 抽出、Before/Afterの差分生成、MutationObserver で差分更新。`SCAN_LINKS`, `CLEAN_LINKS`, `BULK_CLEAN` メッセージを受信し DOM を更新。例外時は Original URL を保持し UI に通知。 |
| MOD-02 | Service Worker (Background) | `src/background/index.ts` | メッセージハブ。短縮URL展開 (HEAD→GET フォールバック, 同時5, タイムアウト2s, 再試行1回)、CSV生成、ライセンス署名検証、diagnostics ログ管理。例外は `errorCode` により分類しクライアントへ返却。 |
| MOD-03 | UI (Popup / Options / History) | `src/ui/**` | React/Vue (Vite) で実装予定。state 管理に Zustand (軽量) を使用。Service Worker とポート接続しリアルタイム更新。アクセスビリティ属性に準拠。 |
| MOD-04 | Rules Engine | `src/libs/rules.ts` | 追跡パラメータの削除ロジック。`URL` オブジェクト操作で安全に加工。ホワイトリスト (`safeKeys`) とドメイン別例外を保持。 |
| MOD-05 | Persistence Layer | `src/libs/storage.ts` | chrome.storage.local と IndexedDB の薄いラッパー。バージョニング (`schemaVersion`) とマイグレーションを管理。 |
| MOD-06 | Licensing | `src/libs/license.ts` | 公開鍵で Ed25519 署名検証。検証済みライセンスを storage に保存し 24h 毎に再検証。期限切れや改竄を検出。 |

### 1.1 メッセージ・イベントフロー
1. Popup 起動 → Service Worker に `SCAN_LINKS` を送信。
2. Service Worker → Content script に `SCAN_LINKS` を転送し、リンク一覧を取得。
3. ユーザー操作 (Clean) → `CLEAN_LINKS` メッセージで Rules Engine を実行。
4. Bulk Clean → Service Worker が CSV を生成し `downloads.download` で保存。
5. Expand short URLs → Service Worker が `fetch` (HEAD→GET) で解決。
6. 結果は Popup/Options へ `CleanLinkResponse` で返却。

### 1.2 シーケンス (短縮展開)
```
Popup → ServiceWorker: EXPAND_SHORT (payload=links)
ServiceWorker → Permissions: ensure optional granted
ServiceWorker → Promise.allSettled(fetches)
fetch → target: HEAD (timeout 2s)
if 301/302 → follow manual redirects up to 5 hops
on success → return final URL
on failure → retry with GET once, else status=timeout
ServiceWorker → Popup: results
```

## 2. データ設計
### 2.1 chrome.storage.local (設定)
| Key | 型 | 説明 | 初期値 | バージョン管理 |
|---|---|---|---|---|
| `settings` | object | UI設定 (`autoClean`, `previewOnly`, `expandShort`) | `{ autoClean: false, previewOnly: false, expandShort: false }` | schemaVersion=1 |
| `siteOverrides` | record<string, 'allow'|'block'> | ドメイン別設定 | `{}` | schemaVersion=1 |
| `license` | object | `{ code, status: 'valid'|'invalid'|'expired', lastChecked }` | `null` | schemaVersion=1 |
| `diagnostics` | array | 直近100件のイベントログ | `[]` | schemaVersion=1 |

### 2.2 IndexedDB (履歴)
- DB 名: `cleanlink-db`
- バージョン: 1
- Object Store: `history`
- インデックス: `ts` (timestamp), `domain`
- スキーマ:
```ts
type HistoryRecord = {
  id: string; // uuid v4
  ts: number;
  original: string;
  cleaned: string;
  final: string; // expand結果
  expanded: boolean;
  bulk: boolean;
};
```
- 保持方針: 最大 1000 件。古い順に削除。設定で 30/60/90 日を切り替え可能。

### 2.3 マイグレーション / ロールバック
- `schemaVersion` を storage に保存。起動時に `schemaVersion` を確認。
- 旧バージョン → 新バージョン移行時はマイグレーション関数を実行。
- ロールバック方針: マイグレーション前に `storage` と IndexedDB を JSON/ZIP でバックアップ (ローカル)。バージョン差異が大きい場合はバックアップから復元手順 (Options → Logs & Support → Restore Backup) を提供。

## 3. セキュリティ設計
- **ライセンス検証**: Ed25519 公開鍵を同梱。ライセンスコードは `payload.signature` 形式。期限 (exp) と email ハッシュを含む。検証に失敗した場合は Pro 機能をロックし、Options にエラー表示。
- **権限管理**: Manifest には `activeTab`, `scripting`, `storage`, `downloads` を記載。`host_permissions` は空。`expandShort` 有効時のみ `https://*/*` `http://*/*` を optional permissions で要求。
- **CSP**: すべての UI は bundler (Vite) で生成した静的ファイルを参照し、`eval` 禁止。`<script>` タグへの inline 記述なし。
- **依存性管理**: `pnpm` + `pnpm-lock.yaml` を使用し、`pnpm audit` と `npm audit` を CI で実行。Critical/High = 0 が目標。

## 4. パフォーマンス設計
- MutationObserver は 500ms デバウンス + 最大 2000リンクまで一括処理。超過時はプレビューのみ。
- 追跡除去は URL API を使用し O(n) (n=クエリ数)。
- 短縮展開は Promise race で 2 秒タイムアウト。失敗時はまとめて UI に反映。
- CSV 生成は Web Worker (OffscreenDoc) を検討（1000リンク以上でフリーズしないよう分割）。初期実装では同期生成 + ベンチ結果で判断。

## 5. ログ / 観測
- `diagnostics.log` (ローカルのみ) に以下を記録: timestamp, event, payload サマリ, duration, errorCode。
- UI から「Download diagnostics」ボタンで JSON を取得可能。
- 外部送信は一切なし。ユーザーがサポート依頼時に添付する想定。

## 6. テスト設計
### 6.1 レベルと担当
| レベル | 目的 | 主担当 | 成果物 |
|---|---|---|---|
| 単体 (UT) | Rules Engine, Storage ラッパー | Dev | Vitest レポート |
| 結合 (IT) | content ↔ service worker ↔ UI | Dev/QA | Vitest + Playwright |
| E2E | 実ブラウザでの振る舞い | QA | Playwright シナリオ |
| パフォーマンス | 100リンク一括処理 | QA | Lighthouse / custom script |
| アクセシビリティ | Popup/Options を検査 | QA | Axe レポート |

### 6.2 テストケース (抜粋)
| TC-ID | 対象 | 観点 | 期待 |
|---|---|---|---|
| TC-101 | MOD-04 | utm/fbclid 削除 | `utm_*` 削除、`id` は保持、処理 < 5ms/リンク |
| TC-201 | MOD-01+04 | 100リンク一括 | p95 < 300ms、p99 < 800ms、UI がフリーズしない |
| TC-301 | MOD-02 | 短縮展開 | 301/302 を最大5回追跡し最終URLを返す。タイムアウト時は `timeout` ステータス |
| TC-401 | MOD-03 | 権限拒否時 UI | optional permission 拒否 → トースト + expandShort false |
| TC-501 | MOD-03 | アクセシビリティ | Tab 操作で全ボタンにアクセスでき、スクリーンリーダーが状態を読み上げる |
| TC-601 | MOD-02 | CSV 書き込み失敗 | downloads API 拒否でエラーメッセージ表示 |
| TC-701 | MOD-06 | ライセンス検証 | 正常/改竄/期限切れの3ケースで状態が変化 |

### 6.3 自動テストフレームワーク
- Unit: Vitest + @testing-library/dom
- Integration: Vitest (jsdom) + mocks
- E2E: Playwright (Chromium, persistent context with extension)
- Lint/Format: ESLint, Prettier, stylelint (css)
- アクセシビリティ: Axe-core (Playwright plugin)

## 7. トレーサビリティ
| REQ | FEAT | MOD | TC |
|---|---|---|---|
| REQ-101 | FEAT-01 | MOD-01, MOD-04 | TC-101, TC-201 |
| REQ-102 | FEAT-02,04 | MOD-01, MOD-02, MOD-05 | TC-201, TC-601 |
| REQ-103 | FEAT-03 | MOD-02, MOD-06 | TC-301, TC-701 |
| REQ-104 | FEAT-01〜06 | MOD-01〜06 | TC-401, TC-501 |

## 8. 運用・リリース
- 配布: Chrome Web Store (英語ストア説明 + アイコン + スクリーンショット 3 枚)。
- 価格: USD 4.90 (買い切り)。 Web Store の決済レポートを月次で確認。
- リリースロールアウト: 段階的公開 (10% → 50% → 100%) を想定。問題が発生した場合は即座に前バージョンを再公開。
- サポート: support@cleanlink.app (仮)。FAQ とログ取得手順を Options に記載。

## 9. セキュリティ / 法務
- 依存ライブラリのライセンス一覧を `docs/licenses.md` に生成。
- サードパーティコードは MIT/BSD/Apache2 のみ許容。GPL 系は不可。
- プライバシーポリシー (英語) を Web Store 用に更新。収集ゼロと明記。

## 10. Gate S2 チェック
- `REQ⇄MOD⇄TC` の対応表を作成済み。
- マイグレーション / バックアップ / ロールバック手順を定義済み。
- 依存管理と脆弱性ゼロ方針を明記。
- optional permissions やライセンス検証などセキュリティ要求をドキュメント化済み。

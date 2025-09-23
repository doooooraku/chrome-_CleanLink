# 注意
本ドキュメントは、あなたが提供した **「ソフトウェア開発工程管理.md」** のテンプレとゲート条件に準拠して作成しています。
- 参照: 工程とレビューゲート（S0→S1→S2→C1→T→R）、成果物テンプレ、Gateチェック（S0/S1/S2）。
- 目的: CodexCLIに渡して、そのまま実装・審査・テストに使える粒度に落とし込むこと。

---

# 機能設計書（CleanLink Mini）

## 用語（かんたん定義）
- **外部仕様**: ユーザーが目にする画面・操作・振る舞い。
- **UIステート**: Loading / Empty / Success / Error などの状態表現。
- **Optional permission**: 利用中に追加で許可を求める Chrome 標準の権限要求。

## 1. 機能一覧 (FEAT) と対応
| FEAT-ID | 機能 | 対応REQ | 優先 | 備考 |
|---|---|---|---|---|
| FEAT-01 | 手動クリーン (現在タブのURLを整形) | REQ-101, REQ-104 | Must | 無料。UI の中心機能。
| FEAT-02 | 一括クリーン＋CSV出力 | REQ-102 | Must | Pro。リンク置換とCSV保存。
| FEAT-03 | 短縮URL展開 | REQ-103 | Should | Pro。optional permissions を使用。
| FEAT-04 | 履歴／CSVログ閲覧 | REQ-102, REQ-104 | Should | Pro。IndexedDB 保存。
| FEAT-05 | サイト別 ON/OFF / 除外 | REQ-101, REQ-102 | Should | 無料機能。Options に配置。
| FEAT-06 | キーボードショートカット | REQ-101 | Could | 初回は Alt+Shift+C（Clean）を割当て。変更可。

## 2. ユーザーストーリー (受入基準付き)
- **US-01 SNS投稿者として** Clean ボタンでリンクを整えたい。
  - Then Popup に Before/After が表示され、Copy Clean で短縮済みURLがコピーされる。
- **US-02 CS担当として** 10件リンクを一括で処理し CSV で保存したい。
  - Then Bulk Clean 実行後に 3列構成の CSV がダウンロードされる。
- **US-03 プライバシー重視ユーザーとして** 端末内で完結する拡張を使いたい。
  - Then ネットワークが無い状態でもエラーにならず、短縮展開は「オフライン」表示でスキップされる。
- **US-04 Pro 利用者として** 短縮URLの最終遷移先が分からないと不安。
  - Then Expand short URLs をオンにすると 2 秒以内に最終URLが表示され、optional permission 未許可時は理由と許可ボタンが表示される。

## 3. 画面 / UI 設計
### 3.1 Popup
```
┌─────────────────────────┐
│ Clean (Primary button)     │ Preview only (ghost) │
├─────────────────────────┤
│ Before / After テーブル                       │
│ [Original URL]  -> [Cleaned URL]              │
│ [Copy Original] [Copy Clean] [Open]           │
├─────────────────────────┤
│ Pro Section (表示条件: Pro有効)               │
│ [Toggle] Auto-clean in this tab               │
│ [Toggle] Expand short URLs (requires permission) │
│ [Button] Request permission (disabled when granted) │
│ [Button] Export CSV                           │
│ [Button] History                              │
└─────────────────────────┘
```
- **状態**
  - Loading: スピナー + 「Scanning links...」
  - Empty: アイコン + 「No links found on this page. Try another page.」
  - Error (権限なし): 権限説明と「Grant permission」ボタン。状態復帰で自動再試行。
  - Offline: トーストで「Network is offline. Expand short URLs is paused.」。

### 3.2 Options ページ構成
1. **General**
   - Auto-clean default (per tab)
   - Default mode (Clean / Preview only)
2. **Per-site settings**
   - ドメインごとの ON/OFF、除外一覧
3. **Rules**
   - 削除カテゴリ（Advertising, Analytics, Social, Custom）をトグル。
   - カスタム削除キー追加 (正規表現含む)
4. **License**
   - Pro コード入力フォーム・検証結果表示。
   - 署名検証の結果 (Valid / Invalid / Expired)。
5. **Logs & Support**
   - 自己診断ログのローカル保存／ダウンロード
   - 14日返金ポリシー説明・メールリンク

### 3.3 History モーダル (Pro)
- テーブル列: Timestamp / Original / Cleaned / Final / Expanded?
- レコード最大 1000件 (古いものから削除)。
- 検索フィールドと CSV エクスポートボタン。

### 3.4 キーボード操作
- Popup 内の操作は Tab / Shift+Tab で移動。
- Enter でプライマリボタン実行。Esc で閉じる。
- アクセシビリティ: `aria-live` を使って処理結果を通知。

## 4. インタラクション設計
| No. | トリガー | 主要遷移 | 説明 |
|---|---|---|---|
| INT-01 | ツールバーアイコンをクリック | Popup: Loading → （成功/Empty/Error） | content script にメッセージを送り、リンク一覧を取得。
| INT-02 | Clean ボタン | Popup: Processing → Result | 取得したリンクをクリーン化。成功時はトーストで「Copied cleaned link」。
| INT-03 | Bulk Clean ボタン | Popup → CSV ダウンロード | Pro 判定後に content script へ「bulk-clean」イベントを送信。
| INT-04 | Expand short URLs トグル | Popup: Permission モーダル | 権限未許可時は Chrome API で `chrome.permissions.request` を呼ぶ。
| INT-05 | Options 更新 | storage update → content script broadcast | `chrome.storage.onChanged` で設定を反映。

## 5. メッセージ / API 契約
### 5.1 Runtime メッセージフォーマット
```ts
// 拡張内部メッセージ (Manifest V3, type: module)
interface CleanLinkMessage {
  kind: 'SCAN_LINKS' | 'CLEAN_LINKS' | 'BULK_CLEAN' | 'EXPAND_SHORT' | 'GET_HISTORY' | 'SET_HISTORY';
  payload?: Record<string, unknown>;
}

interface CleanLinkResponse {
  ok: boolean;
  data?: unknown;
  errorCode?: 'PERMISSION_DENIED' | 'TIMEOUT' | 'NETWORK' | 'VALIDATION';
  message?: string;
}
```
- `SCAN_LINKS` → `{ links: Array<LinkSnapshot> }`
- `CLEAN_LINKS` → `{ before: string; after: string; diff: string[] }`
- `BULK_CLEAN` → `{ csv: string }`
- `EXPAND_SHORT` → `{ original: string; final: string; status: 'resolved' | 'timeout' }`

### 5.2 Optional Permissions Flow
1. Expand short URLs トグルが ON → service worker から `chrome.permissions.contains` を確認。
2. 未許可なら説明モーダルを表示し、ユーザーが「Grant」ボタンを押すと `permissions.request` を実行。
3. 許可成功で設定を更新し、content script へブロードキャスト。
4. 拒否時は `expandShort` を false に戻し、トーストで理由を説明。

## 6. 異常時のふるまい
| ケース | 表示 | ログ | ユーザー操作 |
|---|---|---|---|
| ネットワーク断 | 「Network offline. Some features paused.」 | `diagnostics.log` に `offline=true` | Retry ボタンなし。待機のみ。 |
| 権限拒否 | 「Permission required to expand short URLs」 | `errorCode=PERMISSION_DENIED` | Grant ボタンで再申請。 |
| 解析失敗 | Before/After 行に「Could not clean. Copied original URL.」 | `errorCode=VALIDATION` | Copy Original ボタン活性化。 |
| CSV 書き込み失敗 | トースト「Failed to save CSV. Check download permissions.」 | `errorCode=IO_ERROR` | Chrome 設定の確認手順を提示。 |

## 7. アクセシビリティ / UX ガイドライン
- 主要ボタンは 44px 以上のタップ領域。
- 色コントラストは 4.5:1 以上。
- 画面更新時は `aria-live="polite"` を利用しスクリーンリーダーに結果を通知。
- すべてのアイコンに `aria-label` を設定しテキストで意味を補足。

## 8. テスト観点へのリンク
- UI 状態は Storybook (後続) で全ステートを表示。
- Playwright で Popup / Options / Permission モーダルの回帰テストを実施予定。
- Axe-core によるアクセシビリティ自動検査を CI に組み込む。

## 9. Gate S1 チェック
- すべての FEAT に対応する受入基準と異常系を記載。
- UI ステート・メッセージ仕様・Optional permission フローを定義。
- アクセシビリティの数値基準 (WCAG 2.2 AA) と検証方法を明記。
- 次工程 (S2) で利用するメッセージスキーマを提示済み。

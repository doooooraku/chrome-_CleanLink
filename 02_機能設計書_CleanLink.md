# 注意
本ドキュメントは、あなたが提供した **「ソフトウェア開発工程管理.md」** のテンプレとゲート条件に準拠しています。
- 参照: 工程とレビューゲート（S0→S1→S2→C1→T→R）、成果物テンプレ、Gateチェック（S0/S1/S2）。
- 目的: CodexCLIに渡して、そのまま実装・審査・テストに使える粒度に落とし込むこと。

---

# 機能設計書（CleanLink Mini v0.4）

## 用語（かんたん定義）
- **外部仕様**: ユーザーが目にする画面・操作・振る舞い。
- **UIステート**: Loading / Empty / Success / Error などの状態表現。
- **Result Summary**: `Detected / Changed / Ignored` のカウンタ表示。
- **ヒストリーノート**: 履歴に保存する `notes` フィールド。`skipped-sensitive` など原因を記録。

## 1. 機能一覧 (FEAT) と対応
| FEAT-ID | 機能 | 対応REQ | 優先 | 備考 |
|---|---|---|---|---|
| FEAT-11 | Popup クリーン（Clean / Copy / Clean & Copy） | REQ-201, 202 | Must | 無料。Result Summary と人間語エラーを表示。
| FEAT-12 | 履歴ビュー（Before/After/Expanded） | REQ-203 | Must | 無料。クリックでコピー + トースト。
| FEAT-13 | 短縮URL展開（Pro） | REQ-204 | Should | optional permissions を取得済み前提。timeout 2.5s。
| FEAT-14 | 安全除外 + サイト単位自動クリーン | REQ-201,205 | Must | login/auth/payment/account を既定除外。
| FEAT-15 | Pro 管理（ライセンス入力と状態表示） | REQ-204 | Should | 署名検証。Invalid 時は Pro UI 無効化。
| FEAT-16 | CSV エクスポート（Pro） | REQ-204 | Could | MVP は背景処理のみ。UI に `Export CSV` ボタン。

## 2. ユーザーストーリー (受入基準付き)
- **US-11 SNS投稿者として** Clean ボタンでリンクを整えたい。
  - Then Result Summary に変更数が表示され、必要なら Copy cleaned URLs で即コピーできる。
- **US-12 業務ユーザーとして** 履歴から再利用したい。
  - Then History で Before/After を見比べ、After をクリックするとコピーされる。
- **US-13 Pro ユーザーとして** 短縮URLの最終遷移先を確認したい。
  - Then Expand short URLs をオンにすると 2.5 秒以内に Final 列へ表示される。
- **US-14 プライバシー重視ユーザーとして** 安全除外が効いているか確かめたい。
  - Then login/payments を含む URL は Ignored にカウントされ、履歴 notes に理由が残る。

## 3. 画面 / UI 設計
### 3.1 Popup
```
┌────────────────────────────┐
│ CleanLink Mini                         │
│ Detected 25 | Changed 18 | Ignored 7   │ ← Result Summary (aria-live="polite")
│ [Clean] [Copy cleaned URLs] [Clean & Copy ⇧C]
│ -------------------------------------- │
│ Error state (when applicable)          │
│ -------------------------------------- │
│ Toggles                                │
│  ☐ Auto-clean this site                │
│  ☐ Expand short URLs (Pro)             │
│ Links                                  │
│  • Open History                        │
│  • Open Settings                       │
└────────────────────────────┘
```
- **状態**
  - Loading: スピナー + 「Scanning links…」
  - Empty: アイコン + 「No links found on this page. Try another website.」
  - Error (非対象ページ): 「This page can’t be cleaned. Open a regular website.」
  - Offline: トースト「You are offline. Short URL expansion is paused.」

### 3.2 History (独立ページ)
- テーブル列: `Time | Before (Original) | After (Final) | Expanded | Notes | Actions`
- After セル: ホバーでツールチップ「Click to copy」、クリックでコピー＆右下トースト (1.2s)。
- 1000件まで保持。レスポンシブ: 768px 未満でカード表示。
- フィルタ: 今回は v0.3 で未実装（次期候補）。

### 3.3 Options ページ
1. **General**
   - Auto-clean default (全体)
   - Expand short URLs (Pro 切替時は optional permission チェック)
   - Delete history ボタン
2. **Site rules**
   - Domain + mode (`always-clean` / `skip`)
3. **Rules library**
   - `rules.json` へのリンク + 更新方法説明
4. **License**
   - ライセンス入力 + Verify ボタン。結果 (valid/invalid/expired) をカラー表示。
5. **Support**
   - Diagnostics download、Privacy/Terms、Refund ポリシー導線

### 3.4 キーボード / ショートカット
- Popup 内は Tab / Shift+Tab、Enter でフォーカス中ボタン。
- `Ctrl+Shift+K` (Windows) / `Cmd+Shift+K` (macOS) を Clean & Copy に割当。
- `Esc` で Popup を閉じる。

## 4. インタラクション設計
| No. | トリガー | 主要遷移 | 説明 |
|---|---|---|---|
| INT-11 | Popup 表示 | Loading → Result/Empty/Error | Background が `SCAN_CURRENT` を発行し、Result Summary を更新。
| INT-12 | Clean ボタン | Result → Updated | `CLEAN_CURRENT` で DOM 書き換え + 履歴保存。
| INT-13 | Copy cleaned URLs | Result → Toast | 直近 Clean 結果を整列＆コピー。成功トーストを表示。
| INT-14 | Clean & Copy | Clean + Copy を連続実行。ショートカット対応。
| INT-15 | Expand short URLs ON | Permission 確認 → 状態更新 | 未許可で `chrome.permissions.request` を呼ぶ。拒否時は false に戻しエラー表示。
| INT-16 | History After クリック | Clipboard | `navigator.clipboard.writeText` + Toast。
| INT-17 | 非対象ページ (chrome:// 等) | Error | Background で判定しエラーメッセージ返却。

## 5. メッセージ / API 契約
```ts
// runtime messages
interface RuntimeMessageMap {
  SCAN_CURRENT: void;
  CLEAN_CURRENT: void;
  COPY_CLEANED: void;     // Popup 内部で使用（background経由で履歴保存のみ）
  OPEN_HISTORY: void;
  UPDATE_SETTINGS: Partial<Settings>;
  VERIFY_LICENSE: { code: string };
}

interface CleanLinkResponse<T = unknown> {
  ok: boolean;
  data?: T;
  errorCode?: 'PERMISSION_DENIED' | 'TIMEOUT' | 'NETWORK' | 'VALIDATION' | 'UNSUPPORTED_PAGE';
  message?: string;
}

interface ScanResultSummary {
  links: LinkScanResult[];
  summary: { detected: number; changed: number; ignored: number };
  nonCleanableReason?: 'unsupported_scheme' | 'no_links';
}
```
- 背景で `UNSUPPORTED_PAGE` を返すケース: `chrome://`, `edge://`, `about:`, `chrome-extension://`。
- Copy 要求は Popup 内でのみ実行し、background は履歴保存のみ行う。

## 6. 異常時のふるまい
| ケース | UI | ログ | ユーザー操作 |
|---|---|---|---|
| 非対象ページ | 「This page can’t be cleaned. Open a regular website.」 | `errorCode=UNSUPPORTED_PAGE` | History を開く導線を表示 |
| ネット断 | トースト + expandShort false | `errorCode=NETWORK`, notes=`offline` | 再試行ボタンなし、接続回復待ち |
| 短縮展開タイムアウト | Result Summary は Changed に含めず、Notes=`expand-timeout` | `errorCode=TIMEOUT` | トースト「Kept as-is (timeout)」 |
| Clipboard 失敗 | トースト「Couldn’t copy. Allow clipboard access.」 | `errorCode=PERMISSION_DENIED` | Chrome 設定を案内するリンク |
| CSV ダウンロード拒否 | トースト「Failed to save CSV. Check download permissions.」 | `errorCode=IO_ERROR` | Options に手順リンク |

## 7. アクセシビリティ / UX ガイドライン
- ボタン/リンクは 44px 以上。
- `aria-live="polite"` で Result Summary、`aria-live="assertive"` でエラー。
- トーストは 4.5:1 のコントラストと `role="status"` を付与。
- History テーブルは `<caption>` 付き。レスポンシブ時は `<dl>` 形式へ変換。

## 8. テスト観点へのリンク
- Playwright: Popup Clean/Copy/Shortcut、History Copy、Options License、Permission フロー。
- Vitest: Rules Engine、Safety Skip、History マイグレーション、License 検証。
- Axe-core: Popup/History/Options を検査。
- Performance script: 100リンク HTML をフィクスチャ化。

## 9. Gate S1 チェック
- すべての FEAT に対応する受入基準と異常系を記載。
- UI 状態（Loading/Empty/Error/Result/Offline）を明文化。
- メッセージ契約とエラーコード `UNSUPPORTED_PAGE` を追加。
- アクセシビリティ要件 (WCAG 2.2 AA) を具体値で記載済み。

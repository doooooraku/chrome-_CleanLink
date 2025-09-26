---
id: CLN-TST-20250922
spec: ../..//01_基本仕様書_CleanLink.md
design: ../..//02_機能設計書_CleanLink.md
detail: ../..//03_詳細設計書_CleanLinki.md
last_updated: 2025-09-25
qa_owner: qa_lead
status: approved
---

# CleanLink Mini テスト計画 (Gate T 用)

## 1. 目的
- REQ-201〜205 を自動テストと手動テストで検証し、Result Summary / History / Pro 機能の品質を保証する。
- 性能・アクセシビリティ・エラーハンドリングの定量基準を満たす。

## 2. テスト範囲
| レベル | 範囲 | 除外 |
|---|---|---|
| 単体 | Rules Engine, Sensitive Skip, Summary 計算, License | UI レイアウト (Storybook で個別確認予定) |
| 結合 | background ↔ content ↔ storage | Chrome Sync |
| E2E | Popup Clean/Copy、History Copy、Options License、Permission フロー | Web Store 決済 (手動テスト) |
| 性能 | 10/50/100リンクの処理時間 | 1000リンク超 (別イテレーション) |
| アクセシビリティ | Popup, History, Options | CSV エクスポート画面 (次期) |

## 3. 入口条件
- Gate S2 承認済み、main 最新へ rebase 済み。
- `npm install` 済みで lint/type/unit が全て green。
- `npm run test:e2e` を実行できるブラウザ権限があること（Chromium headless shell のサンドボックスが無効化できること）。現行のCIサンドボックスでは `--no-sandbox` でも起動不可のため、ローカル確認か別runnerでの実行が必要。
- Playwright 用フィクスチャ (100リンク HTML、bit.ly モック) を `tests/fixtures` に配置。

## 4. 出口条件
- 必須テストケース合格率 100%。
- 重大度 P0/P1 = 0。P2 以下は Issue 登録 + リスク承認。
- カバレッジ statement/branch ≥ 80%、Rules Engine ≥ 95%。
- 100リンク処理 p95 < 200ms、p99 < 600ms。
- Axe-core の重大問題 0 件。

## 5. テストケース（要約）
| ID | 観点 | 入力 | 期待 |
|---|---|---|---|
| TC-211 | 追跡削除 | `https://example.com?utm_source=x&id=1` | `utm_source` 削除、summary.changed=1 |
| TC-212 | 安全除外 | `https://login.example.com?next=/home` | Ignored に加算、notes=`skipped-sensitive` |
| TC-213 | Unsupported page | `chrome://extensions` | エラー文言表示、summary なし |
| TC-221 | Copy cleaned URLs | Clean 後に Copy | クリップボードへ改行区切り、Toast `Copied!` |
| TC-231 | History Copy | 履歴 After クリック | Clipboard success + Toast |
| TC-241 | 短縮展開成功 | bit.ly → example.com | final 更新、expanded=true |
| TC-242 | 短縮展開 timeout | フェッチ 2.5s 超 | expanded=false、notes=`expand-timeout` |
| TC-251 | ライセンス検証 | valid/invalid/expired コード | Status が正しく更新 |
| TC-261 | パフォーマンス | 100リンク HTML | p95 < 200ms を記録 |
| TC-271 | アクセシビリティ | Popup/History/Options | Axe 重大問題 0 件 |

## 6. スケジュール
| 期間 | 活動 |
|---|---|
| Day 1 | 単体・結合テスト実装、フィクスチャ整備 |
| Day 2 | E2E・性能・アクセシビリティ実行、修正 |
| Day 3 | リグレッション、テストサマリ作成、Gate T レビュー |

## 7. リソース / ツール
- QA Lead (主担当)、Dev 1 名が補助。
- ツール: Vitest, Playwright (@playwright/test) + axe-playwright, chrome-cli。
- 環境: macOS 15, Windows 11, Chrome 128。

## 8. リスク
| リスク | 影響 | 対策 |
|---|---|---|
| クリップボード制限で E2E が失敗 | 自動化が止まる | Playwright で `--enable-features=ClipboardAPI` を付与し、手動確認をフォールバック |
| bit.ly テストが不安定 | E2E 再現性低下 | Service Worker にスタブサーバーを用意し、Playwright で intercept |

## 9. レポート
- テスト完了後、`tests/reports/<date>-summary.md` を更新し Gate T issue に添付。
- フィードバックは GitHub Projects (列: In test / Blocked / Done) で管理。

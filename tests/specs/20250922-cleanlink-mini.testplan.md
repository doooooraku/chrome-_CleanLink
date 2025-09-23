---
id: CLN-TST-20250922
spec: ../..//01_基本仕様書_CleanLink.md
design: ../..//02_機能設計書_CleanLink.md
detail: ../..//03_詳細設計書_CleanLinki.md
last_updated: 2025-09-22
qa_owner: qa_lead
status: draft
---

# CleanLink Mini テスト計画

## 1. 目的
- REQ-101〜104 を自動テストと手動テストで検証し、Gate T の基準を満たす。
- 非機能 (性能・アクセシビリティ) を定量的に確認する。

## 2. テスト範囲
| レベル | 範囲 | 除外 |
|---|---|---|
| 単体 | Rules Engine, Storage ラッパー, License 検証 | UI コンポーネント (Storybook で個別確認) |
| 結合 | content ↔ service worker ↔ storage | Chrome Sync (非対応) |
| E2E | Popup 操作、Options 設定、Optional permissions | Web Store 決済 (サンドボックスのみ) |
| 性能 | 10/50/100リンクの処理時間計測 | 1000リンク超の長文ページ (後続検証) |
| アクセシビリティ | Popup, Options | History モーダル (自動検査に含める) |

## 3. テスト入口条件
- Gate S2 承認済み、実装ブランチが main 最新へ rebase 済み。
- `pnpm install` 済みで lint/type/unit が緑。
- テストデータ (短縮URL, 追跡パラメータ付きURL) のフィクスチャを `tests/fixtures` に配置。

## 4. テスト出口条件
- 必須テストケースの合格率 100%。
- 不具合は Severity P0/P1 = 0、P2 以下は Issue 登録済みでリスク承認。
- カバレッジ (statement/branch) ≥ 80%、Rules Engine は 95%。
- パフォーマンス (100リンク) p95 < 300ms、p99 < 800ms。
- Axe-core 自動検査で重大問題 0 件。

## 5. テストケース一覧 (要約)
| ID | 観点 | 入力 | 期待 |
|---|---|---|---|
| TC-101 | 追跡削除 | `https://example.com?a=1&utm_source=x` | 出力=`https://example.com/?a=1` |
| TC-102 | サイト除外 | 除外ドメインで Clean 実行 | 処理スキップ + トースト表示 |
| TC-201 | Bulk 50リンク | 50件のアンカータグ | p95 < 0.25s、CSV が保存される |
| TC-202 | Bulk 200リンク | 200件のアンカータグ | プレビューのみモードへフォールバック |
| TC-301 | 短縮展開成功 | `https://bit.ly/...` | final URL が表示、expanded=true |
| TC-302 | 短縮展開失敗 | TCP timeout | status=timeout、UI に再試行導線 |
| TC-401 | オフラインモード | navigator.onLine=false | 手動 Clean が成功、展開はスキップ |
| TC-402 | 権限拒否 | permissions.request=false | expandShort=false に戻る |
| TC-501 | アクセシビリティ | キーボード操作 | Tab で全操作に到達、aria-live が読み上げ |
| TC-601 | CSV失敗 | downloads API 拒否 | エラーメッセージ表示 + 原因説明 |
| TC-701 | ライセンス検証 | valid/invalid/expired コード | 状態が `valid/invalid/expired` に更新 |

## 6. テストスケジュール (初回リリース)
| 期間 | 活動 |
|---|---|
| Day 1 | 単体・結合テスト、フィクスチャ整備 |
| Day 2 | E2E / 性能テスト、問題修正 |
| Day 3 | リグレッション、アクセシビリティ検査、Gate T レビュー |

## 7. リソース / ツール
- テスト担当: QA Lead (主担当), 開発補助1名
- ツール: Playwright, Vitest, pnpm, axe-playwright, chrome-cli (拡張読み込み用)
- 環境: macOS Ventura, Windows 11, Chrome 128 Stable

## 8. リスク
| リスク | 影響 | 対応 |
|---|---|---|
| Playwright で optional permission が再現できない | E2E カバレッジ低下 | 手動手順を補完し、スクリーンショットで証跡を残す |
| パフォーマンス測定が CI とローカルで乖離 | 誤判定 | 同一ハード (GitHub Actions) に統一し、閾値にバッファを持たせる |

## 9. レポート
- テスト完了後、`tests/reports/<date>-summary.md` を作成し Gate T issue に添付。
- 失敗ケースは GitHub Project に登録し MTTR を追跡。


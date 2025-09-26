---
id: CLN-SPEC-20250922
related_files:
  - ../..//01_基本仕様書_CleanLink.md
  - ../../ソフトウェア開発工程管理.md
last_updated: 2025-09-25
owner: product
reviewers:
  - tech_lead
  - qa_lead
status: approved
---

# CleanLink Mini 基本仕様サマリ (Gate S0 用)

## KPI ハイライト
| KPI | Baseline | Target | 測定方法 | 頻度 |
|---|---|---|---|---|
| 初回体験率 | 60% | ≥75% | ローカル匿名集計 | 月次 |
| Pro転換率 | 1.5% | 2.5% | Web Store レポート | 月次 |
| 短縮展開利用率 | 未計測 | ≥45% | 履歴 expanded 件数 | 月次 |
| Clean p95 | 0.28s | <0.20s | Playwright + performance API | 週次 |
| 重大不具合 | 0 | 0 | GitHub Issue | 随時 |

## 主要要求 (AC)
- REQ-201: Clean 実行で追跡パラメータ除去 + Summary 表示
- REQ-202: Copy cleaned URLs で一括コピー + トースト
- REQ-203: History の After クリックでコピー
- REQ-204: 短縮URL展開 (2.5s timeout, notes 表示)
- REQ-205: login/auth/payment を含む URL は Ignored として残す

## リスク Top5
1. 削除しすぎ → JSON ルール + サイト除外で制御
2. 短縮展開タイムアウト → 2.5s + 再試行 + 明示メッセージ
3. 権限不可ページ → `UNSUPPORTED_PAGE` エラーメッセージ
4. 履歴漏洩懸念 → 1000件制限 + オプトアウト
5. ライセンス偽造 → 署名検証 + Diagnostics 記録

## 非機能抜粋
- 性能: 100リンク p95 < 200ms
- セキュリティ: Sensitive URL 自動除外、optional permissions 準備
- アクセシビリティ: WCAG 2.2 AA、aria-live で結果通知

## 次アクション
- Gate S0 レビューで承認後、`docs/designs/20250922-cleanlink-mini.design.md`（S1）へ進行。

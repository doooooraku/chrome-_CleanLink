---
id: CLN-SPEC-20250922
related_files:
  - ../..//01_基本仕様書_CleanLink.md
  - ../../ソフトウェア開発工程管理.md
last_updated: 2025-09-22
owner: product
reviewers:
  - tech_lead
  - qa_lead
status: draft
---

# CleanLink Mini 基本仕様書 (短版)

> 正式版は `01_基本仕様書_CleanLink.md` を参照。ゲート審査用に要点を抜粋しています。

## 1. KPI サマリ
| KPI | Baseline | Target | 測定方法 | 頻度 |
|---|---|---|---|---|
| 初回体験率 | 60% | ≥70% | ローカル集計の匿名レポート | 月次 |
| Pro転換率 | 1.5% | 2.0–3.5% | Web Store レポート | 月次 |
| 短縮展開利用率 | 未計測 | ≥40% | ローカル履歴カウント | 月次 |
| Bulk p95 | 0.45s | <0.30s | 自動計測 (Playwright) | 週次 |
| 重大不具合 | 0 | 0 | GitHub Issue | 随時 |

## 2. 主要要求 (AC)
- REQ-101: 手動クリーン (差分表示 + Copy Clean)
- REQ-102: 一括クリーン + CSV (Pro)
- REQ-103: 短縮URL展開 (optional permission)
- REQ-104: 完全ローカル完結 (オフライン可)

## 3. リスク Top5
1. 削除しすぎ → ホワイトリストとサイト別除外
2. 短縮展開の不信 → optional permission + logging
3. 権限拒否 → UI で再許可導線
4. 価格不満 → 14日返金 + 機能比較
5. 海賊版 → 署名検証 + 低価格

## 4. 非機能 (抜粋)
- 性能: 100リンク p95 < 300ms / p99 < 800ms
- セキュリティ: optional permissions のみ、外部API禁止
- アクセシビリティ: WCAG 2.2 AA

## 5. 次アクション
- Gate S0 レビューで承認後、機能設計書 (`docs/designs/20250922-cleanlink-mini.design.md`) に進む。

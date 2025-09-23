---
id: CLN-DES-20250922
related_files:
  - ../..//02_機能設計書_CleanLink.md
last_updated: 2025-09-22
owner: tech_lead
reviewers:
  - qa_lead
  - ux
status: draft
---

# CleanLink Mini 機能設計書 (短版)

> 詳細は `02_機能設計書_CleanLink.md` を参照。ゲート S1 審査用に要約しています。

## FEAT / REQ 対応
| FEAT | 概要 | REQ |
|---|---|---|
| FEAT-01 | 手動クリーン (無料) | REQ-101, 104 |
| FEAT-02 | 一括クリーン + CSV (Pro) | REQ-102 |
| FEAT-03 | 短縮展開 (optional permissions) | REQ-103 |
| FEAT-04 | 履歴、CSVログ | REQ-102 |
| FEAT-05 | サイト別ON/OFF | REQ-101 |

## 主要 UI 状態
- Popup: Loading / Empty / Result / Error / Offline
- Options: General, Per-site, Rules, License, Logs & Support
- History: Table + CSV export

## メッセージ契約
```ts
interface CleanLinkMessage {
  kind: 'SCAN_LINKS' | 'CLEAN_LINKS' | 'BULK_CLEAN' | 'EXPAND_SHORT';
  payload?: Record<string, unknown>;
}
```
- `errorCode`: `PERMISSION_DENIED`, `TIMEOUT`, `NETWORK`, `VALIDATION`

## 異常系
| ケース | UI | 回復 |
|---|---|---|
| 権限拒否 | モーダル + Grant ボタン | 再申請 |
| ネット断 | トーストで通知 | 待機 |
| 解析失敗 | Original をコピー導線 | 手動対応 |

## アクセシビリティ
- 44px 以上のボタンサイズ
- aria-live で結果読み上げ
- Tab 移動可能、Esc で閉じる

## テスト連携
- Playwright で Popup/Options/Permission の E2E
- Axe-core 自動検査

## 次アクション
- 詳細設計 (`docs/specs/...`??) へ引き継ぎ。

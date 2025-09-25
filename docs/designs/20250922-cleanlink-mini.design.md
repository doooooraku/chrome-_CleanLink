---
id: CLN-DES-20250922
related_files:
  - ../..//02_機能設計書_CleanLink.md
last_updated: 2025-09-25
owner: tech_lead
reviewers:
  - qa_lead
  - ux
status: in_review
---

# CleanLink Mini 機能設計サマリ (Gate S1 用)

## FEAT / REQ 対応
| FEAT | 概要 | REQ |
|---|---|---|
| FEAT-11 | Popup Clean/Copy/Shortcut + Summary | REQ-201, 202 |
| FEAT-12 | History Before/After/Notes + Copy | REQ-203 |
| FEAT-13 | 短縮展開 (timeout 2.5s) | REQ-204 |
| FEAT-14 | 安全除外 + 自動クリーン | REQ-205 |
| FEAT-15 | Pro ライセンス UI | REQ-204 |

## UI ステート
- Popup: Loading / Empty / Result / Error / Offline
- History: Table + Responsive cards, Toast copy
- Options: General / Site rules / Rules library / License / Support

## メッセージ契約 (抜粋)
```ts
interface CleanLinkResponse<T> {
  ok: boolean;
  data?: T;
  errorCode?: 'PERMISSION_DENIED' | 'TIMEOUT' | 'NETWORK' | 'VALIDATION' | 'UNSUPPORTED_PAGE';
}

interface ScanResultSummary {
  summary: {
    detected: number;
    changed: number;
    ignored: number;
  };
}
```

## 異常系
| ケース | UI | 回復 |
|---|---|---|
| Unsupported page | 「This page can’t be cleaned.」＋History導線 | 別ページへ移動 |
| Clipboard 拒否 | トースト + ヘルプリンク | ブラウザ設定を案内 |
| Permission 拒否 | トースト + トグルを false に戻す | Options から再申請 |

## アクセシビリティ
- aria-live：Summary=polite、Error=assertive
- Tab 操作で全コンポーネントへアクセス可
- ボタン/リンクのコントラスト ≥4.5:1

## テスト連携
- Playwright: Popup Clean/Copy、History Copy、Options License
- Axe-core: Popup/History/Options
- Performance: 100リンクフィクスチャによる p95 計測

## 次アクション
- 詳細設計 (`03_詳細設計書_CleanLinki.md`) を Gate S2 レビューへ提出。

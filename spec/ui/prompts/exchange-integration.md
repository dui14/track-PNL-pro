# UI Prompt: Exchange Integration

## Context

Luồng kết nối và quản lý exchange API keys. UI xuất hiện ở nhiều entrypoints: modal khi onboarding, modal từ profile/exchanges tab, và empty state của dashboard. Đây là critical flow — security messaging phải rõ ràng, UX càng friction-free càng tốt.

## Design Direction

- Modal-first: toàn bộ connect flow trong Dialog overlay
- Multi-step wizard với progress indicator rõ ràng
- Exchange branding: mỗi sàn có màu đặc trưng
- Security cues: icon + text nhắc nhở read-only keys ở mọi bước nhập key
- Status management: clear visual states cho connected / inactive / error

## Exchange Brand Colors

| Exchange | Primary Color | Logo path |
|---|---|---|
| Binance | `yellow-400` | `/images/exchanges/binance.svg` |
| OKX | `blue-400` | `/images/exchanges/okx.svg` |
| Bybit | `orange-400` | `/images/exchanges/bybit.svg` |
| Bitget | `cyan-400` | `/images/exchanges/bitget.svg` |
| MEXC | `purple-400` | `/images/exchanges/mexc.svg` |

## Components

### Connect Exchange Modal

Trigger từ nhiều nơi → đều mở cùng 1 modal component `ConnectExchangeModal`.

**Dialog wrapper**:
- `max-w-lg`, bg `zinc-900`, border `zinc-800`
- Header: "Connect Exchange" + X close button
- Progress steps ở đầu: `1 Select → 2 Enter Keys → 3 Verify`
- Step indicator: circles numbered, active = `emerald-500`, done = `emerald-500` fill + checkmark, future = `zinc-700`

---

**Step 1: Select Exchange**

Content:
- Subheading: "Choose the exchange to connect"
- Grid 2x3 (hoặc 1x5) — exchange option cards:
  - Mỗi card: exchange logo (40px) + exchange name
  - Default: border `zinc-700` bg `zinc-800`
  - Hover: border `zinc-600` bg `zinc-750`
  - Selected: border với exchange brand color, bg tinted, checkmark badge ở góc phải trên
  - Nếu exchange đã được kết nối: mờ 50%, overlay badge "Already connected", không clickable
- Footer: button "Next →" (disabled nếu chưa chọn)

---

**Step 2: Enter API Keys**

Content:
- Exchange logo + name làm mini header trong card
- Security info box (bg `yellow-950` border `yellow-800` rounded-lg p-3):
  - Icon `Shield` `yellow-400`
  - Text: "Only use read-only API keys. Never enable withdrawal or trading permissions."
  - Link "Learn how to create read-only keys →" (external, icon `ExternalLink`)
- Form fields:
  - "API Key" — `Input` icon `Key` bên trái placeholder "Paste your API key"
  - "API Secret" — `Input` icon `KeyRound`, type password (toggle visibility), placeholder "Paste your API secret"
  - "Label" — `Input` icon `Tag`, optional, placeholder "e.g. Main Account, Phone"
- Footer buttons: "← Back" + "Verify & Connect →" (emerald, loading spinner)

---

**Step 3: Verifying**

Auto-run khi vào step 3 sau khi submit step 2:

Loading state:
- Animated spinner `emerald-500` 40px
- Text "Verifying API keys..." (animated dots)
- Sub-steps checklist (animate in sequentially):
  - `Loader2` → `Check` "API credentials valid"
  - `Loader2` → `Check` "Read-only permissions confirmed"
  - `Loader2` → `Check` "Fetching account balance"
  - `Loader2` → `Check` "Saving connection"

Success state:
- Icon `CheckCircle2` `emerald-400` 56px với scale-in animation
- Heading "Exchange Connected!"
- Sub: "{Exchange} account has been linked. Syncing your trade history..."
- Balance preview: "Balance: $12,450.00"
- Button "Go to Dashboard" (emerald) + "Connect another exchange" (outline)

Error state:
- Icon `XCircle` `red-400` 56px
- Heading "Connection Failed"
- Error message: specific per error type:
  - "Invalid API key. Please check and try again."
  - "Insufficient permissions. API key must be read-only."
  - "Network error. Please try again."
- Buttons: "← Try Again" (returns to step 2) + "Cancel"

---

### Exchange Account Card (trong Profile > Exchanges)

*(Đã định nghĩa trong profile-management.md — component tái sử dụng)*

Mở rộng thêm:

**Sync Progress State** (khi đang sync):
- Linear progress bar màu `zinc-700` animate dưới card
- Text: "Syncing... 234 trades found"
- Cancel sync button (nhỏ, text variant)

**Error State Details**:
- Expand button "See error" → inline expanded:
  - Error message: "API key expired. Please update your key."
  - Button "Update API Key" → mở modal edit key
  - Button "Dismiss"

**Last Synced Badge**:
- "Just now" / "5m ago" / "2h ago" / "1 day ago"
- Outdated (> 12h): màu `yellow-400`

---

### Exchange Status Badge Component

Reusable `ExchangeStatusBadge` component:

```
type: 'connected' | 'inactive' | 'error' | 'syncing' | 'pending'
```

- `connected`: emerald dot pulse + "Connected"  
- `inactive`: zinc dot + "Inactive"
- `error`: red dot + "Error"
- `syncing`: spinner + "Syncing..."
- `pending`: yellow dot 

---

### Sync Confirmation Toast

Sau khi trigger manual sync từ exchange card:
- Toast top-right: icon `RefreshCw` spin + "Syncing {Exchange}..."
- Success: `CheckCircle` + "Sync complete. 12 new trades found."
- Error: `AlertCircle` + "Sync failed. Check your API key."

---

### Delete Exchange Confirmation Dialog

Trigger: Trash icon trên exchange card

Dialog content:
- Icon `AlertTriangle` `red-400` 40px
- Heading: "Remove {Exchange} connection?"
- Body: "This will permanently delete:\n• All synced trade history from {Exchange}\n• PNL data linked to this exchange\n• API key credentials"
- Warning highlight: "This action cannot be undone."
- Buttons: "Cancel" + "Remove Exchange" (solid red)
- Loading state: "Removing..."

---

### Empty State — No Exchanges

Full-page empty state khi user vào Dashboard chưa có exchange:
- Container centered, max-w-md, mx-auto, mt-24
- Icon `PlugZap` 80px `zinc-600` (hoặc custom illustration)
- Heading: "Connect your first exchange"
- Body: "Link your Binance, OKX, Bybit, Bitget, or MEXC account to automatically sync your trade history and track your PNL."
- Exchange logos row (5 logos nhỏ 24px, grayscale, căn giữa)
- Button "Connect Exchange →" (emerald, large)

---

## Interactions

- Exchange card select → immediate visual feedback
- Step transitions: slide hoặc fade animation (100ms)
- Verify checklist items: stagger animation 400ms per item
- Paste API key → auto-trim whitespace
- Exchange logo → tooltip với exchange name

## Loading & Error States

- Step 1 → Step 2: instant (client-side)
- Step 2 → Step 3: API call loading
- Verify timeout (10s): "Verification is taking longer than expected. Check your internet connection."
- Duplicate exchange: Step 1 greys out already-connected exchanges

## Component Library

shadcn/ui: `Dialog`, `DialogContent`, `DialogHeader`, `DialogFooter`, `Button`, `Input`, `Badge`, `Progress`, `Toast`, `Alert`, `AlertDescription`, `Tooltip`

Lucide: `Shield`, `Key`, `KeyRound`, `Tag`, `CheckCircle2`, `XCircle`, `AlertTriangle`, `Loader2`, `Check`, `ExternalLink`, `PlugZap`, `RefreshCw`, `Trash2`, `Plus`

## File Structure Target

```
src/
  components/
    features/
      exchange/
        ConnectExchangeModal.tsx
        ExchangeSelectStep.tsx
        ApiKeyFormStep.tsx
        VerifyStep.tsx
        ExchangeAccountCard.tsx
        ExchangeStatusBadge.tsx
        DeleteExchangeDialog.tsx
        NoExchangesEmptyState.tsx
```

# UI Prompt: User Profile Management

## Context

Trang quản lý tài khoản — nơi user cập nhật thông tin cá nhân, đổi mật khẩu, upload avatar, quản lý exchange connections, xem demo account stats, và xóa tài khoản. Layout dạng settings page với tabs navigation.

## Design Direction

- Settings page layout: sidebar tabs bên trái + content bên phải
- Dark theme nhất quán: bg `zinc-950`, cards `zinc-900`, border `zinc-800`
- Clean form styling với clear labels và inline validation
- Destructive actions (delete, disconnect) luôn có visual warning rõ ràng: `red-500`
- Avatar section nổi bật ở đầu trang

## Layout

```
+---------------------+------------------------------------------+
|  App Sidebar        |  Breadcrumb: Profile                     |
|  (shared)           +-------------------+----------------------+
|                     |  Profile Tabs     |  Tab Content         |
|                     |  - General        |                      |
|                     |  - Security       |                      |
|                     |  - Exchanges      |                      |
|                     |  - Demo Account   |                      |
|                     |  - Danger Zone    |                      |
+---------------------+-------------------+----------------------+
```

Desktop: vertical tab list `w-48` bên trái, content chiếm phần còn lại
Mobile: tabs collapse thành horizontal scrollable tabs ở đỉnh content

## Components

### Page Header

- Breadcrumb: "Profile Settings"
- Không có actions ở header (actions trong từng tab)

### Tab Navigation

Vertical list (desktop) / Horizontal scroll (mobile):
- Tab items với icon + label:
  - `UserCircle` General
  - `Lock` Security
  - `Plug` Exchanges
  - `TrendingUp` Demo Account
  - `AlertTriangle` Danger Zone — text `red-400`
- Active tab: bg `zinc-800` border-l `emerald-500` (desktop) / border-b `emerald-500` (mobile)

---

### Tab: General

**Avatar Section**:
- Centered avatar circle `w-24 h-24`
- Avatar image hoặc generated initial (bg `emerald-700` text `emerald-100`)
- Overlay khi hover: dark semi-transparent + icon `Camera` trắng ở center
- Click → trigger file input ẩn
- Accepted: `.jpg .jpeg .png .webp`, max 2MB
- Sau khi chọn file → preview modal/inline crop (đơn giản: preview + confirm/cancel)
- Dưới avatar: link text "Remove photo" — chỉ hiện khi đã có avatar custom

**Profile Form**:
- Label + Input: "Display Name" — pre-filled, hint "2-50 characters"
- Label + Input disabled: "Email" — pre-filled, suffix badge "Email account" hoặc "Google account"
- Button "Save Changes" — emerald, loading spinner, disabled nếu data chưa thay đổi
- Success inline: checkmark green + "Profile updated"

---

### Tab: Security

*(Chỉ hiển thị nội dung đầy đủ cho email/password accounts. Google OAuth accounts thấy message "Password management is not available for Google accounts.")*

**Change Password Form**:
- Input "Current Password" (icon `Lock`, toggle visibility)
- Input "New Password" (toggle visibility)
- PasswordStrengthIndicator: progress bar 4 levels (red → orange → yellow → emerald) + label "Weak / Fair / Good / Strong"
- Input "Confirm New Password"
- Validation hints: min 8 chars, uppercase, number — checklist nhỏ cập nhật realtime
- Button "Update Password" — emerald, loading
- Success: toast "Password updated. Please log in again."

---

### Tab: Exchanges

**Header row**:
- Heading "Connected Exchanges"
- Button "Connect new exchange" (icon `Plus`, emerald) → mở Connect Exchange modal

**Exchange List**:
Mỗi exchange account — card `zinc-900` border `zinc-800` rounded-xl p-4:

Row layout:
- Left: exchange logo `32px` + exchange name (bold) + label (badge `zinc-700`)
- Right: status badge + actions

Status badges:
- `Connected` — bg `emerald-950` text `emerald-400` border `emerald-800`
- `Inactive` — bg `zinc-800` text `zinc-500`
- `Error` — bg `red-950` text `red-400` border `red-800`

Sub-row (info row):
- "Last synced: 5 minutes ago" — icon `RefreshCw` `zinc-400`
- "1,234 trades" — icon `BarChart2` `zinc-400`

Actions (right side, icon buttons với tooltip):
- `RefreshCw` — "Sync now" → loading spinner saat sync
- Toggle switch (shadcn `Switch`) — enable/disable
- `Trash2` `zinc-500` hover `red-400` — delete → confirmation dialog

**Empty state**:
- Icon `Plug` lớn `zinc-600`
- "No exchanges connected"
- Button "Connect your first exchange"

**Connect Exchange Modal** (shadcn `Dialog`):
- Heading "Connect Exchange"
- Step 1: Exchange selector — grid 5 cards với logo + name, click để select
- Selected highlight: border `emerald-500` bg `emerald-950/20`
- Step 2 (sau khi chọn exchange):
  - Input "API Key" — icon `Key`
  - Input "API Secret" — icon `KeyRound`, type password
  - Input "Label" — optional, placeholder "e.g. Main Account"
  - Info box `zinc-800`: "Use read-only API keys only. Never enable withdrawal permissions." với icon `Info` `yellow-400`
  - Link "How to create a read-only API key →" (external)
  - Button "Connect" — emerald, loading "Verifying..."
  - Button "Back" — text variant
- Error state trong modal: inline red error "Invalid API key or insufficient permissions"
- Success state: checkmark + "Exchange connected! Syncing trades..."

---

### Tab: Demo Account

**Demo Balance Card**:
- Large card, centered
- Icon `Wallet` `emerald-400` 40px
- Balance: "10,000.00 USDT" text-3xl font-bold emerald
- Subtext "Virtual balance"

**Stats Grid** (3 cards nhỏ):
- Total Demo Trades: count
- Win Rate: %
- Total Realized PNL: emerald/red

**Reset Section**:
- Separator
- Subheading "Reset Demo Account"
- Description text: "Reset your virtual balance to 10,000 USDT. All open positions and trade history will be cleared."
- Button "Reset Demo Account" — outline red, icon `RotateCcw`
- Confirmation dialog: "Are you sure? Type 'RESET' to confirm" + input + red confirm button

---

### Tab: Danger Zone

**Card với border `red-900` bg `red-950/10`**:
- Heading "Delete Account" text-red-400
- Description: "Permanently delete your account and all associated data including trade history, PNL records, and exchange connections. This action cannot be undone."
- Button "Delete Account" — bg `red-600` hover `red-500`, icon `Trash2`

**Delete Confirmation Dialog** (multi-step):

Step 1:
- Warning icon `AlertTriangle` `red-400` lớn
- Text: "This will permanently delete:\n• All trade history\n• All PNL data\n• All exchange connections\n• Your profile"
- Buttons: "Cancel" + "I understand, continue →"

Step 2:
- Input: "Type DELETE to confirm" — validation match exact string
- Input: "Current password" (nếu email account)
- Buttons: "Cancel" + "Delete my account" (red, disabled until validated)
- Loading: "Deleting your account..."

---

## Validation (Zod)

```typescript
const profileSchema = z.object({
  displayName: z.string().min(2).max(50).regex(/^[a-zA-Z0-9 _-]+$/)
})

const passwordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8).regex(/(?=.*[A-Z])(?=.*[a-z])(?=.*[0-9])/),
  confirmPassword: z.string()
}).refine(d => d.newPassword === d.confirmPassword, {
  path: ['confirmPassword'],
  message: 'Passwords do not match'
})
```

## Component Library

shadcn/ui: `Tabs`, `TabsList`, `TabsTrigger`, `TabsContent`, `Input`, `Button`, `Switch`, `Badge`, `Dialog`, `DialogContent`, `DialogHeader`, `DialogFooter`, `Alert`, `AlertDescription`, `Separator`, `Avatar`, `AvatarImage`, `AvatarFallback`, `Card`

Lucide: `UserCircle`, `Lock`, `Plug`, `TrendingUp`, `AlertTriangle`, `Camera`, `Key`, `KeyRound`, `RefreshCw`, `BarChart2`, `Trash2`, `Plus`, `Info`, `Wallet`, `RotateCcw`, `Check`

## File Structure Target

```
src/
  app/
    (dashboard)/
      profile/
        page.tsx
  components/
    features/
      profile/
        ProfileTabs.tsx
        GeneralTab.tsx
        AvatarUpload.tsx
        SecurityTab.tsx
        PasswordChangeForm.tsx
        ExchangesTab.tsx
        ExchangeAccountCard.tsx
        ConnectExchangeModal.tsx
        DemoAccountTab.tsx
        DangerZoneTab.tsx
        DeleteAccountDialog.tsx
```

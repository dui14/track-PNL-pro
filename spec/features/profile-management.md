# Feature Specification: User Profile Management

## Overview

Module quản lý profile cho phép users cập nhật thông tin cá nhân, thay đổi mật khẩu, upload avatar, quản lý kết nối exchange, và cấu hình security settings. Đây là trung tâm quản lý tài khoản của người dùng.

## Goals

- Cung cấp giao diện quản lý tài khoản đầy đủ
- Cho phép cập nhật thông tin profile một cách an toàn
- Quản lý exchange connections từ một nơi
- Hỗ trợ upload avatar với Supabase Storage
- Security settings: đổi mật khẩu, view active sessions

## User Stories

| ID | As a | I want to | So that |
|---|---|---|---|
| US-PROF-001 | User | Cập nhật display name | Cá nhân hóa profile |
| US-PROF-002 | User | Upload avatar mới | Profile trông chuyên nghiệp hơn |
| US-PROF-003 | User | Đổi mật khẩu | Bảo mật tài khoản |
| US-PROF-004 | User | Xem email hiện tại | Kiểm tra thông tin đăng nhập |
| US-PROF-005 | User | Xem tất cả exchange connections | Tổng quan kết nối |
| US-PROF-006 | User | Xóa exchange API key | Ngắt kết nối không cần thiết |
| US-PROF-007 | User | Bật/tắt exchange connection | Tạm dừng sync |
| US-PROF-008 | User | Xem demo trading balance | Kiểm tra vốn ảo còn lại |
| US-PROF-009 | User | Delete account | Xóa toàn bộ dữ liệu |

## Functional Requirements

### FR-PROF-001: Display Name Update

- Form input với current display_name pre-filled
- Validation: 2-50 ký tự, không chứa ký tự đặc biệt nguy hiểm
- Cập nhật `users.display_name`
- Real-time preview của avatar + name trong UI
- Hiển thị success toast sau khi lưu

### FR-PROF-002: Avatar Upload

- Click vào avatar để trigger file picker
- Accepted formats: `.jpg`, `.jpeg`, `.png`, `.webp`
- Max file size: 2MB
- Client-side image preview trước khi upload
- Crop và resize về 200x200px ở client-side trước khi upload
- Upload đến Supabase Storage: bucket `avatars`, path `{user_id}/avatar.jpg`
- Bucket policy: public read, auth write (chỉ user sở hữu)
- Cập nhật `users.avatar_url` sau khi upload thành công
- Hỗ trợ xóa avatar (set về default generated avatar)

### FR-PROF-003: Password Change

- Chỉ hiển thị cho users đăng nhập bằng Email/Password
- Yêu cầu: current password, new password, confirm new password
- Validate: new password min 8 ký tự, có chữ hoa, chữ thường, số
- Gọi `supabase.auth.updateUser({ password: newPassword })`
- Supabase tự xác minh current password
- Invalidate các sessions khác sau khi đổi mật khẩu thành công
- Hiển thị success message, yêu cầu đăng nhập lại

### FR-PROF-004: Email Update

- Chỉ cho phép với Email/Password accounts
- Input new email với validation format
- Gọi `supabase.auth.updateUser({ email: newEmail })`
- Supabase gửi confirmation email đến địa chỉ mới
- Email cũ vẫn hoạt động cho đến khi xác nhận email mới
- Cập nhật `users.email` sau khi Supabase confirm

### FR-PROF-005: Exchange Connections Management

Tab "Exchanges" trong profile page hiển thị:
- Danh sách tất cả exchange accounts
- Per account: exchange logo, name, label, status, last_synced, trade_count
- Actions: Toggle active/inactive, Sync now, Delete
- Button "Connect New Exchange" dẫn đến Connect Exchange modal

Xem spec chi tiết: [exchange-integration.md](exchange-integration.md)

### FR-PROF-006: Demo Account Settings

- Hiển thị current demo balance
- Button "Reset Demo Account" với confirmation dialog
- Demo trade statistics: total trades, win rate, total realized PNL

### FR-PROF-007: Delete Account

- Link "Delete Account" ở cuối trang Settings
- Multi-step confirmation:
  1. Warning: "All your data will be permanently deleted"
  2. Type "DELETE" to confirm
  3. Enter current password (nếu email/password account)
- Thực hiện:
  - Xóa tất cả user data (cascade từ `users`)
  - Xóa avatar từ Supabase Storage
  - Gọi Supabase Admin API để xóa auth user
  - Logout và redirect đến homepage

### FR-PROF-008: Account Info Section

Read-only section hiển thị:
- Email address (masked: `he***@gmail.com`)
- Account type: "Google OAuth" hoặc "Email/Password"
- Member since (created_at)
- Last login

## Non-Functional Requirements

- Avatar upload < 5 giây trên connection 10Mbps
- Profile save < 1 giây
- Profile page load < 1 giây (SSR)
- Avatar stored trong Supabase Storage (CDN-backed)
- Avatar URL public nhưng không predictable (include user_id)
- Tất cả profile mutations require re-auth validation

## Edge Cases

| Scenario | Expected Behavior |
|---|---|
| Upload file không phải ảnh | Từ chối với message "Invalid file type" |
| Avatar > 2MB | Client-side validation trước khi upload |
| Đổi mật khẩu sai current password | Supabase trả về error, hiển thị "Current password incorrect" |
| Email mới đã tồn tại | Supabase trả về error, hiển thị "Email already in use" |
| Google OAuth user cố đổi password | Ẩn form, hiển thị "Password change not available for Google accounts" |
| Delete account khi đang có active sync | Cancel sync trước, sau đó delete |
| Upload avatar bị interrupt | File cũ vẫn còn, không bị mất |
| Display name chứa script tags | Sanitize, từ chối input |
| User thay đổi thông tin nhiều tab | Last write wins, không conflict |

## Data Models

### users
```sql
CREATE TABLE users (
  id                    UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email                 TEXT NOT NULL,
  display_name          TEXT,
  avatar_url            TEXT,
  demo_balance          NUMERIC(18,8) NOT NULL DEFAULT 10000,
  onboarding_completed  BOOLEAN NOT NULL DEFAULT FALSE,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### Supabase Storage

```
Bucket: avatars
Path: {user_id}/avatar.{ext}
Policy: 
  - SELECT: public (authenticated users + anonymous)
  - INSERT/UPDATE/DELETE: authenticated, auth.uid() = user_id from path
```

## API Endpoints

### GET /api/profile

Lấy thông tin profile của user hiện tại.

Response:
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "email": "user@example.com",
    "display_name": "Nguyen Van A",
    "avatar_url": "https://storage.supabase.co/avatars/uuid/avatar.jpg",
    "demo_balance": 9500.00,
    "onboarding_completed": true,
    "account_type": "email",
    "created_at": "2026-01-01T00:00:00Z",
    "last_sign_in": "2026-03-07T08:00:00Z"
  },
  "error": null
}
```

### PATCH /api/profile

Cập nhật profile information.

Request:
```json
{
  "displayName": "Nguyen Van B"
}
```

Validation:
- `displayName`: string 2-50 ký tự, optional

Response:
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "display_name": "Nguyen Van B",
    "updated_at": "2026-03-07T10:00:00Z"
  },
  "error": null
}
```

### POST /api/profile/avatar

Upload avatar image.

Request: `multipart/form-data`
- `file`: image file (jpg/png/webp, max 2MB)

Process:
1. Validate file type và size
2. Upload đến Supabase Storage `avatars/{userId}/avatar.jpg`
3. Get public URL
4. Cập nhật `users.avatar_url`

Response:
```json
{
  "success": true,
  "data": {
    "avatar_url": "https://storage.supabase.co/storage/v1/object/public/avatars/uuid/avatar.jpg"
  },
  "error": null
}
```

### DELETE /api/profile/avatar

Xóa avatar, set về null (will use generated avatar).

Response:
```json
{
  "success": true,
  "data": { "avatar_url": null },
  "error": null
}
```

### POST /api/profile/change-password

Đổi mật khẩu (chỉ email/password accounts).

Request:
```json
{
  "newPassword": "NewSecure123!",
  "confirmPassword": "NewSecure123!"
}
```

Note: Supabase Auth tự verify current password khi gọi `updateUser` với JWT.

Validation:
- `newPassword`: min 8 ký tự, có chữ hoa, thường, số
- `confirmPassword`: phải khớp `newPassword`

Response:
```json
{
  "success": true,
  "data": { "password_updated": true },
  "error": null
}
```

### DELETE /api/profile/account

Xóa toàn bộ tài khoản.

Request:
```json
{
  "confirmation": "DELETE",
  "password": "current_password (optional, for email accounts)"
}
```

Response:
```json
{
  "success": true,
  "data": { "account_deleted": true },
  "error": null
}
```

### GET /api/profile/demo-stats

Demo trading statistics.

Response:
```json
{
  "success": true,
  "data": {
    "demo_balance": 10350.00,
    "total_trades": 25,
    "win_rate": 60.0,
    "total_realized_pnl": 350.00,
    "open_positions": 2
  },
  "error": null
}
```

## UI Components

### Pages
- `/profile` — `ProfilePage`

### Layout
- `ProfileLayout` — Tabs navigation (Profile / Exchanges / Security / Danger Zone)

### Tabs
- `ProfileInfoTab` — Display name, avatar
- `ExchangesTab` — Exchange connections management
- `SecurityTab` — Password change, email update, active sessions
- `DangerZoneTab` — Delete account

### Components
- `AvatarUploader` — Click-to-upload avatar component
  - Current avatar display (circle)
  - Hidden file input
  - Client-side preview modal
  - Upload progress indicator
- `ProfileForm` — Form với display_name
- `PasswordChangeForm` — 3-field password change form
- `EmailUpdateForm` — Email change form
- `AccountInfoCard` — Read-only account information
- `DemoStatsCard` — Demo balance và stats
- `DeleteAccountDialog` — Multi-step confirmation modal

### Exchange Tab (reuses)
- `ExchangeConnectionList` (từ exchange-integration spec)
- `ConnectExchangeModal`
- `ExchangeCard`

## Sequence Flow

### Avatar Upload

```
User            AvatarUploader      API Route          Supabase Storage    Database
 |                   |                  |                    |               |
 |-- Click avatar -->|                  |                    |               |
 |                   |-- File picker open                    |               |
 |-- Select file --->|                  |                    |               |
 |                   |-- Validate (type, size)               |               |
 |                   |-- Client resize to 200x200            |               |
 |                   |-- Show preview   |                    |               |
 |-- Confirm ------->|                  |                    |               |
 |                   |-- POST /api/profile/avatar (multipart)|               |
 |                   |                 |-- Upload to storage->               |
 |                   |                 |<-- public URL ---------|             |
 |                   |                 |-- UPDATE users.avatar_url --------->|
 |                   |<-- 200 OK -------|                    |               |
 |<-- New avatar shown|                |                    |               |
```

### Password Change

```
User         PasswordChangeForm    Supabase Auth        Database
 |                 |                    |                  |
 |-- Submit form ->|                    |                  |
 |                 |-- updateUser() --->|                  |
 |                 |   { password }     |-- Verify JWT     |
 |                 |                   |-- Hash new password                |
 |                 |                   |-- Update auth.users --------------->|
 |                 |                   |-- Invalidate other sessions         |
 |                 |<-- Success --------|                  |               |
 |<-- Toast success|                   |                  |               |
 |-- Redirect to login                 |                  |               |
```

### Delete Account

```
User          DeleteDialog         API Route          Auth Service       Database
 |                 |                   |                  |               |
 |-- Click delete->|                   |                  |               |
 |                 |-- Step 1: Warning |                   |               |
 |-- Type DELETE ->|                   |                   |               |
 |-- Confirm ----->|                   |                   |               |
 |                 |-- DELETE /api/profile/account -->      |               |
 |                 |                  |-- Validate "DELETE" |               |
 |                 |                  |-- Delete storage files ------------>|
 |                 |                  |-- DELETE from users (cascade) ----->|
 |                 |                  |-- Admin deleteUser-->               |
 |                 |                  |-- Sign out       |               |
 |                 |<-- 200 OK --------|                  |               |
 |-- Redirect to / |                   |                  |               |
```

## Security Considerations

- **Avatar Upload Validation**: Validate MIME type ở server (không chỉ file extension)
- **Storage Access Control**: Mỗi user chỉ write vào path có `user_id` của mình
- **Password Change Auth**: Supabase JWT xác minh identity, không cần current password field riêng
- **Email Change Flow**: Require xác nhận qua email mới trước khi apply change
- **Account Deletion**: Yêu cầu confirm "DELETE" + optional password để tránh accidental deletion
- **Parameter Tampering**: `user_id` lấy từ JWT session, không từ request body
- **Rate Limiting**: Avatar upload: 5 lần/ngày, password change: 3 lần/giờ
- **Content Security**: Avatar images served qua Supabase CDN, không từ external domains
- **Data Portability**: Trước khi xóa, có thể xem xét cung cấp export data (future feature)

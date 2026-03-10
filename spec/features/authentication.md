# Feature Specification: Authentication

## Overview

Hệ thống xác thực cho phép người dùng đăng nhập bằng Google OAuth hoặc Email/Password thông qua Supabase Auth. Sau khi xác thực, session được duy trì an toàn và các route được bảo vệ bằng Next.js middleware. Người dùng mới được định hướng qua flow onboarding để cấu hình tài khoản ban đầu.

## Goals

- Cung cấp trải nghiệm đăng nhập liền mạch với Google OAuth và Email/Password
- Đảm bảo session an toàn sử dụng JWT của Supabase
- Bảo vệ tất cả authenticated routes bằng middleware
- Cung cấp đầy đủ luồng: đăng ký, xác minh email, đặt lại mật khẩu, đăng xuất
- Tự động tạo user profile khi đăng ký lần đầu
- Dẫn dắt người dùng mới qua onboarding

## User Stories

| ID | As a | I want to | So that |
|---|---|---|---|
| US-AUTH-001 | Visitor | Đăng nhập bằng Google | Không cần tạo mật khẩu |
| US-AUTH-002 | Visitor | Đăng ký bằng email/password | Tạo tài khoản với thông tin cá nhân |
| US-AUTH-003 | Registered user | Đăng nhập bằng email/password | Truy cập dashboard |
| US-AUTH-004 | User | Đặt lại mật khẩu quên | Lấy lại quyền truy cập tài khoản |
| US-AUTH-005 | New user | Xác minh địa chỉ email | Kích hoạt tài khoản |
| US-AUTH-006 | Authenticated user | Đăng xuất | Kết thúc session an toàn |
| US-AUTH-007 | New user | Hoàn thành onboarding | Cấu hình tài khoản ban đầu |
| US-AUTH-008 | Unauthenticated user | Bị chuyển hướng đến login | Không truy cập được protected routes |

## Functional Requirements

### FR-AUTH-001: Google OAuth Login
- Hiển thị nút "Continue with Google" trên trang login
- Sử dụng Supabase Auth OAuth provider (Google)
- Sau callback, kiểm tra user tồn tại trong bảng `users`
- Nếu chưa tồn tại, tự động tạo record trong `users` với thông tin từ Google profile
- Chuyển hướng đến `/onboarding` nếu là lần đăng nhập đầu tiên
- Chuyển hướng đến `/dashboard` nếu đã onboarded

### FR-AUTH-002: Email/Password Registration
- Form đăng ký yêu cầu: email, password, confirm password, display name
- Validate email format và password strength (min 8 ký tự, có chữ hoa, số)
- Gọi `supabase.auth.signUp()` với email và password
- Supabase gửi email xác minh tự động
- Sau khi đăng ký, hiển thị màn hình "Check your email"
- Tạo record trong `users` thông qua database trigger khi auth.users được tạo

### FR-AUTH-003: Email/Password Login
- Form login yêu cầu: email, password
- Gọi `supabase.auth.signInWithPassword()`
- Xử lý lỗi: invalid credentials, email not confirmed, account disabled
- Session được lưu trong cookie (httpOnly, secure, sameSite: lax)
- Chuyển hướng đến `/dashboard` sau khi đăng nhập thành công

### FR-AUTH-004: Password Reset
- Form "Forgot Password" yêu cầu email address
- Gọi `supabase.auth.resetPasswordForEmail()` với redirect URL
- Gửi email chứa reset link (có hạn 1 giờ)
- Trang `/auth/reset-password` nhận token từ URL hash
- Validate new password và confirm password
- Gọi `supabase.auth.updateUser({ password: newPassword })`
- Hiển thị success message và chuyển hướng đến login

### FR-AUTH-005: Email Verification
- Supabase tự động gửi email xác minh khi đăng ký
- Link xác minh redirect đến `/auth/callback`
- Callback handler xử lý `supabase.auth.exchangeCodeForSession()`
- Sau xác minh, chuyển hướng đến `/onboarding`
- Cho phép resend verification email sau 60 giây cooldown

### FR-AUTH-006: Session Handling
- Sử dụng `@supabase/ssr` để quản lý session trong Next.js
- Session cookies: `sb-access-token`, `sb-refresh-token`
- Access token TTL: 1 giờ (Supabase default)
- Refresh token tự động renew khi access token hết hạn
- Middleware check session trên mọi request đến protected routes

### FR-AUTH-007: Protected Routes
- Middleware tại `src/middleware.ts` intercept tất cả request
- Protected path patterns: `/dashboard/*`, `/demo/*`, `/profile/*`, `/api/*`
- Public paths: `/`, `/login`, `/register`, `/auth/*`
- Nếu không có session hợp lệ: redirect đến `/login?next=<intended_url>`
- Sau login, redirect đến URL ban đầu từ `next` param

### FR-AUTH-008: Logout
- Gọi `supabase.auth.signOut()` 
- Xóa session cookies
- Clear Zustand auth store
- Invalidate TanStack Query cache
- Redirect đến `/login`

### FR-AUTH-009: User Onboarding
- Triggered khi `users.onboarding_completed = false`
- Bước 1: Chào mừng + giới thiệu sản phẩm
- Bước 2: Kết nối exchange đầu tiên (optional, có thể skip)
- Bước 3: Setup display name và avatar (optional)
- Sau hoàn thành: set `onboarding_completed = true`
- Progress lưu trong session, không bắt buộc hoàn thành trong một lần

## Non-Functional Requirements

- Login response time < 2 giây (không tính OAuth redirect)
- Session validation overhead < 50ms per request (middleware)
- Password reset email gửi trong vòng 30 giây
- Rate limit: max 10 login attempts per IP per phút
- HTTPS required cho tất cả auth endpoints
- Session cookies phải httpOnly, Secure, SameSite=Lax

## Edge Cases

| Scenario | Expected Behavior |
|---|---|
| Google account đã dùng email để đăng ký | Block và hiển thị "Email already registered with password" |
| Đăng ký email chưa xác minh, thử đăng nhập | Hiển thị "Please verify your email first" với option resend |
| Reset password link đã hết hạn | Hiển thị lỗi và form để request link mới |
| Người dùng xóa cookies giữa chừng | Middleware redirect về `/login` |
| Đăng nhập trên nhiều tab | Session chia sẻ, logout một tab không logout các tab khác ngay lập tức |
| OAuth provider gặp sự cố | Hiển thị lỗi thân thiện, không expose error chi tiết |
| Email đã tồn tại khi Google OAuth | Supabase link account tự động nếu email khớp |
| User bị disabled bởi admin | Return 403 với message "Account suspended" |

## Data Models

### Bảng sử dụng

**auth.users** (Supabase managed)
```
id, email, email_confirmed_at, last_sign_in_at, created_at
```

**users** (public schema)
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

### Database Trigger - Auto Create Profile

```sql
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.users (id, email, display_name, avatar_url)
  VALUES (
    NEW.id,
    NEW.email,
    NEW.raw_user_meta_data->>'full_name',
    NEW.raw_user_meta_data->>'avatar_url'
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();
```

## API Endpoints

### POST /api/auth/profile-check
Kiểm tra user profile tồn tại sau OAuth callback.

Request headers: `Authorization: Bearer <token>`

Response:
```json
{
  "success": true,
  "data": {
    "onboarding_completed": false,
    "display_name": null,
    "avatar_url": null
  },
  "error": null
}
```

### POST /api/auth/complete-onboarding
Đánh dấu onboarding hoàn thành.

Request:
```json
{
  "displayName": "Nguyen Van A",
  "avatarUrl": null
}
```

Response:
```json
{
  "success": true,
  "data": { "onboarding_completed": true },
  "error": null
}
```

### POST /api/auth/resend-verification
Gửi lại email xác minh.

Request:
```json
{
  "email": "user@example.com"
}
```

Response:
```json
{
  "success": true,
  "data": { "sent": true },
  "error": null
}
```

## UI Components

### Pages
- `/login` — `LoginPage`: Form login với Google OAuth và Email/Password
- `/register` — `RegisterPage`: Form đăng ký mới
- `/auth/callback` — `AuthCallbackPage`: Xử lý OAuth callback và email verification
- `/auth/forgot-password` — `ForgotPasswordPage`: Form yêu cầu reset password
- `/auth/reset-password` — `ResetPasswordPage`: Form nhập mật khẩu mới
- `/onboarding` — `OnboardingPage`: Multi-step onboarding flow

### Components
- `LoginForm` — Form email/password login với validation
- `RegisterForm` — Form đăng ký với React Hook Form + Zod
- `GoogleSignInButton` — OAuth button
- `ForgotPasswordForm` — Email input form
- `ResetPasswordForm` — New password form
- `OnboardingWizard` — Multi-step wizard container
- `OnboardingStep` — Reusable step component
- `EmailVerificationNotice` — Banner "Check your email"
- `AuthGuard` — HOC bảo vệ route ở client-side

## Sequence Flow

### Google OAuth Login

```
User                Browser             Next.js              Supabase Auth        Google
 |                     |                    |                      |                 |
 |-- Click Google ---->|                    |                      |                 |
 |                     |-- GET /login ----->|                      |                 |
 |                     |<-- Login Page -----|                      |                 |
 |                     |-- signInWithOAuth()->                     |                 |
 |                     |                    |-- OAuth initiate --->|                 |
 |                     |                    |                      |-- Redirect ---->|
 |                     |<----- Redirect to Google consent ---------|                 |
 |                     |---------- User grants consent ----------->|                 |
 |                     |<----- Redirect to /auth/callback with code ----------------|
 |                     |-- GET /auth/callback -->                  |                 |
 |                     |                    |-- exchangeCodeForSession() -->         |
 |                     |                    |<-- access_token, refresh_token --------|
 |                     |                    |-- Check users table                   |
 |                     |                    |-- (trigger creates profile if new)     |
 |                     |                    |-- Redirect /onboarding or /dashboard   |
 |                     |<-- Set-Cookie: session --|                |                 |
```

### Email/Password Login

```
User            LoginForm           API Route           Supabase Auth       Database
 |                  |                   |                    |                  |
 |-- Submit form -->|                   |                    |                  |
 |                  |-- POST /api/auth--|                    |                  |
 |                  |   (via Supabase   |-- signInWithPwd -->|                  |
 |                  |    client-side)   |                    |                  |
 |                  |                  |                    |-- Verify creds   |
 |                  |                  |                    |-- Return tokens   |
 |                  |<-- session set --|                    |                  |
 |                  |                  |-- GET /api/auth/   |                  |
 |                  |                  |   profile-check -->|-- Query users --->|
 |                  |                  |                    |<-- user data -----|
 |                  |                  |-- Redirect /dashboard                  |
```

### Password Reset

```
User          ForgotPasswordForm     Supabase Auth       Email Service
 |                  |                    |                    |
 |-- Enter email -->|                    |                    |
 |                  |-- resetPasswordForEmail() -->           |
 |                  |                    |-- Send email ----->|
 |                  |                    |                    |-- Deliver link -->|
 |<-- "Check email" message              |                    |                  |
 |                                                                                |
 |-- Click reset link (with token) ----->|                    |                  |
 |-- GET /auth/reset-password?token=xxx  |                    |                  |
 |-- Enter new password -->              |                    |                  |
 |                  |-- updateUser({ password }) -->          |                  |
 |                  |<-- Success         |                    |                  |
 |-- Redirect to /login                  |                    |                  |
```

## Security Considerations

- **Password hashing**: Supabase xử lý bcrypt hashing, không bao giờ lưu plain text
- **JWT security**: Access token có TTL ngắn (1h), refresh token rotation enabled
- **CSRF protection**: SameSite=Lax cookie ngăn chặn CSRF attacks
- **Rate limiting**: Giới hạn login attempts tại Supabase Auth settings (max 10/phút/IP)
- **OAuth state parameter**: Supabase tự động tạo và validate state để ngăn CSRF trong OAuth
- **Callback URL validation**: Chỉ cho phép redirect đến domain whitelist trong Supabase
- **Email enumeration prevention**: Response thống nhất khi forgot password dù email tồn tại hay không
- **Secure cookies**: httpOnly ngăn XSS đọc tokens, Secure chỉ gửi qua HTTPS
- **Input sanitization**: Validate tất cả form inputs bằng Zod trước khi gửi đến Supabase
- **Session invalidation**: Logout gọi `signOut()` để invalidate refresh token ở server
- **Onboarding bypass prevention**: Check `onboarding_completed` trên server, không chỉ client-side

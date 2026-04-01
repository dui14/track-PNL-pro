# UI Prompt: Authentication

## Context

Trang xác thực cho aiTrackProfit — nền tảng theo dõi PNL crypto đa sàn. Giao diện phải truyền tải sự chuyên nghiệp, tin cậy và hiện đại của một fintech application.

## Design Direction

- Dark theme: background `zinc-950`, surface `zinc-900`, border `zinc-800`
- Accent color: `emerald-500` cho actions chính, `red-500` cho lỗi
- Typography: clean, sans-serif, rõ ràng
- Layout: centered card trên full-screen background với subtle gradient hoặc pattern
- Responsive: tối ưu mobile-first

## Pages & Components

### 1. Login Page (`/login`)

Layout:
- Full-screen background tối với subtle abstract pattern (grid hoặc gradient radial)
- Centered card `max-w-md`, shadow lớn, border `zinc-800`, bg `zinc-900`
- Logo aiTrackProfit ở trên card (icon + text)
- Tagline: "Track your crypto profits across all exchanges"

Card Content:
- Heading: "Welcome back"
- Subtext: "Sign in to your account"
- Nút "Continue with Google" — full width, icon Google, bg trắng/xám nhạt, text tối, border rõ
- Divider: "--- or ---" giữa OAuth và email form
- Form fields: Email (icon `Mail`), Password (icon `Lock`, toggle show/hide)
- Checkbox "Remember me" + Link "Forgot password?" (căn phải)
- Button "Sign In" — full width, bg `emerald-500`, hover `emerald-400`, text trắng, loading spinner
- Footer: "Don't have an account? Register" link

Error States:
- Inline error message dưới field — text `red-400`, icon `AlertCircle`
- Toast error cho lỗi chung: "Invalid email or password"

### 2. Register Page (`/register`)

Layout: Tương tự login page

Card Content:
- Heading: "Create your account"
- Nút "Continue with Google"
- Divider
- Form fields: Display Name (icon `User`), Email (icon `Mail`), Password (icon `Lock`), Confirm Password (icon `Lock`)
- Password strength indicator — progress bar màu: red → yellow → emerald theo độ mạnh
- Button "Create Account" — full width, emerald, loading state
- Footer: "Already have an account? Sign in" link

### 3. Check Email Page (`/auth/check-email`)

Layout: Centered card, tối giản

Content:
- Icon lớn: `MailCheck` màu `emerald-400` (64px, animated pulse nhẹ)
- Heading: "Check your inbox"
- Body: "We sent a verification link to **{email}**. Click the link to activate your account."
- Nút "Resend email" — outline variant, disabled với countdown "Resend in 45s" sau khi gửi
- Link "← Back to login"

### 4. Forgot Password Page (`/auth/forgot-password`)

Card Content:
- Icon: `KeyRound` màu emerald
- Heading: "Reset your password"
- Subtext: "Enter your email and we'll send you a reset link"
- Form: Email input
- Button "Send reset link"
- Sau submit: success state — icon `CheckCircle`, text "Reset link sent to {email}"
- Link "← Back to login"

### 5. Reset Password Page (`/auth/reset-password`)

Card Content:
- Heading: "Set new password"
- Form: New Password + Confirm Password (cả hai đều có toggle visibility)
- Password strength indicator
- Button "Update password"
- Sau thành công: redirect tự động với countdown "Redirecting to login in 3s..."

### 6. Onboarding Flow (`/onboarding`)

Layout: Full-screen, không có sidebar. Progress bar ở top (3 steps).

Step 1 — Welcome:
- Illustration/icon lớn: multi-exchange dashboard concept
- Heading: "Welcome to aiTrackProfit, {name}!"
- Body: brief product overview bullets (3 key benefits với icons)
- Button "Get started →"

Step 2 — Connect Exchange:
- Heading: "Connect your first exchange"
- Grid 5 exchange cards (Binance, OKX, Bybit, Bitget, Gate.io) — logo + name, click để kết nối
- Nếu click → mở Connect Exchange modal inline
- Button "Skip for now" (text variant) + "Continue →" (emerald, disabled nếu chưa kết nối, hoặc enabled với skip logic)

Step 3 — Profile Setup:
- Heading: "Set up your profile"
- Avatar upload circle (dashed border khi chưa có ảnh, icon `Camera` overlay)
- Input Display Name
- Button "Complete setup →"

Progress indicator: dots hoặc numbered steps ở đỉnh card, step hiện tại highlighted emerald

## Component Library

Sử dụng shadcn/ui:
- `Input`, `Button`, `Checkbox`, `Label`, `Form` (react-hook-form integration)
- `Separator` cho divider
- `Progress` cho password strength
- `Toast` / `Sonner` cho notifications

Lucide icons: `Mail`, `Lock`, `Eye`, `EyeOff`, `User`, `KeyRound`, `MailCheck`, `AlertCircle`, `CheckCircle`, `Camera`, `ArrowRight`

## Validation (Zod schemas)

```typescript
const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1)
})

const registerSchema = z.object({
  displayName: z.string().min(2).max(50),
  email: z.string().email(),
  password: z.string().min(8).regex(/(?=.*[A-Z])(?=.*[0-9])/),
  confirmPassword: z.string()
}).refine(d => d.password === d.confirmPassword, {
  path: ['confirmPassword'],
  message: 'Passwords do not match'
})
```

## Accessibility

- `aria-label` trên icon buttons (toggle password visibility)
- `role="alert"` trên error messages
- Focus management: auto-focus first field khi card mount
- Tab order hợp lý, không skip elements

## File Structure Target

```
src/
  app/
    (auth)/
      login/page.tsx
      register/page.tsx
      forgot-password/page.tsx
      reset-password/page.tsx
      check-email/page.tsx
    onboarding/page.tsx
  components/
    features/
      auth/
        LoginForm.tsx
        RegisterForm.tsx
        ForgotPasswordForm.tsx
        ResetPasswordForm.tsx
        OAuthButton.tsx
        PasswordStrengthIndicator.tsx
      onboarding/
        OnboardingProgress.tsx
        WelcomeStep.tsx
        ConnectExchangeStep.tsx
        ProfileSetupStep.tsx
```

import { LoginForm } from '@/components/features/auth/LoginForm'

export default function LoginPage(): React.JSX.Element {
  return (
    <div className="flex items-center justify-center min-h-dvh px-4 py-6 sm:min-h-screen">
      <LoginForm />
    </div>
  )
}

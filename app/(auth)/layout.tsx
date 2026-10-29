import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Sign In — Ctrl Room',
}

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return <div className="min-h-[100dvh] w-full">{children}</div>
}

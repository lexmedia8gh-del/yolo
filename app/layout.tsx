import type { Metadata } from 'next'
import { AuthProvider } from '@/lib/contexts/AuthContext'
import { ToasterWrapper } from '@/components/ui/ToasterWrapper'
import '@/app/globals.css'

export const metadata: Metadata = {
  title: {
    default: 'Lexmedia — Client & Payment Management',
    template: '%s | Lexmedia',
  },
  description:
    'Professional client and payment management system for Lexmedia creative agency.',
  icons: {
    icon: '/favicon.ico',
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className="font-sans antialiased">
        <AuthProvider>
          {children}
          <ToasterWrapper />
        </AuthProvider>
      </body>
    </html>
  )
}

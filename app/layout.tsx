import type { Metadata } from 'next'
import { AuthProvider } from '@/lib/contexts/AuthContext'
import { Toaster } from 'react-hot-toast'
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
          <Toaster
            position="top-right"
            toastOptions={{
              duration: 4000,
              style: {
                borderRadius: '12px',
                boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                fontSize: '14px',
                fontFamily: 'var(--font-inter)',
              },
              success: {
                iconTheme: { primary: '#22C55E', secondary: '#fff' },
              },
              error: {
                iconTheme: { primary: '#EF4444', secondary: '#fff' },
              },
            }}
          />
        </AuthProvider>
      </body>
    </html>
  )
}

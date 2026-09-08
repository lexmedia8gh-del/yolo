import type { Metadata } from 'next'
import { AuthProvider } from '@/lib/contexts/AuthContext'
import { ThemeProvider } from '@/lib/contexts/ThemeContext'
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

const themeInitScript = `
(function() {
  try {
    var stored = localStorage.getItem('ctrlroom_theme_preference');
    var isDark = stored === 'dark' || (!stored && window.matchMedia('(prefers-color-scheme: dark)').matches) || (stored === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
    if (isDark) {
      document.documentElement.classList.add('dark');
      document.documentElement.style.colorScheme = 'dark';
    } else {
      document.documentElement.classList.remove('dark');
      document.documentElement.style.colorScheme = 'light';
    }
  } catch (e) {}
})();
`

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className="font-sans antialiased bg-background text-gray-900 dark:text-gray-100 min-h-screen">
        <ThemeProvider>
          <AuthProvider>
            {children}
            <ToasterWrapper />
          </AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}


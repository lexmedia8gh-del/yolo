import type { Metadata } from 'next'
import { AuthProvider } from '@/lib/contexts/AuthContext'
import { BrandingProvider } from '@/lib/contexts/BrandingContext'
import { ThemeProvider } from '@/lib/contexts/ThemeContext'
import { ToasterWrapper } from '@/components/ui/ToasterWrapper'
import { getServerInitialBranding } from '@/lib/branding/server-branding'
import { resolveAuthoritativeSplashLogoUrl } from '@/lib/branding/logo-resolver'
import '@/app/globals.css'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: {
    default: 'LEXMEDIA.GH • Ctrl Room',
    template: '%s | LEXMEDIA.GH',
  },
  description:
    'Operations management system for LEXMEDIA.GH.',
  openGraph: {
    title: 'LEXMEDIA.GH • Ctrl Room',
    description: 'Operations management system for LEXMEDIA.GH.',
  },
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

  // Preload cached custom branding logo immediately before hydration if present
  try {
    var cachedRaw = localStorage.getItem('lexmedia_branding_cache_v1');
    if (cachedRaw) {
      var cached = JSON.parse(cachedRaw);
      var url = (cached && (cached.logoLightUrl || cached.logoUrl)) || '';
      if (url && typeof Image !== 'undefined') {
        var preImg = new Image();
        preImg.decoding = 'async';
        preImg.src = url;
      }
    }
  } catch (e) {}

  // Auto-recover from stale Next.js/Webpack chunk load failures
  if (typeof window !== 'undefined') {
    window.addEventListener('error', function(e) {
      if (e && e.message && (e.message.indexOf('Loading chunk') !== -1 || e.message.indexOf('ChunkLoadError') !== -1)) {
        var key = 'last_chunk_reload';
        var now = Date.now();
        var last = parseInt(sessionStorage.getItem(key) || '0', 10);
        if (now - last > 8000) {
          sessionStorage.setItem(key, String(now));
          window.location.reload();
        }
      }
    });
  }
})();
`

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const initialBranding = await getServerInitialBranding()
  const preloadSplashLogoUrl = resolveAuthoritativeSplashLogoUrl(initialBranding)

  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link
          rel="preload"
          as="image"
          href={preloadSplashLogoUrl}
          fetchPriority="high"
        />
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body
        className="font-sans antialiased bg-background text-gray-900 dark:text-gray-100 min-h-screen"
        suppressHydrationWarning
      >
        <ThemeProvider>
          <BrandingProvider initialBranding={initialBranding}>
            <AuthProvider>
              {children}
              <ToasterWrapper />
            </AuthProvider>
          </BrandingProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}


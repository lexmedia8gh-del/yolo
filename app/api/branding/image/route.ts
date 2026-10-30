import { NextRequest, NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'
import { getCandidateStorageBuckets } from '@/lib/firebase/admin'
import { getSupabaseUrl, isSupabaseConfigured } from '@/lib/supabase/client'
import {
  cleanStoragePath,
  downloadBrandingAssetFromSupabase,
  isSafeBrandingStoragePath,
} from '@/lib/supabase/storage'

export const dynamic = 'force-dynamic'

function inferBrandingMimeType(filePath: string): string {
  const ext = filePath.split('.').pop()?.toLowerCase() || ''
  switch (ext) {
    case 'png':
      return 'image/png'
    case 'jpg':
    case 'jpeg':
      return 'image/jpeg'
    case 'webp':
      return 'image/webp'
    case 'svg':
      return 'image/svg+xml'
    case 'ico':
      return 'image/x-icon'
    default:
      return 'image/png'
  }
}

async function readLocalBrandingAsset(rawPath: string): Promise<{ buffer: Buffer; contentType: string } | null> {
  if (!isSafeBrandingStoragePath(rawPath)) return null
  const cleaned = cleanStoragePath(rawPath)
  if (!cleaned || cleaned.includes('..')) return null

  const candidates = [
    path.join('/tmp', 'uploads', cleaned),
    path.join(process.cwd(), 'public', 'uploads', cleaned),
  ]
  for (const candidate of candidates) {
    try {
      if (fs.existsSync(candidate)) {
        const buffer = await fs.promises.readFile(candidate)
        return { buffer, contentType: inferBrandingMimeType(cleaned) }
      }
    } catch {}
  }
  return null
}

function extractSafeSupabaseBrandingPath(rawUrl: string): string | null {
  try {
    const parsed = new URL(rawUrl)
    if (parsed.protocol !== 'https:') return null

    const configuredSupabaseUrl = getSupabaseUrl()
    const configuredHost = configuredSupabaseUrl ? new URL(configuredSupabaseUrl).hostname : ''
    const isSupabaseHost =
      (configuredHost && parsed.hostname === configuredHost) ||
      parsed.hostname.endsWith('.supabase.co')

    if (!isSupabaseHost) return null
    if (!parsed.pathname.includes('/storage/v1/object/')) return null

    const extracted = cleanStoragePath(rawUrl)
    return isSafeBrandingStoragePath(extracted) ? extracted : null
  } catch {
    return null
  }
}

function isAllowedLegacyFirebaseBrandingUrl(rawUrl: string, allowedBuckets: string[]): boolean {
  try {
    const parsed = new URL(rawUrl)
    if (parsed.protocol !== 'https:') return false

    if (parsed.hostname === 'firebasestorage.googleapis.com') {
      const match = parsed.pathname.match(/^\/v0\/b\/([^/]+)\/o\/(.+)$/)
      if (!match) return false
      const bucket = decodeURIComponent(match[1])
      const objPath = decodeURIComponent(match[2])
      if (allowedBuckets.length > 0 && !allowedBuckets.includes(bucket)) {
        return false
      }
      return isSafeBrandingStoragePath(objPath)
    }

    if (parsed.hostname === 'storage.googleapis.com') {
      const parts = parsed.pathname.replace(/^\/+/, '').split('/')
      const bucket = parts[0] || ''
      const objPath = parts.slice(1).join('/')
      if (allowedBuckets.length > 0 && !allowedBuckets.includes(bucket)) {
        return false
      }
      return isSafeBrandingStoragePath(objPath)
    }

    return false
  } catch {
    return false
  }
}

function buildImageResponseHeaders(contentType: string, immutable = false): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': contentType,
    'Cache-Control': immutable ? 'public, max-age=31536000, immutable' : 'public, max-age=3600',
    'X-Content-Type-Options': 'nosniff',
  }
  if (contentType.toLowerCase().includes('svg')) {
    headers['Content-Security-Policy'] = "default-src 'none'; style-src 'unsafe-inline'; sandbox"
  }
  return headers
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const targetUrl = searchParams.get('url') || ''
  const storagePathParam = searchParams.get('path') || ''

  try {
    // 1. Primary: Stream directly from Supabase Storage 'Delivery files' bucket or local fallback by storagePath
    if (storagePathParam && isSafeBrandingStoragePath(storagePathParam)) {
      if (isSupabaseConfigured()) {
        const asset = await downloadBrandingAssetFromSupabase(storagePathParam)
        if (asset) {
          return new NextResponse(new Uint8Array(asset.buffer), {
            status: 200,
            headers: buildImageResponseHeaders(asset.contentType, true),
          })
        }
      }

      const localAsset = await readLocalBrandingAsset(storagePathParam)
      if (localAsset) {
        return new NextResponse(new Uint8Array(localAsset.buffer), {
          status: 200,
          headers: buildImageResponseHeaders(localAsset.contentType, true),
        })
      }
    }

    // 2. If ?url= points to Supabase Storage ('Delivery files' -> invoice-branding/* or branding/*), stream it
    if (targetUrl) {
      const supabasePath = extractSafeSupabaseBrandingPath(targetUrl)
      if (supabasePath) {
        if (isSupabaseConfigured()) {
          const asset = await downloadBrandingAssetFromSupabase(supabasePath)
          if (asset) {
            return new NextResponse(new Uint8Array(asset.buffer), {
              status: 200,
              headers: buildImageResponseHeaders(asset.contentType, true),
            })
          }
        }

        const localAsset = await readLocalBrandingAsset(supabasePath)
        if (localAsset) {
          return new NextResponse(new Uint8Array(localAsset.buffer), {
            status: 200,
            headers: buildImageResponseHeaders(localAsset.contentType, true),
          })
        }

        // Direct fetch fallback if URL already carries a valid Supabase token
        const upstream = await fetch(targetUrl, { cache: 'no-store' })
        const contentType = upstream.headers.get('content-type') || 'image/png'
        if (upstream.ok && contentType.startsWith('image/')) {
          const bytes = Buffer.from(await upstream.arrayBuffer())
          return new NextResponse(new Uint8Array(bytes), {
            status: 200,
            headers: buildImageResponseHeaders(contentType, false),
          })
        }
      }

      // 3. Legacy Firebase Storage branding URL support (SSRF-restricted to project buckets & branding prefix)
      const allowedBuckets = getCandidateStorageBuckets()
      if (isAllowedLegacyFirebaseBrandingUrl(targetUrl, allowedBuckets)) {
        const upstream = await fetch(targetUrl, { cache: 'no-store' })
        const contentType = upstream.headers.get('content-type') || 'image/png'
        if (upstream.ok && contentType.startsWith('image/')) {
          const bytes = Buffer.from(await upstream.arrayBuffer())
          return new NextResponse(new Uint8Array(bytes), {
            status: 200,
            headers: buildImageResponseHeaders(contentType, false),
          })
        }
      }
    }

    return NextResponse.json({ error: 'Branding image not found.' }, { status: 404 })
  } catch (err: any) {
    console.warn('[Branding Image Proxy Warning]:', err?.message)
    return NextResponse.json({ error: 'Unable to load branding image.' }, { status: 500 })
  }
}

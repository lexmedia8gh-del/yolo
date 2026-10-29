import { NextRequest, NextResponse } from 'next/server'
import { getAdminStorage, getCandidateStorageBuckets, hasAdminCredentials } from '@/lib/firebase/admin'

export const dynamic = 'force-dynamic'

function isAllowedFirebaseStorageUrl(rawUrl: string, allowedBuckets: string[]): boolean {
  try {
    const parsed = new URL(rawUrl)
    if (parsed.protocol !== 'https:') return false

    if (parsed.hostname === 'firebasestorage.googleapis.com') {
      // Expected format: /v0/b/{bucket}/o/{encodedObjectPath}
      const match = parsed.pathname.match(/^\/v0\/b\/([^/]+)\/o\/(.+)$/)
      if (!match) return false
      const bucket = decodeURIComponent(match[1])
      const objPath = decodeURIComponent(match[2])
      if (allowedBuckets.length > 0 && !allowedBuckets.includes(bucket)) {
        return false
      }
      return objPath.startsWith('invoice-branding/') || objPath.startsWith('branding/')
    }

    if (parsed.hostname === 'storage.googleapis.com') {
      const parts = parsed.pathname.replace(/^\/+/, '').split('/')
      const bucket = parts[0] || ''
      const objPath = parts.slice(1).join('/')
      if (allowedBuckets.length > 0 && !allowedBuckets.includes(bucket)) {
        return false
      }
      return objPath.startsWith('invoice-branding/') || objPath.startsWith('branding/')
    }

    return false
  } catch {
    return false
  }
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const targetUrl = searchParams.get('url') || ''
  const storagePath = searchParams.get('path') || ''

  const allowedBuckets = getCandidateStorageBuckets()

  try {
    // 1. Fetch via validated Firebase Storage download URL
    if (targetUrl && isAllowedFirebaseStorageUrl(targetUrl, allowedBuckets)) {
      const upstream = await fetch(targetUrl, { cache: 'no-store' })
      if (upstream.ok) {
        const contentType = upstream.headers.get('content-type') || 'image/png'
        if (contentType.startsWith('image/')) {
          const bytes = Buffer.from(await upstream.arrayBuffer())
          return new NextResponse(new Uint8Array(bytes), {
            status: 200,
            headers: {
              'Content-Type': contentType,
              'Cache-Control': 'public, max-age=3600',
            },
          })
        }
      }
    }

    // 2. Fallback: stream directly from Firebase Admin Storage by storagePath
    if (
      storagePath &&
      !storagePath.includes('..') &&
      (storagePath.startsWith('invoice-branding/') || storagePath.startsWith('branding/')) &&
      (hasAdminCredentials() || process.env.GOOGLE_APPLICATION_CREDENTIALS)
    ) {
      const adminStorage = getAdminStorage()
      for (const bucketName of allowedBuckets) {
        try {
          const fileRef = adminStorage.bucket(bucketName).file(storagePath)
          const [exists] = await fileRef.exists()
          if (exists) {
            const [metadata] = await fileRef.getMetadata()
            const [fileBuffer] = await fileRef.download()
            const contentType = metadata.contentType || 'image/png'
            return new NextResponse(new Uint8Array(fileBuffer), {
              status: 200,
              headers: {
                'Content-Type': contentType,
                'Cache-Control': 'public, max-age=3600',
              },
            })
          }
        } catch {}
      }
    }

    return NextResponse.json({ error: 'Branding image not found.' }, { status: 404 })
  } catch (err: any) {
    console.warn('[Branding Image Proxy Warning]:', err?.message)
    return NextResponse.json({ error: 'Unable to load branding image.' }, { status: 500 })
  }
}

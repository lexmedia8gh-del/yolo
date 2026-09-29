import { NextRequest, NextResponse } from 'next/server'
import { getAdminDb } from '@/lib/firebase/admin'
import { COLLECTIONS } from '@/lib/firebase/firestore'
import { db } from '@/lib/firebase/config'
import { collection, query, where, getDocs, Timestamp as ClientTimestamp } from 'firebase/firestore'
import { Timestamp as AdminTimestamp } from 'firebase-admin/firestore'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { cleanStoragePath, KNOWN_STORAGE_BUCKETS, STORAGE_BUCKETS } from '@/lib/supabase/storage'
import { isSupabaseConfigured } from '@/lib/supabase/client'

export const dynamic = 'force-dynamic'

function parseExpirationDate(expiresAt: any): Date | null {
  if (!expiresAt) return null
  if (expiresAt instanceof AdminTimestamp || expiresAt instanceof ClientTimestamp) {
    return expiresAt.toDate()
  }
  if (typeof expiresAt.toDate === 'function') {
    return expiresAt.toDate()
  }
  if (expiresAt.seconds) {
    return new Date(expiresAt.seconds * 1000)
  }
  const parsed = new Date(expiresAt)
  return isNaN(parsed.getTime()) ? null : parsed
}

function inferMimeType(fileName: string, rawType?: string): string {
  if (rawType && rawType !== 'application/octet-stream' && rawType.trim() !== '') {
    return rawType.toLowerCase()
  }
  const ext = fileName.split('.').pop()?.toLowerCase() || ''
  switch (ext) {
    case 'png':
      return 'image/png'
    case 'jpg':
    case 'jpeg':
      return 'image/jpeg'
    case 'webp':
      return 'image/webp'
    case 'gif':
      return 'image/gif'
    case 'svg':
      return 'image/svg+xml'
    case 'bmp':
      return 'image/bmp'
    case 'avif':
      return 'image/avif'
    case 'ico':
      return 'image/x-icon'
    case 'mp4':
      return 'video/mp4'
    case 'mov':
      return 'video/quicktime'
    case 'webm':
      return 'video/webm'
    case 'mp3':
      return 'audio/mpeg'
    case 'wav':
      return 'audio/wav'
    case 'pdf':
      return 'application/pdf'
    default:
      return rawType || 'application/octet-stream'
  }
}

export async function GET(
  req: NextRequest,
  { params }: { params: { token: string } | Promise<{ token: string }> }
) {
  try {
    const resolvedParams = await Promise.resolve(params)
    const rawToken = resolvedParams?.token
    const token = decodeURIComponent(rawToken || '').trim()

    if (!token) {
      return NextResponse.json({ error: 'Missing preview token' }, { status: 400 })
    }

    const { searchParams } = new URL(req.url)
    const assetId = searchParams.get('id') || searchParams.get('assetId')
    const assetIndexStr = searchParams.get('idx') || searchParams.get('index')
    const rawPath = searchParams.get('path')

    let previewDoc: any = null

    // 1. Fetch preview from Admin DB
    try {
      const adminDb = getAdminDb()
      const snap = await adminDb
        .collection(COLLECTIONS.CLIENT_PREVIEWS)
        .where('token', '==', token)
        .limit(1)
        .get()

      if (!snap.empty) {
        previewDoc = snap.docs[0].data()
      } else {
        const byId = await adminDb.collection(COLLECTIONS.CLIENT_PREVIEWS).doc(token).get()
        if (byId.exists) {
          previewDoc = byId.data()
        }
      }
    } catch {
      // Client Firestore fallback
      try {
        const previewsRef = collection(db, COLLECTIONS.CLIENT_PREVIEWS)
        const q = query(previewsRef, where('token', '==', token))
        const snap = await getDocs(q)
        if (!snap.empty) {
          previewDoc = snap.docs[0].data()
        }
      } catch {}
    }

    if (!previewDoc) {
      return NextResponse.json(
        { error: 'Preview not found or invalid' },
        { status: 404 }
      )
    }

    // 2. Validate revocation
    if (previewDoc.status === 'Revoked') {
      return NextResponse.json(
        { error: 'Preview access has been revoked' },
        { status: 403 }
      )
    }

    // 3. Validate expiration
    const expiresDate = parseExpirationDate(previewDoc.expiresAt)
    const isPastExpiration = expiresDate !== null && expiresDate.getTime() <= Date.now()
    if (previewDoc.status === 'Expired' || isPastExpiration) {
      return NextResponse.json(
        { error: 'Preview has expired' },
        { status: 410 }
      )
    }

    // 4. Find requested asset
    const assets: any[] = Array.isArray(previewDoc.assets) ? previewDoc.assets : []
    let targetAsset: any = null

    if (assetId) {
      targetAsset = assets.find((a: any) => a.id === assetId)
    }

    if (!targetAsset && assetIndexStr !== null && assetIndexStr !== undefined) {
      const idx = parseInt(assetIndexStr, 10)
      if (!isNaN(idx) && idx >= 0 && idx < assets.length) {
        targetAsset = assets[idx]
      }
    }

    if (!targetAsset && rawPath) {
      const cleanReqPath = cleanStoragePath(rawPath)
      targetAsset = assets.find((a: any) => cleanStoragePath(a.storagePath || a.path || '') === cleanReqPath)
    }

    if (!targetAsset && assets.length > 0) {
      targetAsset = assets[0]
    }

    if (!targetAsset) {
      return NextResponse.json(
        { error: 'Requested preview asset not found' },
        { status: 404 }
      )
    }

    const storagePath = cleanStoragePath(targetAsset.storagePath || targetAsset.path || rawPath || '')
    const fileName = targetAsset.name || targetAsset.originalName || 'preview-asset'
    const mimeType = inferMimeType(fileName, targetAsset.fileType)

    // Safe Development Diagnostics & Structured Logging (Step 5)
    const hasConfig = isSupabaseConfigured()
    console.log('[PREVIEW DEBUG]:', {
      previewId: previewDoc.id || token,
      projectId: previewDoc.projectId || 'general',
      clientId: previewDoc.clientId || 'client',
      fileId: targetAsset.id || 'asset_0',
      bucket: STORAGE_BUCKETS.DELIVERY_FILES,
      storagePath,
      mimeType,
      objectExists: Boolean(targetAsset),
      signedUrlGenerated: Boolean(targetAsset.previewUrl),
      signedUrlExpiresAt: previewDoc.expiresAt || null,
    })

    // 5. Try downloading from Supabase Storage
    if (storagePath && hasConfig) {
      const supabase = getSupabaseServerClient()

      for (const bucket of KNOWN_STORAGE_BUCKETS) {
        try {
          const { data: fileBlob, error: downloadError } = await supabase.storage
            .from(bucket)
            .download(storagePath)

          if (fileBlob && !downloadError) {
            const buffer = Buffer.from(await fileBlob.arrayBuffer())
            console.log('[Secure Storage Stream Success]:', {
              bucket,
              storagePath,
              bytesReceived: buffer.length,
              status: 200,
              mimeType,
            })
            return new NextResponse(new Uint8Array(buffer), {
              status: 200,
              headers: {
                'Content-Type': mimeType,
                'Content-Disposition': `inline; filename="${encodeURIComponent(fileName)}"`,
                'Content-Length': buffer.length.toString(),
                'Cache-Control': 'private, no-transform, max-age=3600',
                'X-Content-Type-Options': 'nosniff',
              },
            })
          }

          // Try signed URL redirect or stream
          const { data: signedData, error: signError } = await supabase.storage
            .from(bucket)
            .createSignedUrl(storagePath, 10800)

          if (signedData?.signedUrl) {
            const urlObj = new URL(signedData.signedUrl)
            console.log('[Secure Storage Signed URL Generated]:', {
              bucket,
              storagePath,
              hostname: urlObj.hostname,
            })

            const signedRes = await fetch(signedData.signedUrl)
            const cType = signedRes.headers.get('content-type') || ''
            if (signedRes.ok && !cType.includes('application/json')) {
              const buffer = Buffer.from(await signedRes.arrayBuffer())
              return new NextResponse(new Uint8Array(buffer), {
                status: 200,
                headers: {
                  'Content-Type': mimeType,
                  'Content-Disposition': `inline; filename="${encodeURIComponent(fileName)}"`,
                  'Content-Length': buffer.length.toString(),
                  'Cache-Control': 'private, no-transform, max-age=3600',
                  'X-Content-Type-Options': 'nosniff',
                },
              })
            }
          }
        } catch (bucketErr: any) {
          console.warn('[Secure Storage Bucket Probe]:', {
            bucket,
            storagePath,
            error: bucketErr?.message,
          })
        }
      }
    }

    // 6. Direct external URL fetch fallback (if asset has direct preview/download URL)
    const directUrl = targetAsset.previewUrl || targetAsset.url || targetAsset.downloadUrl
    if (directUrl && typeof directUrl === 'string' && directUrl.startsWith('http')) {
      try {
        const fetchedRes = await fetch(directUrl)
        if (fetchedRes.ok) {
          const buffer = Buffer.from(await fetchedRes.arrayBuffer())
          return new NextResponse(new Uint8Array(buffer), {
            status: 200,
            headers: {
              'Content-Type': mimeType,
              'Content-Disposition': `inline; filename="${encodeURIComponent(fileName)}"`,
              'Content-Length': buffer.length.toString(),
              'Cache-Control': 'private, no-transform, max-age=3600',
              'X-Content-Type-Options': 'nosniff',
            },
          })
        }
      } catch {}
    }

    // 7. Local filesystem fallback for dev/sandbox persistence
    if (storagePath) {
      try {
        const fs = await import('fs')
        const path = await import('path')
        const localFilePath = path.join(process.cwd(), 'public', 'uploads', storagePath)
        if (fs.existsSync(localFilePath)) {
          const buffer = await fs.promises.readFile(localFilePath)
          console.log('[Secure Storage Stream Local Fallback Success]:', {
            storagePath,
            bytesReceived: buffer.length,
            status: 200,
            mimeType,
          })
          return new NextResponse(new Uint8Array(buffer), {
            status: 200,
            headers: {
              'Content-Type': mimeType,
              'Content-Disposition': `inline; filename="${encodeURIComponent(fileName)}"`,
              'Content-Length': buffer.length.toString(),
              'Cache-Control': 'private, no-transform, max-age=3600',
              'X-Content-Type-Options': 'nosniff',
            },
          })
        }
      } catch {}
    }

    return NextResponse.json(
      {
        success: false,
        code: 'PREVIEW_ASSET_UNAVAILABLE',
        error: 'Preview asset could not be prepared.',
      },
      { status: 404 }
    )
  } catch (err: any) {
    console.error('[Client Preview Asset Stream Error]:', err)
    return NextResponse.json(
      { error: 'Failed to process asset preview' },
      { status: 500 }
    )
  }
}

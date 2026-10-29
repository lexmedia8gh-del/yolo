import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { getAdminDb, hasAdminCredentials, requireAdmin } from '@/lib/firebase/admin'
import { COLLECTIONS } from '@/lib/firebase/firestore'
import { isSupabaseConfigured, getSupabaseConfigStatus } from '@/lib/supabase/client'
import {
  STORAGE_BUCKETS,
  deleteBrandingAssetFromSupabase,
  isSafeBrandingStoragePath,
  uploadBrandingAssetToSupabase,
} from '@/lib/supabase/storage'

export const dynamic = 'force-dynamic'

const MAX_LOGO_BYTES = 5 * 1024 * 1024 // 5 MB
const MAX_FAVICON_BYTES = 2 * 1024 * 1024 // 2 MB

const ALLOWED_LOGO_TYPES: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/svg+xml': 'svg',
}

const ALLOWED_FAVICON_TYPES: Record<string, string> = {
  ...ALLOWED_LOGO_TYPES,
  'image/x-icon': 'ico',
  'image/vnd.microsoft.icon': 'ico',
}

type BrandingFieldKey = 'logo' | 'logoLight' | 'favicon'

function resolveFieldKey(raw: string | null): BrandingFieldKey {
  if (raw === 'logoLight' || raw === 'favicon') return raw
  return 'logo'
}

function getFirestoreFieldPair(fieldKey: BrandingFieldKey): {
  urlField: 'logoUrl' | 'logoLightUrl' | 'faviconUrl'
  pathField: 'logoStoragePath' | 'logoLightStoragePath' | 'faviconStoragePath'
} {
  switch (fieldKey) {
    case 'logoLight':
      return { urlField: 'logoLightUrl', pathField: 'logoLightStoragePath' }
    case 'favicon':
      return { urlField: 'faviconUrl', pathField: 'faviconStoragePath' }
    default:
      return { urlField: 'logoUrl', pathField: 'logoStoragePath' }
  }
}

function verifyMagicBytes(buffer: Buffer, mimeType: string): boolean {
  if (buffer.length < 12) return false

  if (mimeType === 'image/png') {
    return (
      buffer[0] === 0x89 &&
      buffer[1] === 0x50 &&
      buffer[2] === 0x4e &&
      buffer[3] === 0x47 &&
      buffer[4] === 0x0d &&
      buffer[5] === 0x0a &&
      buffer[6] === 0x1a &&
      buffer[7] === 0x0a
    )
  }

  if (mimeType === 'image/jpeg') {
    return buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff
  }

  if (mimeType === 'image/webp') {
    return (
      buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
      buffer.subarray(8, 12).toString('ascii') === 'WEBP'
    )
  }

  if (mimeType === 'image/svg+xml') {
    const sample = buffer.subarray(0, Math.min(buffer.length, 65536)).toString('utf8')
    const hasSvgRoot = /<svg[\s>]/i.test(sample)
    const hasUnsafeMarkup =
      /<script[\s>]/i.test(sample) ||
      /<foreignobject[\s>]/i.test(sample) ||
      /javascript:/i.test(sample) ||
      /\son[a-z]+\s*=/i.test(sample)
    return hasSvgRoot && !hasUnsafeMarkup
  }

  if (mimeType === 'image/x-icon' || mimeType === 'image/vnd.microsoft.icon') {
    return (
      buffer[0] === 0x00 &&
      buffer[1] === 0x00 &&
      (buffer[2] === 0x01 || buffer[2] === 0x02) &&
      buffer[3] === 0x00
    )
  }

  return false
}

export async function POST(req: NextRequest) {
  // 1. Require authorized administrator session
  const authResult = await requireAdmin(req)
  if (!authResult.ok) {
    return NextResponse.json({ error: authResult.error }, { status: authResult.status })
  }

  try {
    const formData = await req.formData()
    const file = formData.get('file') as File | null
    const fieldKey = resolveFieldKey(formData.get('fieldKey') as string | null)
    const persistSettings = (formData.get('persistSettings') as string | null) !== 'false'
    const previousStoragePathParam = (formData.get('previousStoragePath') as string | null) || ''

    if (!file || typeof file.arrayBuffer !== 'function') {
      return NextResponse.json(
        { error: 'Please select an image file to upload.' },
        { status: 400 }
      )
    }

    const allowedMap = fieldKey === 'favicon' ? ALLOWED_FAVICON_TYPES : ALLOWED_LOGO_TYPES
    const normalizedType = (file.type || '').toLowerCase().trim()

    if (!allowedMap[normalizedType]) {
      return NextResponse.json(
        {
          error:
            fieldKey === 'favicon'
              ? 'Unsupported file type. Please upload a PNG, JPEG, WebP, SVG, or ICO image.'
              : 'Unsupported file type. Please upload a PNG, JPEG, WebP, or SVG image.',
        },
        { status: 400 }
      )
    }

    const maxBytes = fieldKey === 'favicon' ? MAX_FAVICON_BYTES : MAX_LOGO_BYTES
    const maxMB = fieldKey === 'favicon' ? 2 : 5
    if (file.size <= 0) {
      return NextResponse.json({ error: 'Selected image file is empty.' }, { status: 400 })
    }
    if (file.size > maxBytes) {
      return NextResponse.json(
        { error: `Image exceeds the ${maxMB}MB size limit. Please choose a smaller file.` },
        { status: 400 }
      )
    }

    const buffer = Buffer.from(await file.arrayBuffer())
    if (!verifyMagicBytes(buffer, normalizedType)) {
      return NextResponse.json(
        {
          error:
            'Invalid or unsafe image file. Please upload a valid PNG, JPEG, WebP, or SVG image.',
        },
        { status: 400 }
      )
    }

    // 2. Verify Supabase Storage ('Delivery files' bucket) configuration
    if (!isSupabaseConfigured()) {
      const status = getSupabaseConfigStatus()
      return NextResponse.json(
        {
          error:
            status.error ||
            `Supabase Storage is not configured for bucket '${STORAGE_BUCKETS.DELIVERY_FILES}'.`,
          code: 'STORAGE_UNCONFIGURED',
        },
        { status: 503 }
      )
    }

    // 3. Construct dedicated path inside Supabase 'Delivery files' bucket:
    //    invoice-branding/{adminId}/{uniqueFileName}
    const safeAdminId =
      (authResult.uid || 'admin').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 64) || 'admin'
    const ext = allowedMap[normalizedType]
    const rawStem =
      (file.name || 'logo')
        .replace(/\.[^/.]+$/, '')
        .replace(/[^a-zA-Z0-9_-]/g, '_')
        .replace(/_+/g, '_')
        .replace(/^_+|_+$/g, '')
        .slice(0, 48) || 'logo'
    const timestamp = Date.now()
    const randomSuffix = crypto.randomBytes(6).toString('hex')
    const uniqueFileName = `${fieldKey}_${timestamp}_${randomSuffix}_${rawStem}.${ext}`
    const requestedStoragePath = `invoice-branding/${safeAdminId}/${uniqueFileName}`

    // 4. Upload to Supabase Storage bucket 'Delivery files' (never write to read-only local disk)
    const uploadResult = await uploadBrandingAssetToSupabase({
      storagePath: requestedStoragePath,
      file: buffer,
      contentType: normalizedType,
    })

    if (uploadResult.error || !uploadResult.data) {
      console.error('[Branding Upload] Supabase Storage upload failed:', uploadResult.error)
      return NextResponse.json(
        {
          error:
            uploadResult.error?.message ||
            `Failed to upload logo to Supabase bucket '${STORAGE_BUCKETS.DELIVERY_FILES}'.`,
        },
        { status: 500 }
      )
    }

    const storagePath = uploadResult.data.storagePath
    // Permanent same-origin URL backed by Supabase 'Delivery files' bucket:
    // works even when 'Delivery files' is private, never expires, and prevents CORS tainting in PDF generation.
    const downloadUrl = `/api/branding/image?path=${encodeURIComponent(storagePath)}`

    // 5. Persist downloadUrl and storagePath in Firestore settings & remove replaced logo AFTER confirmation
    const { urlField, pathField } = getFirestoreFieldPair(fieldKey)
    let confirmedSettingsPersistence = false
    const oldPathsToCleanup = new Set<string>()
    if (
      isSafeBrandingStoragePath(previousStoragePathParam) &&
      previousStoragePathParam !== storagePath
    ) {
      oldPathsToCleanup.add(previousStoragePathParam)
    }

    if (
      persistSettings &&
      (hasAdminCredentials() || Boolean(process.env.GOOGLE_APPLICATION_CREDENTIALS))
    ) {
      try {
        const adminDb = getAdminDb()
        const brandingRef = adminDb.collection(COLLECTIONS.SETTINGS).doc('branding')
        const businessRef = adminDb.collection(COLLECTIONS.SETTINGS).doc('business')

        const [existingBrandingSnap, existingBusinessSnap] = await Promise.all([
          brandingRef.get(),
          fieldKey === 'logo' ? businessRef.get() : Promise.resolve(null),
        ])

        const prevBrandingPath = existingBrandingSnap.exists
          ? (existingBrandingSnap.data()?.[pathField] as string | undefined)
          : undefined
        if (isSafeBrandingStoragePath(prevBrandingPath) && prevBrandingPath !== storagePath) {
          oldPathsToCleanup.add(prevBrandingPath)
        }

        if (existingBusinessSnap && existingBusinessSnap.exists) {
          const prevBusinessPath = existingBusinessSnap.data()?.logoStoragePath as
            | string
            | undefined
          if (isSafeBrandingStoragePath(prevBusinessPath) && prevBusinessPath !== storagePath) {
            oldPathsToCleanup.add(prevBusinessPath)
          }
        }

        const nowIso = new Date().toISOString()
        const writes: Promise<unknown>[] = [
          brandingRef.set(
            {
              [urlField]: downloadUrl,
              [pathField]: storagePath,
              updatedAt: nowIso,
              updatedBy: authResult.uid,
            },
            { merge: true }
          ),
        ]

        if (fieldKey === 'logo') {
          writes.push(
            businessRef.set(
              {
                logoURL: downloadUrl,
                logoStoragePath: storagePath,
                updatedAt: nowIso,
                updatedBy: authResult.uid,
              },
              { merge: true }
            )
          )
        }

        await Promise.all(writes)
        confirmedSettingsPersistence = true

        // Delete old stored logo(s) from Supabase 'Delivery files' ONLY after new upload + Firestore update succeeded
        for (const oldPath of Array.from(oldPathsToCleanup)) {
          await deleteBrandingAssetFromSupabase(oldPath)
        }
      } catch (dbErr: any) {
        console.warn(
          '[Branding Upload] Server Firestore sync warning (client SDK will sync):',
          dbErr?.message
        )
      }
    }

    return NextResponse.json({
      success: true,
      downloadUrl,
      storagePath,
      bucket: uploadResult.data.bucket,
      persisted: confirmedSettingsPersistence,
    })
  } catch (error: any) {
    console.error('[API Branding Upload Error]:', error)
    return NextResponse.json(
      { error: error?.message || 'Logo upload failed. Please try again.' },
      { status: 500 }
    )
  }
}

export async function DELETE(req: NextRequest) {
  const authResult = await requireAdmin(req)
  if (!authResult.ok) {
    return NextResponse.json({ error: authResult.error }, { status: authResult.status })
  }

  try {
    const body = await req.json().catch(() => ({}))
    const fieldKey = resolveFieldKey(body?.fieldKey || 'logo')
    const persistSettings = body?.persistSettings !== false
    const requestedPath = typeof body?.storagePath === 'string' ? body.storagePath : ''

    const pathsToDelete = new Set<string>()
    if (isSafeBrandingStoragePath(requestedPath)) {
      pathsToDelete.add(requestedPath)
    }

    if (
      persistSettings &&
      (hasAdminCredentials() || Boolean(process.env.GOOGLE_APPLICATION_CREDENTIALS))
    ) {
      const adminDb = getAdminDb()
      const { urlField, pathField } = getFirestoreFieldPair(fieldKey)
      const brandingRef = adminDb.collection(COLLECTIONS.SETTINGS).doc('branding')
      const businessRef = adminDb.collection(COLLECTIONS.SETTINGS).doc('business')

      const [brandingSnap, businessSnap] = await Promise.all([
        brandingRef.get(),
        fieldKey === 'logo' ? businessRef.get() : Promise.resolve(null),
      ])

      const storedBrandPath = brandingSnap.exists ? brandingSnap.data()?.[pathField] : undefined
      if (isSafeBrandingStoragePath(storedBrandPath)) {
        pathsToDelete.add(storedBrandPath)
      }

      if (businessSnap && businessSnap.exists) {
        const storedBizPath = businessSnap.data()?.logoStoragePath
        if (isSafeBrandingStoragePath(storedBizPath)) {
          pathsToDelete.add(storedBizPath)
        }
      }

      const nowIso = new Date().toISOString()
      const updates: Promise<unknown>[] = [
        brandingRef.set(
          {
            [urlField]: '',
            [pathField]: '',
            updatedAt: nowIso,
            updatedBy: authResult.uid,
          },
          { merge: true }
        ),
      ]

      if (fieldKey === 'logo') {
        updates.push(
          businessRef.set(
            {
              logoURL: '',
              logoStoragePath: '',
              updatedAt: nowIso,
              updatedBy: authResult.uid,
            },
            { merge: true }
          )
        )
      }

      await Promise.all(updates)
    }

    if (isSupabaseConfigured()) {
      for (const p of Array.from(pathsToDelete)) {
        await deleteBrandingAssetFromSupabase(p)
      }
    }

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('[API Branding Delete Error]:', error)
    return NextResponse.json(
      { error: error?.message || 'Failed to remove logo.' },
      { status: 500 }
    )
  }
}

import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import {
  getAdminDb,
  getAdminStorage,
  getCandidateStorageBuckets,
  hasAdminCredentials,
  requireAdmin,
} from '@/lib/firebase/admin'
import { COLLECTIONS } from '@/lib/firebase/firestore'

export const dynamic = 'force-dynamic'

const MAX_LOGO_BYTES = 5 * 1024 * 1024 // 5 MB
const MAX_FAVICON_BYTES = 2 * 1024 * 1024 // 2 MB

const ALLOWED_LOGO_TYPES: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
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
    // 89 50 4E 47 0D 0A 1A 0A
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
    // FF D8 FF
    return buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff
  }

  if (mimeType === 'image/webp') {
    // "RIFF" .... "WEBP"
    return (
      buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
      buffer.subarray(8, 12).toString('ascii') === 'WEBP'
    )
  }

  if (mimeType === 'image/x-icon' || mimeType === 'image/vnd.microsoft.icon') {
    return buffer[0] === 0x00 && buffer[1] === 0x00 && (buffer[2] === 0x01 || buffer[2] === 0x02) && buffer[3] === 0x00
  }

  return false
}

function isSafeBrandingStoragePath(storagePath?: string | null): storagePath is string {
  if (!storagePath || typeof storagePath !== 'string') return false
  const normalized = storagePath.trim()
  if (!normalized || normalized.includes('..') || normalized.startsWith('/')) return false
  return normalized.startsWith('invoice-branding/') || normalized.startsWith('branding/')
}

async function deleteStoredBrandingObject(storagePath: string): Promise<void> {
  if (!isSafeBrandingStoragePath(storagePath)) return
  const adminStorage = getAdminStorage()
  const buckets = getCandidateStorageBuckets()
  for (const bucketName of buckets) {
    try {
      const fileRef = adminStorage.bucket(bucketName).file(storagePath)
      const [exists] = await fileRef.exists()
      if (exists) {
        await fileRef.delete()
        return
      }
    } catch (err: any) {
      console.warn(`[Branding Storage Cleanup] Could not remove ${storagePath} from ${bucketName}:`, err?.message)
    }
  }
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
      return NextResponse.json({ error: 'Please select an image file to upload.' }, { status: 400 })
    }

    const allowedMap = fieldKey === 'favicon' ? ALLOWED_FAVICON_TYPES : ALLOWED_LOGO_TYPES
    const normalizedType = (file.type || '').toLowerCase().trim()

    if (!allowedMap[normalizedType]) {
      return NextResponse.json(
        {
          error:
            fieldKey === 'favicon'
              ? 'Unsupported file type. Please upload a PNG, JPEG, WebP, or ICO image.'
              : 'Unsupported file type. Please upload a PNG, JPEG, or WebP image.',
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
        { error: 'Invalid or corrupted image file. Please upload a valid PNG, JPEG, or WebP image.' },
        { status: 400 }
      )
    }

    if (!hasAdminCredentials() && !process.env.GOOGLE_APPLICATION_CREDENTIALS) {
      return NextResponse.json(
        {
          error:
            'Server Firebase Storage credentials are not configured. Ensure FIREBASE_ADMIN_PROJECT_ID, FIREBASE_ADMIN_CLIENT_EMAIL, FIREBASE_ADMIN_PRIVATE_KEY, and NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET are set.',
          code: 'STORAGE_UNCONFIGURED',
        },
        { status: 503 }
      )
    }

    // 2. Construct dedicated Firebase Storage path: invoice-branding/{adminId}/{uniqueFileName}
    const safeAdminId = (authResult.uid || 'admin').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 64) || 'admin'
    const ext = allowedMap[normalizedType]
    const rawStem = (file.name || 'logo')
      .replace(/\.[^/.]+$/, '')
      .replace(/[^a-zA-Z0-9_-]/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 48) || 'logo'
    const timestamp = Date.now()
    const randomSuffix = crypto.randomBytes(6).toString('hex')
    const uniqueFileName = `${fieldKey}_${timestamp}_${randomSuffix}_${rawStem}.${ext}`
    const storagePath = `invoice-branding/${safeAdminId}/${uniqueFileName}`
    const downloadToken = crypto.randomUUID()

    // 3. Upload to existing Firebase Storage bucket (never write to local filesystem)
    const adminStorage = getAdminStorage()
    const candidateBuckets = getCandidateStorageBuckets()
    if (candidateBuckets.length === 0) {
      return NextResponse.json(
        { error: 'Firebase Storage bucket is not configured.', code: 'STORAGE_UNCONFIGURED' },
        { status: 503 }
      )
    }

    let uploadedBucket = ''
    let lastStorageError: any = null

    for (const bucketName of candidateBuckets) {
      try {
        const bucket = adminStorage.bucket(bucketName)
        const storageFile = bucket.file(storagePath)

        await storageFile.save(buffer, {
          resumable: false,
          contentType: normalizedType,
          metadata: {
            contentType: normalizedType,
            cacheControl: 'public, max-age=31536000, immutable',
            metadata: {
              firebaseStorageDownloadTokens: downloadToken,
              uploadedBy: authResult.uid,
              uploadedByEmail: authResult.email || '',
              fieldKey,
            },
          },
        })

        uploadedBucket = bucket.name
        break
      } catch (err: any) {
        lastStorageError = err
        const msg = String(err?.message || '').toLowerCase()
        const isMissingBucket =
          err?.code === 404 ||
          msg.includes('not found') ||
          msg.includes('no such bucket') ||
          msg.includes('does not exist')
        if (!isMissingBucket) {
          break
        }
      }
    }

    if (!uploadedBucket) {
      console.error('[Branding Upload] Firebase Storage upload failed:', lastStorageError)
      return NextResponse.json(
        {
          error:
            lastStorageError?.message ||
            'Failed to upload logo to Firebase Storage. Please verify your Firebase Storage bucket configuration.',
        },
        { status: 500 }
      )
    }

    const downloadUrl = `https://firebasestorage.googleapis.com/v0/b/${encodeURIComponent(
      uploadedBucket
    )}/o/${encodeURIComponent(storagePath)}?alt=media&token=${downloadToken}`

    // 4. Persist downloadUrl and storagePath in Firestore settings & clean up old stored file AFTER confirmation
    const { urlField, pathField } = getFirestoreFieldPair(fieldKey)
    let confirmedSettingsPersistence = false
    const oldPathsToCleanup = new Set<string>()
    if (isSafeBrandingStoragePath(previousStoragePathParam) && previousStoragePathParam !== storagePath) {
      oldPathsToCleanup.add(previousStoragePathParam)
    }

    if (persistSettings) {
      const adminDb = getAdminDb()
      const brandingRef = adminDb.collection(COLLECTIONS.SETTINGS).doc('branding')
      const businessRef = adminDb.collection(COLLECTIONS.SETTINGS).doc('business')

      // Capture existing storagePath(s) prior to updating Firestore
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
        const prevBusinessPath = existingBusinessSnap.data()?.logoStoragePath as string | undefined
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

      // Remove replaced stored logo(s) ONLY AFTER new upload and Firestore update both succeeded
      for (const oldPath of Array.from(oldPathsToCleanup)) {
        await deleteStoredBrandingObject(oldPath)
      }
    }

    return NextResponse.json({
      success: true,
      downloadUrl,
      storagePath,
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

    if (persistSettings && (hasAdminCredentials() || process.env.GOOGLE_APPLICATION_CREDENTIALS)) {
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

    if (hasAdminCredentials() || process.env.GOOGLE_APPLICATION_CREDENTIALS) {
      for (const p of Array.from(pathsToDelete)) {
        await deleteStoredBrandingObject(p)
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

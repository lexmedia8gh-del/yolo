import { NextRequest, NextResponse } from 'next/server'
import { getAdminDb, getAdminStorage } from '@/lib/firebase/admin'
import { COLLECTIONS } from '@/lib/firebase/firestore'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import fs from 'fs'
import path from 'path'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const fileId = searchParams.get('id')

  if (!fileId) {
    return NextResponse.json({ error: 'Missing file id parameter' }, { status: 400 })
  }

  try {
    const adminDb = getAdminDb()
    let data: any = null

    // 1. Try finding in deliveryFiles collection
    const fileDoc = await adminDb.collection(COLLECTIONS.DELIVERY_FILES).doc(fileId).get()
    if (fileDoc.exists) {
      data = fileDoc.data()
    } else {
      // Search in deliveries collection
      const delivSnap = await adminDb.collection(COLLECTIONS.DELIVERIES).get()
      for (const dDoc of delivSnap.docs) {
        const dData = dDoc.data()
        if (Array.isArray(dData.files)) {
          const matched = dData.files.find((f: any) => f.id === fileId)
          if (matched) {
            data = {
              storagePath: matched.path || matched.storagePath,
              fileName: matched.name || matched.fileName,
              fileType: matched.fileType,
              downloadUrl: matched.url || matched.downloadUrl,
            }
            break
          }
        }
      }
    }

    if (!data) {
      return NextResponse.json(
        { error: 'Unable to download this delivery file. The file may no longer be available.' },
        { status: 404 }
      )
    }

    const storagePath = data.storagePath
    const fileName = data.fileName || 'download'
    const mimeType = data.fileType || 'application/octet-stream'
    const downloadUrl = data.downloadUrl

    // 2. Try downloading from Supabase Storage across known buckets
    if (storagePath) {
      try {
        const supabase = getSupabaseServerClient()
        const buckets = ['Delivery files', 'deliveries', 'delivery-files', 'quick-jobs']
        const pathsToTry = [storagePath, storagePath.replace(/^\/+/, '')]

        for (const b of buckets) {
          for (const p of pathsToTry) {
            try {
              const { data: fileBlob, error: downloadError } = await supabase.storage
                .from(b)
                .download(p)

              if (fileBlob && !downloadError) {
                const fileBuffer = Buffer.from(await fileBlob.arrayBuffer())
                return new NextResponse(new Uint8Array(fileBuffer), {
                  status: 200,
                  headers: {
                    'Content-Type': mimeType,
                    'Content-Disposition': `attachment; filename="${encodeURIComponent(fileName)}"`,
                    'Content-Length': fileBuffer.length.toString(),
                  },
                })
              }
            } catch {}
          }
        }
      } catch (supabaseErr) {
        console.warn('[Storage Server Stream Warning] Failed to fetch from Supabase Storage:', supabaseErr)
      }
    }

    // 3. Try fetching from public/direct downloadUrl if it starts with http(s)
    if (
      downloadUrl &&
      typeof downloadUrl === 'string' &&
      downloadUrl.startsWith('http') &&
      !downloadUrl.includes('localhost') &&
      !downloadUrl.includes('127.0.0.1')
    ) {
      try {
        const fetchedRes = await fetch(downloadUrl)
        if (fetchedRes.ok) {
          const fetchedBuffer = Buffer.from(await fetchedRes.arrayBuffer())
          return new NextResponse(new Uint8Array(fetchedBuffer), {
            status: 200,
            headers: {
              'Content-Type': mimeType,
              'Content-Disposition': `attachment; filename="${encodeURIComponent(fileName)}"`,
              'Content-Length': fetchedBuffer.length.toString(),
            },
          })
        }
      } catch (fetchErr) {
        console.warn('[Storage Server Stream Warning] Failed to fetch from direct downloadUrl:', fetchErr)
      }
    }

    // 4. Try downloading from Firebase Storage
    if (storagePath) {
      try {
        const adminStorage = getAdminStorage()
        const bucket = adminStorage.bucket()
        const file = bucket.file(storagePath)
        const [exists] = await file.exists()
        if (exists) {
          const [fileBuffer] = await file.download()
          return new NextResponse(new Uint8Array(fileBuffer), {
            status: 200,
            headers: {
              'Content-Type': mimeType,
              'Content-Disposition': `attachment; filename="${encodeURIComponent(fileName)}"`,
              'Content-Length': fileBuffer.length.toString(),
            },
          })
        }
      } catch (firebaseErr) {
        console.warn('[Storage Server Stream Warning] Failed to fetch from Firebase Storage:', firebaseErr)
      }
    }

    // 5. Fallback to local filesystem for legacy compatibility
    if (storagePath) {
      const localFilePath = path.join(process.cwd(), 'public', 'uploads', storagePath)
      if (fs.existsSync(localFilePath)) {
        const fileBuffer = await fs.promises.readFile(localFilePath)
        return new NextResponse(new Uint8Array(fileBuffer), {
          status: 200,
          headers: {
            'Content-Type': mimeType,
            'Content-Disposition': `attachment; filename="${encodeURIComponent(fileName)}"`,
            'Content-Length': fileBuffer.length.toString(),
          },
        })
      }
    }

    return NextResponse.json(
      { error: 'Unable to download this delivery file. The file may no longer be available.' },
      { status: 404 }
    )
  } catch (err: any) {
    console.error('File stream error:', err)
    return NextResponse.json(
      { error: 'Unable to download this delivery file. The file may no longer be available.' },
      { status: 500 }
    )
  }
}


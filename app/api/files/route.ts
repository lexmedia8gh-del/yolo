import { NextRequest, NextResponse } from 'next/server'
import { getAdminDb } from '@/lib/firebase/admin'
import { COLLECTIONS } from '@/lib/firebase/firestore'
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
    const fileDoc = await adminDb.collection(COLLECTIONS.DELIVERY_FILES).doc(fileId).get()

    if (!fileDoc.exists) {
      return NextResponse.json({ error: 'File not found' }, { status: 404 })
    }

    const data = fileDoc.data()
    const storagePath = data?.storagePath
    const fileName = data?.fileName || 'download'
    const mimeType = data?.fileType || 'application/octet-stream'

    if (!storagePath) {
      return NextResponse.json({ error: 'Storage path not found' }, { status: 404 })
    }

    const localFilePath = path.join(process.cwd(), 'public', 'uploads', storagePath)

    if (!fs.existsSync(localFilePath)) {
      return NextResponse.json({ error: 'File on disk not found' }, { status: 404 })
    }

    const fileBuffer = await fs.promises.readFile(localFilePath)

    return new NextResponse(fileBuffer, {
      status: 200,
      headers: {
        'Content-Type': mimeType,
        'Content-Disposition': 'inline; filename=\"' + encodeURIComponent(fileName) + '\"',
        'Content-Length': fileBuffer.length.toString(),
      },
    })
  } catch (err: any) {
    console.error('File stream error:', err)
    return NextResponse.json({ error: 'Failed to retrieve file' }, { status: 500 })
  }
}

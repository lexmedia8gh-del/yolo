import { NextRequest, NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData()
    const file = formData.get('file') as File | null
    const fieldKey = (formData.get('fieldKey') as string) || 'logo'

    if (!file) {
      return NextResponse.json({ error: 'Missing file' }, { status: 400 })
    }

    const bytes = await file.arrayBuffer()
    const buffer = Buffer.from(bytes)

    const sanitizedName = file.name.replace(/[^a-zA-Z0-9._\- ]/g, '_').trim() || 'file'
    const timestamp = Date.now()
    
    // Save to local public storage directory: public/uploads/branding/{fieldKey}/{timestamp}_{sanitizedName}
    const relativeStorageDir = path.join('uploads', 'branding', fieldKey)
    const absoluteTargetDir = path.join(process.cwd(), 'public', relativeStorageDir)

    await fs.promises.mkdir(absoluteTargetDir, { recursive: true })
    const filename = `${timestamp}_${sanitizedName}`
    const absoluteFilePath = path.join(absoluteTargetDir, filename)
    
    await fs.promises.writeFile(absoluteFilePath, buffer)

    // Web-accessible URL
    const downloadUrl = `/uploads/branding/${fieldKey}/${filename}`

    return NextResponse.json({
      success: true,
      downloadUrl,
    })
  } catch (error: any) {
    console.error('API branding upload error:', error)
    return NextResponse.json(
      { error: error?.message || 'Server upload failed. Please try again.' },
      { status: 500 }
    )
  }
}

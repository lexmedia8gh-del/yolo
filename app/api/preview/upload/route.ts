import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { cleanStoragePath, STORAGE_BUCKETS } from '@/lib/supabase/storage'
import { isSupabaseConfigured } from '@/lib/supabase/client'
import fs from 'fs'
import path from 'path'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData()
    const file = formData.get('file') as File | null
    const projectId = (formData.get('projectId') as string) || 'general'
    const customPath = (formData.get('path') as string) || ''

    if (!file) {
      return NextResponse.json({ error: 'No file provided for upload' }, { status: 400 })
    }

    const bytes = await file.arrayBuffer()
    const buffer = Buffer.from(bytes)

    const sanitizedName = file.name.replace(/[^a-zA-Z0-9._\-]/g, '_').trim() || 'preview_file'
    const destinationPath = cleanStoragePath(
      customPath || `previews/${projectId}/${Date.now()}_${sanitizedName}`
    )

    let uploadedToSupabase = false
    let finalPath = destinationPath
    let publicUrl = ''

    // 1. Try Supabase Storage upload if configured
    if (isSupabaseConfigured()) {
      try {
        const supabase = getSupabaseServerClient()
        let { data, error } = await supabase.storage
          .from(STORAGE_BUCKETS.DELIVERY_FILES)
          .upload(destinationPath, buffer, {
            contentType: file.type || 'application/octet-stream',
            upsert: true,
          })

        if (
          error &&
          (error.message.toLowerCase().includes('bucket not found') ||
            error.message.toLowerCase().includes('nosuchbucket'))
        ) {
          try {
            await supabase.storage.createBucket(STORAGE_BUCKETS.DELIVERY_FILES, { public: false })
            const retry = await supabase.storage
              .from(STORAGE_BUCKETS.DELIVERY_FILES)
              .upload(destinationPath, buffer, {
                contentType: file.type || 'application/octet-stream',
                upsert: true,
              })
            data = retry.data
            error = retry.error
          } catch {}
        }

        if (!error && data) {
          uploadedToSupabase = true
          finalPath = data.path || destinationPath
          const { data: urlData } = supabase.storage
            .from(STORAGE_BUCKETS.DELIVERY_FILES)
            .getPublicUrl(finalPath)
          publicUrl = urlData?.publicUrl || ''
        }
      } catch (supabaseErr: any) {
        console.warn('[Preview Upload Warning] Supabase storage upload bypassed:', supabaseErr?.message)
      }
    }

    // 2. Always persist locally for offline/sandbox/fallback resiliency
    try {
      const localDir = path.join(process.cwd(), 'public', 'uploads', path.dirname(finalPath))
      await fs.promises.mkdir(localDir, { recursive: true })
      const localFilePath = path.join(process.cwd(), 'public', 'uploads', finalPath)
      await fs.promises.writeFile(localFilePath, buffer)
    } catch (localWriteErr) {
      console.warn('[Preview Upload Local Write Warning]:', localWriteErr)
    }

    return NextResponse.json({
      success: true,
      storagePath: finalPath,
      publicUrl,
      fileName: file.name,
      fileSize: file.size,
      fileType: file.type || 'application/octet-stream',
      uploadedToSupabase,
    })
  } catch (err: any) {
    console.error('[Preview Server Upload Unexpected Error]:', err)
    return NextResponse.json(
      { error: err?.message || 'Server upload failed' },
      { status: 500 }
    )
  }
}

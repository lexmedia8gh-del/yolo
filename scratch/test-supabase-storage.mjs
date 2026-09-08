import { createClient } from '@supabase/supabase-js'
import fs from 'fs'

// Load environments
if (fs.existsSync('.env.local')) {
  const envContent = fs.readFileSync('.env.local', 'utf-8')
  envContent.split('\n').forEach((line) => {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) return
    const eqIdx = trimmed.indexOf('=')
    if (eqIdx > 0) {
      const key = trimmed.slice(0, eqIdx).trim()
      let val = trimmed.slice(eqIdx + 1).trim()
      if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1)
      if (!process.env[key]) process.env[key] = val
    }
  })
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''

console.log('--- Supabase Credentials Diagnostics ---')
console.log('NEXT_PUBLIC_SUPABASE_URL:', supabaseUrl ? `${supabaseUrl.substring(0, 15)}... (len: ${supabaseUrl.length})` : 'MISSING')
console.log('NEXT_PUBLIC_SUPABASE_ANON_KEY:', supabaseAnonKey ? `${supabaseAnonKey.substring(0, 15)}... (len: ${supabaseAnonKey.length})` : 'MISSING')

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('❌ Error: Supabase connection credentials are not configured in your environment.')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseAnonKey)

async function runStorageTest() {
  console.log('\n--- Running ' + 'Delivery files' + ' Storage Bucket Test ---')
  
  try {
    const { data, error } = await supabase.storage.from('Delivery files').list('', { limit: 5 })
    
    if (error) {
      console.error('❌ Supabase list operation returned an error:')
      console.error('Code:', error.name || 'N/A')
      console.error('Message:', error.message)
      console.error('Full Error:', JSON.stringify(error, null, 2))
      process.exit(1)
    }

    console.log('✅ Connection to Supabase storage bucket "Delivery files" established successfully!')
    console.log(`✓ Retreived file list from bucket. Count of objects: ${data.length}`)
    if (data.length > 0) {
      console.log('✓ Sample objects found in root:')
      data.forEach((obj, idx) => {
        console.log(`  [${idx + 1}] Name: ${obj.name} | Size: ${obj.metadata?.size || 'unknown'} bytes | Created: ${obj.created_at}`)
      })
    } else {
      console.log('✓ Bucket is currently empty or has no objects in the root path.')
    }

    // 2. Perform a test write and delete to verify write permissions (RLS verification)
    console.log('\n--- Verifying Write (RLS) Permissions ---')
    const testPath = `system_test_${Date.now()}.txt`
    const testContent = 'Supabase Storage upload integration test verification token: ' + Date.now()
    
    console.log(`Attempting to upload test file: ${testPath}...`)
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('Delivery files')
      .upload(testPath, testContent, {
        contentType: 'text/plain',
        upsert: true
      })

    if (uploadError) {
      console.error('❌ Upload operation blocked or failed:')
      console.error('Message:', uploadError.message)
      console.error('Full Error:', JSON.stringify(uploadError, null, 2))
      console.log('\n💡 Recommendation: Please ensure that storage RLS policies allow SELECT, INSERT, and DELETE access on the "Delivery files" bucket.')
      process.exit(1)
    }

    console.log('✅ Upload succeeded! Test file ID:', uploadData.id)

    console.log(`Attempting to delete test file: ${testPath}...`)
    const { data: deleteData, error: deleteError } = await supabase.storage
      .from('Delivery files')
      .remove([testPath])

    if (deleteError) {
      console.error('⚠️ Delete operation failed (though upload succeeded):')
      console.error('Message:', deleteError.message)
    } else {
      console.log('✅ Test file deleted successfully!')
    }

    console.log('\n🎉 ALL SUPABASE STORAGE TESTS COMPLETED PERFECTLY! 🎉')
  } catch (err) {
    console.error('❌ An unexpected exception occurred during execution:')
    console.error(err)
    process.exit(1)
  }
}

runStorageTest()

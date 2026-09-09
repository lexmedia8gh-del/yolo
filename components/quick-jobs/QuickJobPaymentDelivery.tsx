'use client'

import React, { useState, useEffect } from 'react'
import {
  Link as LinkIcon,
  Copy,
  Send,
  Upload,
  CheckCircle2,
  AlertCircle,
  FileText,
  X,
  CreditCard
} from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { where } from 'firebase/firestore'
import {
  COLLECTIONS,
  addDocument,
  updateDocument,
  getDocuments
} from '@/lib/firebase/firestore'
import { generateSecureToken, getPaymentLink, formatCurrency, copyToClipboard } from '@/lib/utils'
import type { QuickJob, ClientLink } from '@/lib/types'
import toast from 'react-hot-toast'
import { uploadDeliveryFile, deleteDeliveryFile } from '@/lib/firebase/storage'

interface QuickJobPaymentDeliveryProps {
  job: QuickJob
  onUpdate: (updatedData: Partial<QuickJob>) => void
}

export function QuickJobPaymentDelivery({ job, onUpdate }: QuickJobPaymentDeliveryProps) {
  const [isGeneratingLink, setIsGeneratingLink] = useState(false)
  const [paymentLink, setPaymentLink] = useState<string | null>(null)
  
  // Delivery State
  const fileInputRef = React.useRef<HTMLInputElement>(null)
  const [uploadedFiles, setUploadedFiles] = useState<{name: string; url: string; path: string; size: number}[]>([])
  const [isUploading, setIsUploading] = useState(false)
  const [isSendingDelivery, setIsSendingDelivery] = useState(false)

  // Initialize uploaded files if job has them
  useEffect(() => {
    // We could fetch files if we store them in the job object or a subcollection
    // For now we'll just track them locally in the component for the 'Submit & Send' action
    // If they were previously uploaded and sent, we can show that they are sent.
  }, [])

  useEffect(() => {
    // Check if link exists
    const fetchLink = async () => {
      try {
        const links = await getDocuments<ClientLink>(COLLECTIONS.CLIENT_LINKS, [
          where('quickJobId', '==', job.id)
        ])
        if (links && links.length > 0) {
          setPaymentLink(getPaymentLink(links[0].token))
        }
      } catch (err) {
        console.error('Error fetching quick job payment link', err)
      }
    }
    fetchLink()
  }, [job.id])

  const handleGenerateLink = async () => {
    setIsGeneratingLink(true)
    try {
      const token = generateSecureToken('qj_')
      const newLink: Partial<ClientLink> & { token: string } = {
        token,
        clientId: job.clientId,
        clientName: job.clientName,
        quickJobId: job.id,
        amount: job.outstandingBalance || job.originalAgreedPrice,
        currency: job.currency,
        title: `Payment for Quick Job: ${job.jobDescription}`,
      }
      
      await addDocument(COLLECTIONS.CLIENT_LINKS, newLink)
      setPaymentLink(getPaymentLink(token))
      onUpdate({ paymentStatus: 'Payment Link Generated' })
      toast.success('Payment link generated!')
    } catch (err) {
      console.error(err)
      toast.error('Failed to generate payment link')
    } finally {
      setIsGeneratingLink(false)
    }
  }

  const handleCopyLink = () => {
    if (!paymentLink) return
    copyToClipboard(paymentLink)
    onUpdate({ paymentStatus: 'Payment Link Sent' })
    toast.success('Link copied to clipboard')
  }

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    if (files.length === 0) return

    setIsUploading(true)
    try {
      const newUploads: {name: string; url: string; path: string; size: number}[] = []
      for (const file of files) {
        // uploadDeliveryFile(projectId, deliveryId, fileId, file)
        const { downloadUrl, storagePath } = await uploadDeliveryFile(
          'quickJobs',
          job.id,
          `${Date.now()}_${file.name}`,
          file,
          (progress: any) => {
            // Optional: could track progress
          }
        )
        newUploads.push({
          name: file.name,
          url: downloadUrl,
          path: storagePath,
          size: file.size
        })
      }
      setUploadedFiles(prev => [...prev, ...newUploads])
      toast.success('Files uploaded successfully!')
    } catch (err) {
      console.error(err)
      toast.error('Failed to upload files')
    } finally {
      setIsUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const handleRemoveFile = async (index: number) => {
    const file = uploadedFiles[index]
    try {
      await deleteDeliveryFile(file.path)
      setUploadedFiles(prev => prev.filter((_, i) => i !== index))
      toast.success('File removed')
    } catch (err) {
      console.error(err)
      toast.error('Failed to remove file')
    }
  }

  const handleSendDelivery = async () => {
    if (job.paymentStatus !== 'Paid') {
      toast.error('Payment must be Paid before delivery.')
      return
    }
    if (uploadedFiles.length === 0) {
      toast.error('Please upload at least one delivery file.')
      return
    }

    setIsSendingDelivery(true)
    try {
      // 1. Send the email via a new api route or an existing one. 
      // For simplicity, we can call an API route to send the quick job delivery email.
      const response = await fetch('/api/quick-jobs/send-delivery', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jobId: job.id,
          clientName: job.clientName,
          clientEmail: job.clientEmail,
          files: uploadedFiles,
        })
      })
      
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Failed to send delivery')

      onUpdate({ 
        deliveryStatus: 'Sent', 
        deliveryEmailSentAt: new Date().toISOString(),
        status: 'Completed'
      })
      toast.success('Delivery email sent successfully!')
    } catch (err: any) {
      console.error(err)
      toast.error(err.message || 'Failed to send delivery email')
      onUpdate({ deliveryStatus: 'Failed' })
    } finally {
      setIsSendingDelivery(false)
    }
  }

  const isPaid = job.paymentStatus === 'Paid'

  return (
    <div className="space-y-6 mt-6 pt-6 border-t border-gray-100 dark:border-gray-800">
      {/* PAYMENT SECTION */}
      <div>
        <h4 className="text-sm font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2 mb-3">
          <CreditCard className="w-4 h-4 text-indigo-500" />
          Payment Tracking
        </h4>
        
        <div className="bg-gray-50 dark:bg-gray-800/50 p-4 rounded-xl border border-gray-100 dark:border-gray-800">
          <div className="flex items-center justify-between mb-4">
            <div>
              <span className="text-xs text-gray-500 block mb-1">Status</span>
              <Badge variant={isPaid ? 'success' : 'default'}>{job.paymentStatus}</Badge>
            </div>
            <div className="text-right">
              <span className="text-xs text-gray-500 block mb-1">Amount Due</span>
              <span className="font-mono font-bold text-gray-900 dark:text-gray-100">
                {formatCurrency(job.outstandingBalance, job.currency)}
              </span>
            </div>
          </div>

          {!paymentLink ? (
            <Button 
              size="sm" 
              onClick={handleGenerateLink} 
              loading={isGeneratingLink}
              disabled={isPaid}
              className="w-full"
            >
              Generate Payment Link
            </Button>
          ) : (
            <div className="space-y-2">
              <div className="flex gap-2">
                <Input value={paymentLink} readOnly className="text-xs font-mono bg-white dark:bg-gray-900" />
                <Button variant="outline" size="sm" onClick={handleCopyLink} title="Copy Link" className="w-10 p-0">
                  <Copy className="w-4 h-4" />
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* DELIVERY SECTION */}
      <div className={`transition-opacity ${!isPaid ? 'opacity-50 pointer-events-none' : ''}`}>
        <h4 className="text-sm font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2 mb-3">
          <Send className="w-4 h-4 text-emerald-500" />
          Delivery Files
        </h4>

        <div className="space-y-4">
          {!isPaid && (
            <div className="p-3 bg-amber-50 dark:bg-amber-950/30 text-amber-800 dark:text-amber-300 rounded-lg text-xs flex items-start gap-2 border border-amber-200 dark:border-amber-900">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <p>Payment must be confirmed as <strong>Paid</strong> before files can be uploaded and delivered.</p>
            </div>
          )}


          {/* Custom File Upload UI */}
          <div className="bg-gray-50 dark:bg-gray-800/50 p-4 rounded-xl border border-gray-100 dark:border-gray-800">
             <div className="flex flex-col items-center justify-center p-6 border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 mb-4">
               <Upload className="w-8 h-8 text-gray-400 mb-2" />
               <p className="text-sm text-gray-600 dark:text-gray-400 mb-4 text-center">
                 Drag & drop files here, or click to select
               </p>
               <input 
                 type="file" 
                 multiple 
                 className="hidden" 
                 ref={fileInputRef}
                 onChange={handleFileSelect}
                 disabled={!isPaid || isUploading}
               />
               <Button 
                 variant="outline" 
                 size="sm" 
                 onClick={() => fileInputRef.current?.click()}
                 disabled={!isPaid || isUploading}
                 loading={isUploading}
               >
                 Select Files
               </Button>
             </div>
             
             {uploadedFiles.length > 0 && (
               <div className="mt-4 space-y-2">
                 {uploadedFiles.map((f, i) => (
                   <div key={i} className="flex items-center justify-between p-2 bg-white dark:bg-gray-900 rounded border border-gray-100 dark:border-gray-800 text-xs">
                     <div className="truncate flex items-center gap-2">
                       <FileText className="w-4 h-4 text-gray-400" />
                       <span className="truncate">{f.name}</span>
                       <span className="text-gray-400">({Math.round(f.size / 1024)} KB)</span>
                     </div>
                     <Button 
                       variant="ghost" 
                       size="sm" 
                       className="h-6 w-6 p-0 text-red-500 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950"
                       onClick={() => handleRemoveFile(i)}
                       disabled={isSendingDelivery || job.deliveryStatus === 'Sent'}
                     >
                       <X className="w-3 h-3" />
                     </Button>
                   </div>
                 ))}
               </div>
             )}
          </div>

          <div className="pt-2">
            <Button 
              className="w-full" 
              onClick={handleSendDelivery}
              loading={isSendingDelivery}
              disabled={!isPaid || uploadedFiles.length === 0 || job.deliveryStatus === 'Sent'}
            >
              {job.deliveryStatus === 'Sent' ? 'Delivery Sent' : 'Submit & Send Delivery'}
            </Button>
            {job.deliveryStatus === 'Sent' && job.deliveryEmailSentAt && (
              <p className="text-center text-xs text-emerald-600 dark:text-emerald-400 mt-2 flex items-center justify-center gap-1">
                <CheckCircle2 className="w-3 h-3" />
                Sent successfully
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

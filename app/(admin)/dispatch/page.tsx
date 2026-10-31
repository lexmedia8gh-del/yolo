'use client'

import React, { Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { MultiChannelDispatchWorkspace } from '@/components/dispatch/MultiChannelDispatchModal'
import { Spinner } from '@/components/ui/Spinner'

function DispatchWorkspacePageInner() {
  const searchParams = useSearchParams()
  const clientId = searchParams?.get('clientId') || ''
  const clientName = searchParams?.get('clientName') || ''
  const clientEmail = searchParams?.get('clientEmail') || ''
  const clientPhone = searchParams?.get('clientPhone') || ''
  const projectId = searchParams?.get('projectId') || ''

  const initialClient = clientId
    ? {
        id: clientId,
        name: clientName || 'Valued Client',
        email: clientEmail,
        phone: clientPhone,
      }
    : null

  return (
    <div className="animate-fade-in">
      <MultiChannelDispatchWorkspace
        initialClient={initialClient}
        initialProjectId={projectId || undefined}
      />
    </div>
  )
}

export default function DispatchWorkspacePage() {
  return (
    <Suspense
      fallback={
        <div className="py-20 flex items-center justify-center">
          <Spinner size="lg" />
        </div>
      }
    >
      <DispatchWorkspacePageInner />
    </Suspense>
  )
}

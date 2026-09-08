import type { Metadata } from 'next'
import { ComingSoonPage } from '@/components/layout/ComingSoon'

export const metadata: Metadata = { title: 'Analytics' }

export default function AnalyticsPage() {
  return (
    <ComingSoonPage
      title="Analytics & Reports"
      description="Revenue analytics, client growth, project performance, and service breakdown charts."
      phase="Phase 6"
      icon="BarChart3"
    />
  )
}

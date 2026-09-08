'use client'

import React, { useState } from 'react'
import {
  Globe,
  Layout,
  Image as ImageIcon,
  FileText,
  Phone,
  Save,
  CheckCircle2,
  ExternalLink,
  Sparkles,
} from 'lucide-react'
import { PageHeader } from '@/components/layout/PageHeader'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input, Textarea } from '@/components/ui/Input'
import toast from 'react-hot-toast'

export default function WebsiteContentPage() {
  const [activeTab, setActiveTab] = useState<'hero' | 'about' | 'contact'>('hero')
  const [saving, setSaving] = useState(false)

  // Form states
  const [heroTitle, setHeroTitle] = useState('Capturing Moments, Crafting Stories.')
  const [heroSubtitle, setHeroSubtitle] = useState('LexMedia is a premier creative media agency specializing in cinematic photography, video production, and bespoke branding.')
  const [ctaText, setCtaText] = useState('Book a Session')
  
  const [aboutText, setAboutText] = useState('Based in Accra, Ghana, LexMedia delivers world-class creative production for weddings, corporate brands, and commercial campaigns.')
  const [contactEmail, setContactEmail] = useState('contact@lexmedia.com')
  const [contactPhone, setContactPhone] = useState('+233 24 123 4567')
  const [contactLocation, setContactLocation] = useState('East Legon, Accra, Ghana')

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setTimeout(() => {
      setSaving(false)
      toast.success('Website content updated successfully.')
    }, 600)
  }

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <PageHeader
        title="Website Content"
        subtitle="Manage public-facing portfolio content, hero messaging, and contact details."
        action={
          <Button
            variant="outline"
            size="sm"
            icon={<ExternalLink size={14} />}
            onClick={() => window.open('/', '_blank')}
          >
            Preview Site
          </Button>
        }
      />

      {/* Tabs */}
      <div className="flex border-b border-gray-200 gap-2">
        {[
          { id: 'hero', label: 'Hero Section', icon: Layout },
          { id: 'about', label: 'About Agency', icon: FileText },
          { id: 'contact', label: 'Contact & Location', icon: Phone },
        ].map((tab) => {
          const Icon = tab.icon
          const isActive = activeTab === tab.id
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`flex items-center gap-2 py-3 px-4 text-sm font-medium border-b-2 transition-colors -mb-px ${
                isActive
                  ? 'border-indigo-600 text-indigo-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              <Icon size={16} />
              <span>{tab.label}</span>
            </button>
          )
        })}
      </div>

      <form onSubmit={handleSave}>
        <Card className="p-6 space-y-6">
          {activeTab === 'hero' && (
            <div className="space-y-4 max-w-2xl">
              <div>
                <h3 className="text-base font-semibold text-gray-900">Hero Section Messaging</h3>
                <p className="text-xs text-gray-500 mt-0.5">The primary headline and call-to-action on the landing page.</p>
              </div>

              <Input
                label="Headline Title"
                value={heroTitle}
                onChange={(e) => setHeroTitle(e.target.value)}
                placeholder="e.g. Capturing Moments..."
                required
              />

              <Textarea
                label="Sub-headline Description"
                value={heroSubtitle}
                onChange={(e) => setHeroSubtitle(e.target.value)}
                rows={3}
                required
              />

              <Input
                label="Primary Button Text"
                value={ctaText}
                onChange={(e) => setCtaText(e.target.value)}
                placeholder="e.g. Book a Session"
                required
              />
            </div>
          )}

          {activeTab === 'about' && (
            <div className="space-y-4 max-w-2xl">
              <div>
                <h3 className="text-base font-semibold text-gray-900">Agency Biography</h3>
                <p className="text-xs text-gray-500 mt-0.5">Displayed in the About section of the website.</p>
              </div>

              <Textarea
                label="About Story"
                value={aboutText}
                onChange={(e) => setAboutText(e.target.value)}
                rows={4}
                required
              />
            </div>
          )}

          {activeTab === 'contact' && (
            <div className="space-y-4 max-w-2xl">
              <div>
                <h3 className="text-base font-semibold text-gray-900">Contact Information</h3>
                <p className="text-xs text-gray-500 mt-0.5">Displayed on the website footer and contact section.</p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Input
                  label="Inquiry Email"
                  type="email"
                  value={contactEmail}
                  onChange={(e) => setContactEmail(e.target.value)}
                  required
                />
                <Input
                  label="Contact Phone"
                  value={contactPhone}
                  onChange={(e) => setContactPhone(e.target.value)}
                  required
                />
              </div>

              <Input
                label="Office Location"
                value={contactLocation}
                onChange={(e) => setContactLocation(e.target.value)}
                required
              />
            </div>
          )}

          <div className="pt-4 border-t border-gray-200 flex justify-end">
            <Button
              type="submit"
              variant="primary"
              loading={saving}
              icon={<Save size={15} />}
            >
              Save Changes
            </Button>
          </div>
        </Card>
      </form>
    </div>
  )
}

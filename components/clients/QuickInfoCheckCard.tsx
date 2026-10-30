'use client'

import React, { useState } from 'react'
import {
  CheckCircle2,
  AlertTriangle,
  Sparkles,
  MessageSquare,
  ArrowRight,
  User,
  Mail,
  Phone,
  Building2,
  MapPin,
  Briefcase,
  Calendar,
  DollarSign,
  FileText,
  Send,
  Users,
  Ruler,
  Hash,
  Link2,
  ChevronDown,
  ChevronUp,
  GitCompare,
} from 'lucide-react'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import type {
  ExtractedEntity,
  ExtractionConfidence,
  ParsedClientResponse,
} from '@/lib/extraction/types'

interface QuickInfoCheckCardProps {
  parsedData: ParsedClientResponse
  onUpdateField: (field: keyof ParsedClientResponse, value: string) => void
  onSelectEntity?: (entity: ExtractedEntity) => void
  onResolveConflict?: (field: string, chosenValue: string) => void
  onRequestMissingInfo?: () => void
  onApplyToForm: () => void
  onDirectCreate?: () => void
  isSubmitting?: boolean
}

function ConfidenceIndicator({ confidence }: { confidence?: ExtractionConfidence }) {
  if (!confidence || confidence === 'missing') return null
  if (confidence === 'explicit') {
    return (
      <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200/70">
        Explicit
      </span>
    )
  }
  if (confidence === 'uncertain') {
    return (
      <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded bg-amber-50 text-amber-800 border border-amber-300">
        Review
      </span>
    )
  }
  return (
    <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200/70">
      Inferred
    </span>
  )
}

export function QuickInfoCheckCard({
  parsedData,
  onUpdateField,
  onSelectEntity,
  onResolveConflict,
  onRequestMissingInfo,
  onApplyToForm,
  onDirectCreate,
  isSubmitting = false,
}: QuickInfoCheckCardProps) {
  const [showOriginalText, setShowOriginalText] = useState(false)

  const totalCoreFields = 7 // Name, Phone, WhatsApp, Email, Company, Address, Service
  const availableCount = parsedData.availableFields?.length || 0
  const missingCount = parsedData.missingFields?.length || 0
  const percentComplete = Math.min(100, Math.round((availableCount / totalCoreFields) * 100))

  const totalDetails = parsedData.pipelineReport?.totalDetailsIdentified ?? availableCount
  const conflicts = parsedData.conflicts || []
  const entities = parsedData.entities || []
  const financials = parsedData.financials || []
  const quantities = parsedData.quantitiesAndMeasurements || []
  const dates = parsedData.datesAndDeadlines || []
  const references = parsedData.referenceNumbers || []
  const urls = parsedData.urlsAndHandles || []

  const isReadyToCreate = Boolean(
    parsedData.fullName.trim() &&
      (parsedData.phone.trim() || parsedData.whatsappNumber.trim() || parsedData.email.trim())
  )

  const getFieldConf = (field: string): ExtractionConfidence | undefined =>
    parsedData.fieldMeta?.[field]?.confidence

  return (
    <div className="space-y-4 animate-fade-in">
      {/* Overview Completeness & Audit Summary Bar */}
      <div className="p-4 bg-gray-50/80 rounded-2xl border border-border flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div
            className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold text-sm shrink-0 ${
              percentComplete >= 70
                ? 'bg-success-100 text-success-700'
                : percentComplete >= 40
                ? 'bg-amber-100 text-amber-800'
                : 'bg-danger-100 text-danger-700'
            }`}
          >
            {percentComplete}%
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h4 className="text-sm font-bold text-gray-900">Extraction & Completeness Check</h4>
              <Badge
                variant={percentComplete >= 70 ? 'success' : percentComplete >= 40 ? 'warning' : 'danger'}
                size="sm"
              >
                {percentComplete >= 70 ? 'High' : percentComplete >= 40 ? 'Partial' : 'Incomplete'}
              </Badge>
              {conflicts.length > 0 && (
                <Badge variant="warning" size="sm">
                  {conflicts.length} Conflict{conflicts.length > 1 ? 's' : ''}
                </Badge>
              )}
              {entities.length > 1 && (
                <Badge variant="default" size="sm">
                  {entities.length} Contacts Found
                </Badge>
              )}
            </div>
            <p className="text-xs text-muted mt-0.5">
              {totalDetails} total detail{totalDetails === 1 ? '' : 's'} extracted · {availableCount}/7 core profile fields · {missingCount} missing · 100% of pasted text preserved.
            </p>
          </div>
        </div>

        {missingCount > 0 && onRequestMissingInfo && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onRequestMissingInfo}
            icon={<Send size={13} className="text-accent-600" />}
          >
            Request Missing via WhatsApp
          </Button>
        )}
      </div>

      {/* Conflict Resolution Panel */}
      {conflicts.length > 0 && (
        <div className="p-3.5 rounded-xl bg-amber-50/80 border border-amber-200 space-y-2.5">
          <div className="flex items-center gap-2 text-xs font-bold text-amber-900">
            <GitCompare size={15} className="text-amber-600 shrink-0" />
            <span>Conflicting Values Detected — Select Intended Value</span>
          </div>
          <div className="space-y-2">
            {conflicts.map((conflict, idx) => (
              <div
                key={`${conflict.field}-${idx}`}
                className="bg-white/90 rounded-lg p-2.5 border border-amber-200/80 flex flex-col sm:flex-row sm:items-center justify-between gap-2"
              >
                <div className="text-xs text-gray-700">
                  <span className="font-semibold text-gray-900">{conflict.label}:</span>{' '}
                  <span className="text-gray-600">{conflict.description}</span>
                </div>
                <div className="flex flex-wrap gap-1.5 shrink-0">
                  {conflict.values.map((val) => {
                    const currentVal = String((parsedData as any)[conflict.field] || '')
                    const isSelected = currentVal.trim().toLowerCase() === val.trim().toLowerCase()
                    return (
                      <button
                        key={val}
                        type="button"
                        onClick={() =>
                          onResolveConflict
                            ? onResolveConflict(conflict.field, val)
                            : onUpdateField(conflict.field as keyof ParsedClientResponse, val)
                        }
                        className={`px-2.5 py-1 rounded-md text-xs font-medium border transition-colors ${
                          isSelected
                            ? 'bg-accent-600 text-white border-accent-600'
                            : 'bg-white text-gray-700 border-gray-300 hover:border-accent-400'
                        }`}
                      >
                        Use &ldquo;{val}&rdquo;
                      </button>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Multiple Entities / Contacts Switcher */}
      {entities.length > 1 && (
        <div className="p-3.5 rounded-xl bg-indigo-50/50 border border-indigo-200/80 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-indigo-950 flex items-center gap-1.5">
              <Users size={14} className="text-indigo-600" />
              Multiple Contacts / Clients Detected ({entities.length})
            </span>
            <span className="text-[11px] text-indigo-700">
              Click a contact to set as primary client (others stay saved in notes)
            </span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {entities.map((ent, idx) => {
              const isCurrentPrimary =
                ent.name.trim().toLowerCase() === parsedData.fullName.trim().toLowerCase()
              return (
                <button
                  key={`${ent.name}-${idx}`}
                  type="button"
                  onClick={() => onSelectEntity && onSelectEntity(ent)}
                  className={`text-left p-2.5 rounded-lg border transition-all text-xs ${
                    isCurrentPrimary
                      ? 'bg-white border-indigo-500 ring-1 ring-indigo-500 shadow-xs'
                      : 'bg-white/70 border-gray-200 hover:border-indigo-300 hover:bg-white'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-bold text-gray-900 truncate">{ent.name}</span>
                    {isCurrentPrimary && (
                      <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-indigo-100 text-indigo-700 shrink-0">
                        Active
                      </span>
                    )}
                  </div>
                  <div className="text-[11px] text-gray-500 mt-0.5 truncate">
                    {[ent.roleOrRelation, ent.company, ent.phone, ent.email].filter(Boolean).join(' · ') ||
                      'Contact entity'}
                  </div>
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* Grid: Editable Fields vs Structured Details & Editable Notes */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
        {/* Left Column: All Editable Core + Project Fields (7 cols) */}
        <div className="md:col-span-7 bg-white rounded-xl border border-border p-4 space-y-3 shadow-xs">
          <div className="flex items-center justify-between border-b border-border pb-2.5">
            <h5 className="text-xs font-bold text-gray-900 flex items-center gap-1.5 uppercase tracking-wider">
              <CheckCircle2 size={15} className="text-success-600" />
              Extracted Client & Project Fields
            </h5>
            <span className="text-[11px] text-muted">All fields are editable</span>
          </div>

          <div className="space-y-2.5">
            {/* Full Name */}
            <div className="flex items-start gap-2.5 text-xs">
              <User size={15} className="text-gray-400 mt-1 shrink-0" />
              <div className="flex-1">
                <div className="flex items-center justify-between mb-0.5">
                  <label className="text-[10px] uppercase font-semibold text-gray-400">Full Name</label>
                  <ConfidenceIndicator confidence={getFieldConf('fullName')} />
                </div>
                <input
                  type="text"
                  value={parsedData.fullName}
                  onChange={(e) => onUpdateField('fullName', e.target.value)}
                  placeholder="Not identified"
                  className="w-full text-xs font-semibold text-gray-900 bg-gray-50 hover:bg-gray-100/70 focus:bg-white px-2.5 py-1.5 rounded-lg border border-gray-200/70 focus:border-accent-400 outline-none transition-colors"
                />
              </div>
            </div>

            {/* Phone & WhatsApp */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div className="flex items-start gap-2 text-xs">
                <Phone size={14} className="text-gray-400 mt-1 shrink-0" />
                <div className="flex-1">
                  <div className="flex items-center justify-between mb-0.5">
                    <label className="text-[10px] uppercase font-semibold text-gray-400">Phone Number</label>
                    <ConfidenceIndicator confidence={getFieldConf('phone')} />
                  </div>
                  <input
                    type="text"
                    value={parsedData.phone}
                    onChange={(e) => onUpdateField('phone', e.target.value)}
                    placeholder="Not identified"
                    className="w-full text-xs text-gray-900 bg-gray-50 hover:bg-gray-100/70 focus:bg-white px-2.5 py-1.5 rounded-lg border border-gray-200/70 focus:border-accent-400 outline-none transition-colors"
                  />
                </div>
              </div>
              <div className="flex items-start gap-2 text-xs">
                <MessageSquare size={14} className="text-gray-400 mt-1 shrink-0" />
                <div className="flex-1">
                  <div className="flex items-center justify-between mb-0.5">
                    <label className="text-[10px] uppercase font-semibold text-gray-400">WhatsApp Number</label>
                    <ConfidenceIndicator confidence={getFieldConf('whatsappNumber')} />
                  </div>
                  <input
                    type="text"
                    value={parsedData.whatsappNumber}
                    onChange={(e) => onUpdateField('whatsappNumber', e.target.value)}
                    placeholder="Not identified"
                    className="w-full text-xs text-gray-900 bg-gray-50 hover:bg-gray-100/70 focus:bg-white px-2.5 py-1.5 rounded-lg border border-gray-200/70 focus:border-accent-400 outline-none transition-colors"
                  />
                </div>
              </div>
            </div>

            {/* Alternate Phones quick-pick if detected */}
            {parsedData.alternatePhones && parsedData.alternatePhones.length > 0 && (
              <div className="pl-6 flex flex-wrap items-center gap-1.5 text-[11px] text-gray-500">
                <span>Other numbers found:</span>
                {parsedData.alternatePhones.map((altPhone) => (
                  <button
                    key={altPhone}
                    type="button"
                    onClick={() => onUpdateField('phone', altPhone)}
                    className="px-2 py-0.5 rounded bg-gray-100 hover:bg-accent-50 text-gray-700 hover:text-accent-700 border border-gray-200 transition-colors"
                    title="Click to use as primary phone"
                  >
                    {altPhone}
                  </button>
                ))}
              </div>
            )}

            {/* Email Address */}
            <div className="flex items-start gap-2.5 text-xs">
              <Mail size={15} className="text-gray-400 mt-1 shrink-0" />
              <div className="flex-1">
                <div className="flex items-center justify-between mb-0.5">
                  <label className="text-[10px] uppercase font-semibold text-gray-400">Email Address</label>
                  <ConfidenceIndicator confidence={getFieldConf('email')} />
                </div>
                <input
                  type="email"
                  value={parsedData.email}
                  onChange={(e) => onUpdateField('email', e.target.value)}
                  placeholder="Not identified (optional if phone provided)"
                  className="w-full text-xs text-gray-900 bg-gray-50 hover:bg-gray-100/70 focus:bg-white px-2.5 py-1.5 rounded-lg border border-gray-200/70 focus:border-accent-400 outline-none transition-colors"
                />
              </div>
            </div>

            {/* Alternate Emails quick-pick if detected */}
            {parsedData.alternateEmails && parsedData.alternateEmails.length > 0 && (
              <div className="pl-6 flex flex-wrap items-center gap-1.5 text-[11px] text-gray-500">
                <span>Other emails found:</span>
                {parsedData.alternateEmails.map((altEmail) => (
                  <button
                    key={altEmail}
                    type="button"
                    onClick={() => onUpdateField('email', altEmail)}
                    className="px-2 py-0.5 rounded bg-gray-100 hover:bg-accent-50 text-gray-700 hover:text-accent-700 border border-gray-200 transition-colors"
                    title="Click to use as primary email"
                  >
                    {altEmail}
                  </button>
                ))}
              </div>
            )}

            {/* Company & Location */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div className="flex items-start gap-2 text-xs">
                <Building2 size={14} className="text-gray-400 mt-1 shrink-0" />
                <div className="flex-1">
                  <div className="flex items-center justify-between mb-0.5">
                    <label className="text-[10px] uppercase font-semibold text-gray-400">Company / Brand</label>
                    <ConfidenceIndicator confidence={getFieldConf('company')} />
                  </div>
                  <input
                    type="text"
                    value={parsedData.company}
                    onChange={(e) => onUpdateField('company', e.target.value)}
                    placeholder="Not identified"
                    className="w-full text-xs text-gray-900 bg-gray-50 hover:bg-gray-100/70 focus:bg-white px-2.5 py-1.5 rounded-lg border border-gray-200/70 focus:border-accent-400 outline-none transition-colors"
                  />
                </div>
              </div>
              <div className="flex items-start gap-2 text-xs">
                <MapPin size={14} className="text-gray-400 mt-1 shrink-0" />
                <div className="flex-1">
                  <div className="flex items-center justify-between mb-0.5">
                    <label className="text-[10px] uppercase font-semibold text-gray-400">Location / Address</label>
                    <ConfidenceIndicator confidence={getFieldConf('address')} />
                  </div>
                  <input
                    type="text"
                    value={parsedData.address}
                    onChange={(e) => onUpdateField('address', e.target.value)}
                    placeholder="Not identified"
                    className="w-full text-xs text-gray-900 bg-gray-50 hover:bg-gray-100/70 focus:bg-white px-2.5 py-1.5 rounded-lg border border-gray-200/70 focus:border-accent-400 outline-none transition-colors"
                  />
                </div>
              </div>
            </div>

            {/* Service or Project Requested */}
            <div className="flex items-start gap-2.5 text-xs">
              <Briefcase size={15} className="text-accent-600 mt-1 shrink-0" />
              <div className="flex-1">
                <div className="flex items-center justify-between mb-0.5">
                  <label className="text-[10px] uppercase font-semibold text-accent-700">
                    Service / Deliverables Requested
                  </label>
                  <ConfidenceIndicator confidence={getFieldConf('serviceOrProject')} />
                </div>
                <input
                  type="text"
                  value={parsedData.serviceOrProject}
                  onChange={(e) => onUpdateField('serviceOrProject', e.target.value)}
                  placeholder="e.g. Brand Identity, Logo, Flyers, Website..."
                  className="w-full text-xs font-semibold text-accent-900 bg-accent-50/50 hover:bg-accent-50 focus:bg-white px-2.5 py-1.5 rounded-lg border border-accent-200 focus:border-accent-400 outline-none transition-colors"
                />
              </div>
            </div>

            {/* Budget & Timeline (Editable) */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
              <div className="flex items-start gap-2 text-xs">
                <DollarSign size={14} className="text-emerald-600 mt-1 shrink-0" />
                <div className="flex-1">
                  <div className="flex items-center justify-between mb-0.5">
                    <label className="text-[10px] uppercase font-semibold text-gray-400">Budget / Pricing</label>
                    <ConfidenceIndicator confidence={getFieldConf('budget')} />
                  </div>
                  <input
                    type="text"
                    value={parsedData.budget || ''}
                    onChange={(e) => onUpdateField('budget', e.target.value)}
                    placeholder="Not mentioned"
                    className="w-full text-xs text-gray-900 bg-gray-50 hover:bg-gray-100/70 focus:bg-white px-2.5 py-1.5 rounded-lg border border-gray-200/70 focus:border-accent-400 outline-none transition-colors"
                  />
                </div>
              </div>
              <div className="flex items-start gap-2 text-xs">
                <Calendar size={14} className="text-blue-600 mt-1 shrink-0" />
                <div className="flex-1">
                  <div className="flex items-center justify-between mb-0.5">
                    <label className="text-[10px] uppercase font-semibold text-gray-400">Timeline / Deadline</label>
                    <ConfidenceIndicator confidence={getFieldConf('timeline')} />
                  </div>
                  <input
                    type="text"
                    value={parsedData.timeline || ''}
                    onChange={(e) => onUpdateField('timeline', e.target.value)}
                    placeholder="Not mentioned"
                    className="w-full text-xs text-gray-900 bg-gray-50 hover:bg-gray-100/70 focus:bg-white px-2.5 py-1.5 rounded-lg border border-gray-200/70 focus:border-accent-400 outline-none transition-colors"
                  />
                </div>
              </div>
            </div>

            {/* Complete Editable Notes */}
            <div className="pt-2 border-t border-border/80 space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-[10px] uppercase font-semibold text-gray-500 flex items-center gap-1">
                  <FileText size={12} className="text-gray-400" />
                  Extracted Project & Client Notes (Saved to Profile)
                </label>
                <span className="text-[10px] text-gray-400">Editable · Full text preserved</span>
              </div>
              <textarea
                rows={4}
                value={parsedData.notes || ''}
                onChange={(e) => onUpdateField('notes', e.target.value)}
                placeholder="Extracted project notes, instructions, and context..."
                className="w-full text-xs text-gray-800 bg-gray-50 hover:bg-gray-100/60 focus:bg-white p-2.5 rounded-lg border border-gray-200/80 focus:border-accent-400 outline-none leading-relaxed font-sans"
              />
            </div>

            {/* Unmatched / Additional Preserved Information */}
            {parsedData.additionalInformation && parsedData.additionalInformation.trim() && (
              <div className="pt-1 space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-[10px] uppercase font-semibold text-indigo-700">
                    Additional Unmatched Details (Preserved from Pasted Text)
                  </label>
                </div>
                <textarea
                  rows={3}
                  value={parsedData.additionalInformation}
                  onChange={(e) => onUpdateField('additionalInformation', e.target.value)}
                  className="w-full text-xs text-gray-800 bg-indigo-50/40 focus:bg-white p-2.5 rounded-lg border border-indigo-200/80 focus:border-accent-400 outline-none leading-relaxed font-sans"
                />
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Missing Info + Categorized Extracted Details (5 cols) */}
        <div className="md:col-span-5 space-y-4">
          {/* Missing Information Block */}
          <div className="bg-white rounded-xl border border-border p-4 space-y-2.5 shadow-xs">
            <h5 className="text-xs font-bold text-gray-900 flex items-center gap-1.5 uppercase tracking-wider">
              <AlertTriangle size={15} className={missingCount > 0 ? 'text-amber-500' : 'text-gray-400'} />
              Missing Core Fields ({missingCount})
            </h5>

            {missingCount === 0 ? (
              <div className="p-2.5 bg-success-50 text-success-700 rounded-lg text-xs flex items-center gap-2">
                <CheckCircle2 size={14} />
                <span>All 7 core client fields were identified!</span>
              </div>
            ) : (
              <div className="space-y-1.5">
                <p className="text-[11px] text-muted">
                  Not detected in pasted text (never fabricated):
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {parsedData.missingFields.map((field) => (
                    <span
                      key={field}
                      className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium bg-amber-50 text-amber-800 border border-amber-200/80"
                    >
                      <AlertTriangle size={11} className="text-amber-600" />
                      {field}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Structured Extracted Details Breakdown */}
          <div className="bg-white rounded-xl border border-border p-4 space-y-3 shadow-xs">
            <h5 className="text-xs font-bold text-gray-900 flex items-center gap-1.5 uppercase tracking-wider">
              <Sparkles size={14} className="text-accent-600" />
              Structured Details Discovered
            </h5>

            <div className="space-y-2.5 text-xs max-h-[380px] overflow-y-auto pr-1">
              {/* Financials Breakdown */}
              {financials.length > 0 && (
                <div className="space-y-1">
                  <span className="text-[10px] font-bold uppercase text-gray-400 flex items-center gap-1">
                    <DollarSign size={11} className="text-emerald-600" />
                    Amounts, Currencies & Percentages ({financials.length})
                  </span>
                  <div className="space-y-1">
                    {financials.map((f, i) => (
                      <div
                        key={`${f.raw}-${i}`}
                        className="flex items-start justify-between gap-2 bg-emerald-50/50 border border-emerald-100 px-2.5 py-1.5 rounded-lg text-[11px]"
                      >
                        <span className="font-bold text-emerald-900 shrink-0">
                          {f.raw}{' '}
                          <span className="font-normal text-emerald-700 uppercase text-[10px]">
                            ({f.category.replace('_', ' ')})
                          </span>
                        </span>
                        {f.context && (
                          <span className="text-gray-500 text-right truncate max-w-[160px]" title={f.context}>
                            {f.context}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Quantities & Measurements */}
              {quantities.length > 0 && (
                <div className="space-y-1">
                  <span className="text-[10px] font-bold uppercase text-gray-400 flex items-center gap-1">
                    <Ruler size={11} className="text-indigo-600" />
                    Quantities & Specifications ({quantities.length})
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {quantities.map((q, i) => (
                      <span
                        key={`${q}-${i}`}
                        className="px-2 py-0.5 rounded-md bg-indigo-50 text-indigo-800 border border-indigo-100 text-[11px] font-medium"
                      >
                        {q}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Dates & Deadlines */}
              {dates.length > 0 && (
                <div className="space-y-1">
                  <span className="text-[10px] font-bold uppercase text-gray-400 flex items-center gap-1">
                    <Calendar size={11} className="text-blue-600" />
                    Dates & Deadlines ({dates.length})
                  </span>
                  <div className="space-y-1">
                    {dates.map((d, i) => (
                      <div
                        key={`${d.raw}-${i}`}
                        className="bg-blue-50/50 border border-blue-100 px-2.5 py-1 rounded-lg text-[11px] text-gray-700"
                      >
                        <strong className="text-blue-900">{d.raw}</strong>
                        {d.normalizedDate && (
                          <span className="text-blue-700 ml-1 font-mono text-[10px]">
                            [{d.normalizedDate}]
                          </span>
                        )}
                        <span className="text-gray-500 ml-1 capitalize">({d.category.replace('_', ' ')})</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* References & IDs */}
              {references.length > 0 && (
                <div className="space-y-1">
                  <span className="text-[10px] font-bold uppercase text-gray-400 flex items-center gap-1">
                    <Hash size={11} className="text-gray-600" />
                    Reference / Order IDs ({references.length})
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {references.map((r, i) => (
                      <span
                        key={`${r}-${i}`}
                        className="px-2 py-0.5 rounded-md bg-gray-100 text-gray-800 border border-gray-200 font-mono text-[11px]"
                      >
                        {r}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* URLs & Social Handles */}
              {urls.length > 0 && (
                <div className="space-y-1">
                  <span className="text-[10px] font-bold uppercase text-gray-400 flex items-center gap-1">
                    <Link2 size={11} className="text-accent-600" />
                    Links & Handles ({urls.length})
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {urls.map((u, i) => (
                      <span
                        key={`${u}-${i}`}
                        className="px-2 py-0.5 rounded-md bg-accent-50 text-accent-800 border border-accent-200 text-[11px] break-all"
                      >
                        {u}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Useful Bullet Highlights */}
              {parsedData.usefulDetails && parsedData.usefulDetails.length > 0 && (
                <div className="space-y-1 pt-1 border-t border-border/60">
                  <span className="text-[10px] font-bold uppercase text-gray-400 block">
                    Extracted Highlights ({parsedData.usefulDetails.length})
                  </span>
                  <ul className="space-y-1 pl-1">
                    {parsedData.usefulDetails.map((detail, idx) => (
                      <li key={idx} className="text-[11px] text-gray-600 flex items-start gap-1.5">
                        <span className="text-accent-500 font-bold">•</span>
                        <span>{detail}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            {/* Source of Truth Verbatim Viewer */}
            {parsedData.originalText && (
              <div className="pt-2 border-t border-border">
                <button
                  type="button"
                  onClick={() => setShowOriginalText((prev) => !prev)}
                  className="w-full flex items-center justify-between text-[11px] font-semibold text-gray-600 hover:text-gray-900"
                >
                  <span>Original Pasted Text (Source of Truth)</span>
                  {showOriginalText ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                </button>
                {showOriginalText && (
                  <pre className="mt-2 p-2.5 rounded-lg bg-gray-900 text-gray-100 text-[11px] whitespace-pre-wrap break-words max-h-44 overflow-y-auto font-mono">
                    {parsedData.originalText}
                  </pre>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Action Footer */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-3 border-t border-border">
        <div className="text-xs text-muted">
          {isReadyToCreate ? (
            <span className="text-success-600 font-medium flex items-center gap-1">
              <CheckCircle2 size={13} /> Ready to save — all extracted details will be preserved
            </span>
          ) : (
            <span className="text-amber-600 font-medium flex items-center gap-1">
              <AlertTriangle size={13} /> Provide at least a client name and a phone, WhatsApp, or email
            </span>
          )}
        </div>

        <div className="flex items-center gap-2.5 w-full sm:w-auto justify-end">
          <Button
            type="button"
            variant="outline"
            onClick={onApplyToForm}
            icon={<FileText size={14} />}
          >
            Review in Full Form
          </Button>

          {onDirectCreate && (
            <Button
              type="button"
              variant="primary"
              disabled={!isReadyToCreate || isSubmitting}
              loading={isSubmitting}
              onClick={onDirectCreate}
              icon={<ArrowRight size={15} />}
            >
              Create Client Now
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}

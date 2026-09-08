'use client'

import React from 'react'
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
  Clock,
  Send,
} from 'lucide-react'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import type { ParsedClientResponse } from '@/app/api/admin/parse-client/route'

interface QuickInfoCheckCardProps {
  parsedData: ParsedClientResponse
  onUpdateField: (field: keyof ParsedClientResponse, value: string) => void
  onRequestMissingInfo?: () => void
  onApplyToForm: () => void
  onDirectCreate?: () => void
  isSubmitting?: boolean
}

export function QuickInfoCheckCard({
  parsedData,
  onUpdateField,
  onRequestMissingInfo,
  onApplyToForm,
  onDirectCreate,
  isSubmitting = false,
}: QuickInfoCheckCardProps) {
  const totalCoreFields = 7 // Name, Phone, WhatsApp, Email, Company, Address, Service
  const availableCount = parsedData.availableFields?.length || 0
  const missingCount = parsedData.missingFields?.length || 0
  const percentComplete = Math.min(100, Math.round((availableCount / totalCoreFields) * 100))

  const isReadyToCreate = Boolean(parsedData.fullName.trim() && (parsedData.phone.trim() || parsedData.email.trim()))

  return (
    <div className="space-y-4 animate-fade-in">
      {/* Overview Completeness Bar */}
      <div className="p-4 bg-gray-50/80 rounded-2xl border border-border flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div
            className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold text-sm ${
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
            <div className="flex items-center gap-2">
              <h4 className="text-sm font-bold text-gray-900">Information Completeness</h4>
              <Badge
                variant={percentComplete >= 70 ? 'success' : percentComplete >= 40 ? 'warning' : 'danger'}
                size="sm"
              >
                {percentComplete >= 70 ? 'High' : percentComplete >= 40 ? 'Partial' : 'Incomplete'}
              </Badge>
            </div>
            <p className="text-xs text-muted">
              {availableCount} details identified, {missingCount} fields missing.
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

      {/* Grid: Available vs Missing & Details */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
        {/* Available Information (Left 7 cols) */}
        <div className="md:col-span-7 bg-white rounded-xl border border-border p-4 space-y-3 shadow-xs">
          <div className="flex items-center justify-between border-b border-border pb-2.5">
            <h5 className="text-xs font-bold text-gray-900 flex items-center gap-1.5 uppercase tracking-wider">
              <CheckCircle2 size={15} className="text-success-600" />
              Available Information ({availableCount})
            </h5>
            <span className="text-[11px] text-muted">Click any field to adjust</span>
          </div>

          <div className="space-y-2.5">
            {/* Full Name */}
            <div className="flex items-start gap-2.5 text-xs">
              <User size={15} className="text-gray-400 mt-1 shrink-0" />
              <div className="flex-1">
                <label className="text-[10px] uppercase font-semibold text-gray-400">Full Name</label>
                <input
                  type="text"
                  value={parsedData.fullName}
                  onChange={(e) => onUpdateField('fullName', e.target.value)}
                  placeholder="Not identified"
                  className="w-full text-xs font-semibold text-gray-900 bg-gray-50 hover:bg-gray-100/70 focus:bg-white px-2 py-1 rounded-lg border border-transparent focus:border-accent-400 outline-none transition-colors"
                />
              </div>
            </div>

            {/* Phone & WhatsApp */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div className="flex items-start gap-2 text-xs">
                <Phone size={14} className="text-gray-400 mt-1 shrink-0" />
                <div className="flex-1">
                  <label className="text-[10px] uppercase font-semibold text-gray-400">Phone Number</label>
                  <input
                    type="text"
                    value={parsedData.phone}
                    onChange={(e) => onUpdateField('phone', e.target.value)}
                    placeholder="Not identified"
                    className="w-full text-xs text-gray-900 bg-gray-50 hover:bg-gray-100/70 focus:bg-white px-2 py-1 rounded-lg border border-transparent focus:border-accent-400 outline-none transition-colors"
                  />
                </div>
              </div>
              <div className="flex items-start gap-2 text-xs">
                <MessageSquare size={14} className="text-gray-400 mt-1 shrink-0" />
                <div className="flex-1">
                  <label className="text-[10px] uppercase font-semibold text-gray-400">WhatsApp Number</label>
                  <input
                    type="text"
                    value={parsedData.whatsappNumber}
                    onChange={(e) => onUpdateField('whatsappNumber', e.target.value)}
                    placeholder="Not identified"
                    className="w-full text-xs text-gray-900 bg-gray-50 hover:bg-gray-100/70 focus:bg-white px-2 py-1 rounded-lg border border-transparent focus:border-accent-400 outline-none transition-colors"
                  />
                </div>
              </div>
            </div>

            {/* Email Address */}
            <div className="flex items-start gap-2.5 text-xs">
              <Mail size={15} className="text-gray-400 mt-1 shrink-0" />
              <div className="flex-1">
                <label className="text-[10px] uppercase font-semibold text-gray-400">Email Address</label>
                <input
                  type="email"
                  value={parsedData.email}
                  onChange={(e) => onUpdateField('email', e.target.value)}
                  placeholder="Not identified"
                  className="w-full text-xs text-gray-900 bg-gray-50 hover:bg-gray-100/70 focus:bg-white px-2 py-1 rounded-lg border border-transparent focus:border-accent-400 outline-none transition-colors"
                />
              </div>
            </div>

            {/* Company & Location */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div className="flex items-start gap-2 text-xs">
                <Building2 size={14} className="text-gray-400 mt-1 shrink-0" />
                <div className="flex-1">
                  <label className="text-[10px] uppercase font-semibold text-gray-400">Company / Brand</label>
                  <input
                    type="text"
                    value={parsedData.company}
                    onChange={(e) => onUpdateField('company', e.target.value)}
                    placeholder="Not identified"
                    className="w-full text-xs text-gray-900 bg-gray-50 hover:bg-gray-100/70 focus:bg-white px-2 py-1 rounded-lg border border-transparent focus:border-accent-400 outline-none transition-colors"
                  />
                </div>
              </div>
              <div className="flex items-start gap-2 text-xs">
                <MapPin size={14} className="text-gray-400 mt-1 shrink-0" />
                <div className="flex-1">
                  <label className="text-[10px] uppercase font-semibold text-gray-400">Location / Address</label>
                  <input
                    type="text"
                    value={parsedData.address}
                    onChange={(e) => onUpdateField('address', e.target.value)}
                    placeholder="Not identified"
                    className="w-full text-xs text-gray-900 bg-gray-50 hover:bg-gray-100/70 focus:bg-white px-2 py-1 rounded-lg border border-transparent focus:border-accent-400 outline-none transition-colors"
                  />
                </div>
              </div>
            </div>

            {/* Service or Project Requested */}
            <div className="flex items-start gap-2.5 text-xs">
              <Briefcase size={15} className="text-accent-600 mt-1 shrink-0" />
              <div className="flex-1">
                <label className="text-[10px] uppercase font-semibold text-accent-700">Service / Project Interest</label>
                <input
                  type="text"
                  value={parsedData.serviceOrProject}
                  onChange={(e) => onUpdateField('serviceOrProject', e.target.value)}
                  placeholder="e.g. Brand Identity, Logo, Flyer, Website..."
                  className="w-full text-xs font-semibold text-accent-900 bg-accent-50/50 hover:bg-accent-50 focus:bg-white px-2 py-1 rounded-lg border border-accent-200 focus:border-accent-400 outline-none transition-colors"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Missing Info + Useful Details (5 cols) */}
        <div className="md:col-span-5 space-y-4">
          {/* Missing Information Block */}
          <div className="bg-white rounded-xl border border-border p-4 space-y-2.5 shadow-xs">
            <h5 className="text-xs font-bold text-gray-900 flex items-center gap-1.5 uppercase tracking-wider">
              <AlertTriangle size={15} className={missingCount > 0 ? 'text-amber-500' : 'text-gray-400'} />
              Missing Information ({missingCount})
            </h5>

            {missingCount === 0 ? (
              <div className="p-2.5 bg-success-50 text-success-700 rounded-lg text-xs flex items-center gap-2">
                <CheckCircle2 size={14} />
                <span>All core client fields were successfully identified!</span>
              </div>
            ) : (
              <div className="space-y-1.5">
                <p className="text-[11px] text-muted">
                  These fields were not detected in the pasted text:
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

          {/* Useful Client Details */}
          <div className="bg-white rounded-xl border border-border p-4 space-y-2.5 shadow-xs">
            <h5 className="text-xs font-bold text-gray-900 flex items-center gap-1.5 uppercase tracking-wider">
              <Sparkles size={14} className="text-accent-600" />
              Useful Client Details
            </h5>

            <div className="space-y-1.5 text-xs">
              {parsedData.budget && (
                <div className="flex items-center gap-2 text-gray-700 bg-gray-50 p-2 rounded-lg">
                  <DollarSign size={13} className="text-success-600 shrink-0" />
                  <span>
                    <strong className="text-gray-900">Budget:</strong> {parsedData.budget}
                  </span>
                </div>
              )}

              {parsedData.timeline && (
                <div className="flex items-center gap-2 text-gray-700 bg-gray-50 p-2 rounded-lg">
                  <Calendar size={13} className="text-blue-600 shrink-0" />
                  <span>
                    <strong className="text-gray-900">Timeline:</strong> {parsedData.timeline}
                  </span>
                </div>
              )}

              {parsedData.usefulDetails && parsedData.usefulDetails.length > 0 && (
                <ul className="space-y-1 pl-1">
                  {parsedData.usefulDetails.map((detail, idx) => (
                    <li key={idx} className="text-[11px] text-gray-600 flex items-start gap-1.5">
                      <span className="text-accent-500 font-bold">•</span>
                      <span>{detail}</span>
                    </li>
                  ))}
                </ul>
              )}

              {parsedData.notes && (
                <div className="pt-2 border-t border-border/80">
                  <span className="text-[10px] uppercase font-semibold text-gray-400 block mb-1">Extracted Notes</span>
                  <p className="text-[11px] text-gray-600 line-clamp-3 bg-gray-50 p-2 rounded-lg whitespace-pre-line font-sans">
                    {parsedData.notes}
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Action Footer */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-3 border-t border-border">
        <div className="text-xs text-muted">
          {isReadyToCreate ? (
            <span className="text-success-600 font-medium flex items-center gap-1">
              <CheckCircle2 size={13} /> Minimum client details satisfied
            </span>
          ) : (
            <span className="text-amber-600 font-medium flex items-center gap-1">
              <AlertTriangle size={13} /> Add at least a full name and email or phone to proceed
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

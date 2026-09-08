'use client'

import React from 'react'
import {
  MessageSquare,
  Send,
  Zap,
  CheckCircle2,
  PhoneCall,
  Clock,
  ExternalLink,
  ShieldCheck,
  Sparkles,
} from 'lucide-react'
import { PageHeader } from '@/components/layout/PageHeader'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'

export default function WhatsAppPage() {
  return (
    <div className="space-y-6 animate-fade-in max-w-4xl mx-auto">
      <PageHeader
        title="WhatsApp Integration"
        subtitle="Automate client notifications, invoice reminders, and payment receipts via WhatsApp."
      />

      {/* Hero card */}
      <div className="rounded-3xl bg-gradient-to-br from-green-600 to-emerald-800 text-white p-8 shadow-xl relative overflow-hidden">
        <div className="relative z-10 space-y-4 max-w-xl">
          <div className="inline-flex items-center gap-2 bg-white/20 px-3 py-1 rounded-full text-xs font-semibold backdrop-blur-md">
            <Sparkles size={14} />
            <span>Phase 5 Upcoming Feature</span>
          </div>
          <h2 className="text-2xl sm:text-3xl font-bold tracking-tight">
            WhatsApp Business Cloud API
          </h2>
          <p className="text-sm text-green-100 leading-relaxed">
            In Phase 4, your system is already prepared with one-click direct WhatsApp links on every client profile, project confirmation modal, and payment link page.
            Full Meta WhatsApp Business Cloud API automated messaging will be activated in Phase 5.
          </p>
        </div>
      </div>

      {/* Preview of automated message format */}
      <Card className="p-6 space-y-4 border-border shadow-card bg-white rounded-3xl">
        <div className="flex items-center justify-between border-b border-border pb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-green-100 text-green-700 flex items-center justify-center">
              <MessageSquare size={18} />
            </div>
            <div>
              <h3 className="font-bold text-gray-900 text-sm">Automated Payment Message Template</h3>
              <p className="text-xs text-muted">Pre-formatted message sent when a project & payment link are created</p>
            </div>
          </div>
          <Badge variant="success" size="sm">Active in Phase 4</Badge>
        </div>

        {/* Mock WhatsApp Message Bubble */}
        <div className="bg-[#EFEAE2] p-5 rounded-2xl border border-gray-200">
          <div className="max-w-md bg-white rounded-2xl rounded-tl-none p-4 shadow-sm space-y-2.5 text-sm text-gray-800 font-sans border border-gray-100">
            <p className="font-medium">
              Hello <span className="text-accent-700 font-bold">John Mensah</span>! 👋
            </p>
            <p className="text-xs text-gray-600">
              Your invoice <strong className="text-gray-800">LM-INV-0001</strong> for your upcoming project is ready.
            </p>
            <div className="bg-gray-50 p-2.5 rounded-xl border border-gray-200 text-xs space-y-1">
              <p>📋 <strong>Service:</strong> Wedding Photography</p>
              <p>📦 <strong>Package:</strong> Premium Wedding Package</p>
              <p>💰 <strong>Total Amount:</strong> GH₵5,000.00</p>
              <p>🔐 <strong>Deposit Required:</strong> GH₵2,000.00</p>
            </div>
            <p className="text-xs text-gray-600">
              Please use the secure link below to complete your payment with Mobile Money or Debit Card:
            </p>
            <div className="p-2 bg-blue-50 border border-blue-200 rounded-xl text-xs text-blue-700 font-mono break-all">
              https://lexmedia.com/pay/p_xxxxxxxxxxxx
            </div>
            <div className="text-right text-[10px] text-gray-400">
              10:45 AM ✓✓
            </div>
          </div>
        </div>
      </Card>

      {/* Feature capabilities grid */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-border shadow-card space-y-2">
          <div className="w-8 h-8 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
            <Send size={16} />
          </div>
          <h4 className="font-bold text-gray-900 text-sm">One-Click Dispatch</h4>
          <p className="text-xs text-muted">
            Admins can currently click "Send via WhatsApp" on any project or payment link to dispatch instantly.
          </p>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-border shadow-card space-y-2">
          <div className="w-8 h-8 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center">
            <CheckCircle2 size={16} />
          </div>
          <h4 className="font-bold text-gray-900 text-sm">Payment Receipts</h4>
          <p className="text-xs text-muted">
            Instant receipt confirmation sent to the client once Paystack verifies transaction completion.
          </p>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-border shadow-card space-y-2">
          <div className="w-8 h-8 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center">
            <Clock size={16} />
          </div>
          <h4 className="font-bold text-gray-900 text-sm">Automated Reminders</h4>
          <p className="text-xs text-muted">
            Scheduled friendly payment reminders for pending balances and upcoming project due dates.
          </p>
        </div>
      </div>
    </div>
  )
}

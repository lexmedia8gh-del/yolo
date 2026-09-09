'use client'

import React, { useState, useEffect, useRef } from 'react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Input, Textarea } from '@/components/ui/Input'
import { InvoiceDocument } from './InvoiceDocument'
import {
  COLLECTIONS,
  getDocuments,
  addDocument,
  updateDocument,
} from '@/lib/firebase/firestore'
import type {
  Invoice,
  InvoiceItem,
  InvoiceStatus,
  InvoiceBusinessInfo,
  InvoiceClientInfo,
  Client,
  Service,
  Package,
  BusinessSettings,
  BrandingSettings,
} from '@/lib/types'
import {
  formatCurrency,
  generateLxmInvoiceNumber,
  generateSecureToken,
  getPaymentLink,
  SUPPORTED_CURRENCIES,
  getCurrencySymbol,
} from '@/lib/utils'
import {
  Plus,
  Trash2,
  Upload,
  Image as ImageIcon,
  X,
  Eye,
  Edit3,
  Save,
  Send,
  Sparkles,
  Building2,
  User,
  Calendar,
  DollarSign,
  FileText,
  CreditCard,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  Link2,
} from 'lucide-react'
import toast from 'react-hot-toast'

interface InvoiceBuilderModalProps {
  isOpen: boolean
  onClose: () => void
  invoiceToEdit?: Invoice | null
  initialDraft?: Partial<Invoice> | null
  existingInvoicesCount: number
  clients: Client[]
  services: Service[]
  packages: Package[]
  onSuccess: (savedInvoice: Invoice) => void
  onSaveAndSend?: (savedInvoice: Invoice) => void
}

const PAYMENT_TERMS_PRESETS = [
  'Due on Receipt',
  'Net 7 (7 Days)',
  'Net 14 (14 Days)',
  'Net 30 (30 Days)',
  '50% Advance / 50% Completion',
  '70% Advance / 30% Completion',
  'Custom Terms',
]

const PAYMENT_METHODS = [
  'Paystack Online',
  'Mobile Money (MTN / Telecel / AT)',
  'Bank Transfer',
  'Cash',
  'Cheque',
  'Credit / Debit Card',
  'Other',
]

export function InvoiceBuilderModal({
  isOpen,
  onClose,
  invoiceToEdit,
  initialDraft,
  existingInvoicesCount,
  clients,
  services,
  packages,
  onSuccess,
  onSaveAndSend,
}: InvoiceBuilderModalProps) {
  const [activeTab, setActiveTab] = useState<'editor' | 'preview'>('editor')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isUploadingLogo, setIsUploadingLogo] = useState(false)

  // ─── Business Info State ───
  const [businessName, setBusinessName] = useState('LEXMEDIA')
  const [businessLogo, setBusinessLogo] = useState('')
  const [businessAddress, setBusinessAddress] = useState('East Legon, Accra, Ghana')
  const [businessPhone, setBusinessPhone] = useState('+233 24 123 4567')
  const [businessWhatsapp, setBusinessWhatsapp] = useState('+233 24 123 4567')
  const [businessEmail, setBusinessEmail] = useState('contact@lexmedia.com')
  const [businessWebsite, setBusinessWebsite] = useState('https://lexmedia.gh')
  const [saveAsDefaultBrand, setSaveAsDefaultBrand] = useState(false)

  // ─── Client Info State ───
  const [selectedClientId, setSelectedClientId] = useState<string>('')
  const [clientName, setClientName] = useState('')
  const [clientCompany, setClientCompany] = useState('')
  const [clientEmail, setClientEmail] = useState('')
  const [clientPhone, setClientPhone] = useState('')
  const [clientAddress, setClientAddress] = useState('')
  const [isAddingNewClient, setIsAddingNewClient] = useState(false)

  // ─── Invoice Metadata State ───
  const [invoiceNumber, setInvoiceNumber] = useState('')
  const [invoiceDate, setInvoiceDate] = useState(new Date().toISOString().split('T')[0])
  const [dueDate, setDueDate] = useState('')
  const [paymentTerms, setPaymentTerms] = useState('Due on Receipt')
  const [currency, setCurrency] = useState('GHS')
  const [status, setStatus] = useState<InvoiceStatus>('Draft')

  // ─── Line Items State ───
  const [items, setItems] = useState<InvoiceItem[]>([
    {
      id: 'item-1',
      title: 'Creative Media Production',
      description: 'Professional photography & videography coverage',
      quantity: 1,
      unitPrice: 1500,
      total: 1500,
    },
  ])

  // ─── Financial Calculations State ───
  const [discountType, setDiscountType] = useState<'percentage' | 'fixed'>('percentage')
  const [discountValue, setDiscountValue] = useState<number>(0)
  const [taxRate, setTaxRate] = useState<number>(0)
  const [amountPaid, setAmountPaid] = useState<number>(0)

  // ─── Payment Tracking & Link ───
  const [paymentMethod, setPaymentMethod] = useState('Paystack Online')
  const [paymentDate, setPaymentDate] = useState('')
  const [paymentReference, setPaymentReference] = useState('')
  const [paymentNotes, setPaymentNotes] = useState('')
  const [generatePaymentLinkOption, setGeneratePaymentLinkOption] = useState(true)

  // ─── Notes & Terms ───
  const [notes, setNotes] = useState('')
  const [terms, setTerms] = useState(
    'Payment is due according to selected payment terms. Production deliverables will be released upon full invoice settlement.'
  )
  const [paymentInstructions, setPaymentInstructions] = useState(
    'Mobile Money: 024 123 4567 (LEXMEDIA)\nBank Transfer: Standard Chartered Bank, Acc: 010023456789'
  )
  const [thankYouMessage, setThankYouMessage] = useState(
    'Thank you for partnering with LexMedia! We appreciate your business.'
  )

  const logoInputRef = useRef<HTMLInputElement>(null)

  // Load defaults from Brand Profile / Settings or populate from invoiceToEdit / initialDraft
  useEffect(() => {
    if (!isOpen) return

    if (invoiceToEdit) {
      // Populating for Edit
      setInvoiceNumber(invoiceToEdit.invoiceNumber || '')
      setInvoiceDate(
        invoiceToEdit.invoiceDate
          ? (typeof invoiceToEdit.invoiceDate === 'string'
              ? invoiceToEdit.invoiceDate.split('T')[0]
              : new Date().toISOString().split('T')[0])
          : new Date().toISOString().split('T')[0]
      )
      setDueDate(
        invoiceToEdit.dueDate
          ? (typeof invoiceToEdit.dueDate === 'string'
              ? invoiceToEdit.dueDate.split('T')[0]
              : '')
          : ''
      )
      setPaymentTerms(invoiceToEdit.paymentTerms || 'Due on Receipt')
      setCurrency(invoiceToEdit.currency || 'GHS')
      setStatus(invoiceToEdit.status || 'Draft')

      // Business Info
      if (invoiceToEdit.businessInfo) {
        setBusinessName(invoiceToEdit.businessInfo.name || 'LEXMEDIA')
        setBusinessLogo(invoiceToEdit.businessInfo.logo || '')
        setBusinessAddress(invoiceToEdit.businessInfo.address || '')
        setBusinessPhone(invoiceToEdit.businessInfo.phone || '')
        setBusinessWhatsapp(invoiceToEdit.businessInfo.whatsapp || '')
        setBusinessEmail(invoiceToEdit.businessInfo.email || '')
        setBusinessWebsite(invoiceToEdit.businessInfo.website || '')
      }

      // Client Info
      setSelectedClientId(invoiceToEdit.clientId || '')
      setClientName(invoiceToEdit.clientName || '')
      setClientCompany(invoiceToEdit.clientCompany || '')
      setClientEmail(invoiceToEdit.clientEmail || '')
      setClientPhone(invoiceToEdit.clientPhone || '')
      setClientAddress(invoiceToEdit.clientAddress || '')

      // Items
      if (invoiceToEdit.items && invoiceToEdit.items.length > 0) {
        setItems(invoiceToEdit.items)
      }

      // Financials
      setDiscountType(invoiceToEdit.discountType || 'percentage')
      setDiscountValue(invoiceToEdit.discountValue || 0)
      setTaxRate(invoiceToEdit.taxRate || 0)
      setAmountPaid(invoiceToEdit.amountPaid || 0)

      // Payment
      setPaymentMethod(invoiceToEdit.paymentMethod || 'Paystack Online')
      setPaymentReference(invoiceToEdit.paymentReference || '')
      setPaymentNotes(invoiceToEdit.paymentNotes || '')

      // Notes & terms
      setNotes(invoiceToEdit.notes || '')
      setTerms(invoiceToEdit.terms || '')
      setPaymentInstructions(invoiceToEdit.paymentInstructions || '')
      setThankYouMessage(invoiceToEdit.thankYouMessage || '')
    } else {
      // New Invoice (or Duplicated Draft)
      const nextInvNumber = initialDraft?.invoiceNumber || generateLxmInvoiceNumber(existingInvoicesCount)
      setInvoiceNumber(nextInvNumber)
      setInvoiceDate(new Date().toISOString().split('T')[0])
      
      // Default due date: 7 days out
      const defaultDue = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
      setDueDate(defaultDue)
      setStatus(initialDraft?.status || 'Draft')

      if (initialDraft) {
        if (initialDraft.clientName) setClientName(initialDraft.clientName)
        if (initialDraft.clientEmail) setClientEmail(initialDraft.clientEmail)
        if (initialDraft.clientId) setSelectedClientId(initialDraft.clientId)
        if (initialDraft.currency) setCurrency(initialDraft.currency)
        if (initialDraft.items) setItems(initialDraft.items)
        if (initialDraft.notes) setNotes(initialDraft.notes)
        if (initialDraft.terms) setTerms(initialDraft.terms)
      } else {
        // Load default brand profile from Firestore settings
        getDocuments<BrandingSettings>(COLLECTIONS.SETTINGS).then((settingsDocs) => {
          const brandDoc = settingsDocs.find((d: any) => d.id === 'branding') as BrandingSettings | undefined
          const bizDoc = settingsDocs.find((d: any) => d.id === 'business') as Partial<BusinessSettings> | undefined

          if (brandDoc) {
            if (brandDoc.businessName) setBusinessName(brandDoc.businessName)
            if (brandDoc.logoUrl) setBusinessLogo(brandDoc.logoUrl)
          }
          if (bizDoc) {
            if (bizDoc.businessName) setBusinessName(bizDoc.businessName)
            if (bizDoc.address) setBusinessAddress(bizDoc.address)
            if (bizDoc.phone) setBusinessPhone(bizDoc.phone)
            if (bizDoc.whatsapp) setBusinessWhatsapp(bizDoc.whatsapp)
            if (bizDoc.email) setBusinessEmail(bizDoc.email)
            if (bizDoc.website) setBusinessWebsite(bizDoc.website)
            if (bizDoc.logoURL && !brandDoc?.logoUrl) setBusinessLogo(bizDoc.logoURL)
            if (bizDoc.defaultTermsAndConditions) setTerms(bizDoc.defaultTermsAndConditions)
            if (bizDoc.defaultNotes) setNotes(bizDoc.defaultNotes)
            if (bizDoc.defaultPaymentInstructions) setPaymentInstructions(bizDoc.defaultPaymentInstructions)
            if (bizDoc.defaultThankYouMessage) setThankYouMessage(bizDoc.defaultThankYouMessage)
          }
        }).catch((e) => console.warn('Could not load brand settings:', e))
      }
    }
  }, [isOpen, invoiceToEdit, initialDraft, existingInvoicesCount])

  // Autofill client fields when selected from dropdown
  const handleClientSelect = (clientId: string) => {
    setSelectedClientId(clientId)
    if (clientId === 'new') {
      setIsAddingNewClient(true)
      return
    }
    setIsAddingNewClient(false)
    const match = clients.find((c) => c.id === clientId)
    if (match) {
      setClientName(match.fullName || '')
      setClientCompany(match.company || '')
      setClientEmail(match.email || '')
      setClientPhone(match.phone || '')
      setClientAddress(match.address || '')
    }
  }

  // Quick preset due date helper
  const handleSetDuePreset = (days: number) => {
    if (days === 0) {
      setDueDate(invoiceDate)
      setPaymentTerms('Due on Receipt')
    } else {
      const base = new Date(invoiceDate || Date.now())
      base.setDate(base.getDate() + days)
      setDueDate(base.toISOString().split('T')[0])
      setPaymentTerms(`Net ${days} (${days} Days)`)
    }
  }

  // Brand Logo Upload handler
  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setIsUploadingLogo(true)
    const toastId = toast.loading('Uploading brand logo...')

    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('fieldKey', 'logo')

      const res = await fetch('/api/branding/upload', {
        method: 'POST',
        body: formData,
      })

      const data = await res.json()
      if (!res.ok || !data.downloadUrl) {
        throw new Error(data.error || 'Upload failed')
      }

      setBusinessLogo(data.downloadUrl)
      toast.success('Logo uploaded successfully!', { id: toastId })

      // If user selected "Save as default business logo", immediately update Firestore settings
      if (saveAsDefaultBrand) {
        try {
          await updateDocument(COLLECTIONS.SETTINGS, 'branding', { logoUrl: data.downloadUrl })
          await updateDocument(COLLECTIONS.SETTINGS, 'business', { logoURL: data.downloadUrl })
          toast.success('Saved as default business logo')
        } catch (setErr) {
          console.warn('Could not update default brand settings:', setErr)
        }
      }
    } catch (err: any) {
      console.error('Logo upload error:', err)
      toast.error(err.message || 'Failed to upload logo', { id: toastId })
    } finally {
      setIsUploadingLogo(false)
      if (logoInputRef.current) logoInputRef.current.value = ''
    }
  }

  const handleRemoveLogo = () => {
    setBusinessLogo('')
    toast.success('Logo removed from invoice')
  }

  // Dynamic Line Items operations
  const handleAddItem = () => {
    const newItem: InvoiceItem = {
      id: `item-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      title: '',
      description: '',
      quantity: 1,
      unitPrice: 0,
      total: 0,
    }
    setItems([...items, newItem])
  }

  const handleUpdateItem = (
    index: number,
    field: keyof InvoiceItem,
    val: string | number
  ) => {
    const updated = [...items]
    const current = { ...updated[index] }

    if (field === 'quantity' || field === 'unitPrice') {
      const numVal = Math.max(0, Number(val) || 0)
      if (field === 'quantity') current.quantity = numVal
      if (field === 'unitPrice') current.unitPrice = numVal
      current.total = (current.quantity || 1) * (current.unitPrice || 0)
    } else if (field === 'title' || field === 'description') {
      current[field] = String(val) as any
    }

    updated[index] = current
    setItems(updated)
  }

  const handleDeleteItem = (index: number) => {
    if (items.length <= 1) {
      toast.error('Invoice must have at least one line item.')
      return
    }
    setItems(items.filter((_, i) => i !== index))
  }

  const handleAddFromCatalog = (type: 'service' | 'package', id: string) => {
    if (type === 'service') {
      const s = services.find((srv) => srv.id === id)
      if (s) {
        const newItem: InvoiceItem = {
          id: `item-${Date.now()}`,
          title: s.name,
          description: s.description || s.name,
          quantity: 1,
          unitPrice: s.defaultPrice || 0,
          total: s.defaultPrice || 0,
        }
        setItems([...items, newItem])
        toast.success(`Added ${s.name} to invoice`)
      }
    } else {
      const p = packages.find((pkg) => pkg.id === id)
      if (p) {
        const desc = p.whatsIncluded?.map((w) => w.text).join(', ') || p.description || p.title
        const newItem: InvoiceItem = {
          id: `item-${Date.now()}`,
          title: p.title,
          description: desc,
          quantity: 1,
          unitPrice: p.price || 0,
          total: p.price || 0,
        }
        setItems([...items, newItem])
        toast.success(`Added ${p.title} to invoice`)
      }
    }
  }

  // Financial Calculations
  const subtotal = items.reduce((acc, it) => acc + (Number(it.total) || 0), 0)
  const discountAmount =
    discountType === 'percentage'
      ? (subtotal * (Number(discountValue) || 0)) / 100
      : Math.min(subtotal, Number(discountValue) || 0)
  const taxableAmount = Math.max(0, subtotal - discountAmount)
  const taxAmount = (taxableAmount * (Number(taxRate) || 0)) / 100
  const grandTotal = Math.max(0, taxableAmount + taxAmount)
  const balanceDue = Math.max(0, grandTotal - (Number(amountPaid) || 0))
  const symbol = getCurrencySymbol(currency)

  // Construct draft invoice representation for preview
  const currentInvoiceDraft: Partial<Invoice> = {
    id: invoiceToEdit?.id || 'new-invoice',
    invoiceNumber: invoiceNumber || 'LEX-INV-0001',
    clientId: selectedClientId,
    clientName: clientName || 'Valued Client',
    clientCompany,
    clientEmail,
    clientPhone,
    clientAddress,
    businessInfo: {
      name: businessName,
      logo: businessLogo,
      address: businessAddress,
      phone: businessPhone,
      whatsapp: businessWhatsapp,
      email: businessEmail,
      website: businessWebsite,
    },
    clientInfo: {
      id: selectedClientId,
      name: clientName,
      company: clientCompany,
      email: clientEmail,
      phone: clientPhone,
      address: clientAddress,
    },
    items,
    subtotal,
    discountType,
    discountValue,
    discountAmount,
    taxRate,
    taxAmount,
    total: grandTotal,
    amountPaid,
    balanceDue,
    currency,
    currencySymbol: symbol,
    status,
    paymentTerms,
    paymentMethod,
    paymentDate,
    paymentReference,
    paymentNotes,
    notes,
    terms,
    paymentInstructions,
    thankYouMessage,
    invoiceDate,
    dueDate,
  }

  // Save invoice (Draft, Created, or Updated)
  const handleSaveInvoice = async (targetStatus?: InvoiceStatus, sendAfterSave = false) => {
    if (!invoiceNumber.trim()) {
      toast.error('Invoice number is required.')
      return
    }
    if (!clientName.trim()) {
      toast.error('Client name is required.')
      return
    }
    if (items.length === 0) {
      toast.error('Please add at least one line item.')
      return
    }

    setIsSubmitting(true)
    const toastId = toast.loading('Saving invoice...')

    try {
      let finalClientId = selectedClientId

      // If user added a new client inline, save client to Firestore
      if (isAddingNewClient && (!finalClientId || finalClientId === 'new')) {
        try {
          const newClientId = await addDocument(COLLECTIONS.CLIENTS, {
            fullName: clientName.trim(),
            company: clientCompany.trim(),
            email: clientEmail.trim(),
            phone: clientPhone.trim(),
            address: clientAddress.trim(),
            status: 'Active',
            createdAt: new Date().toISOString(),
          })
          finalClientId = newClientId
        } catch (err) {
          console.warn('Could not create new client in clients collection:', err)
        }
      }

      // If user opted to save business defaults
      if (saveAsDefaultBrand) {
        try {
          await updateDocument(COLLECTIONS.SETTINGS, 'business', {
            businessName,
            address: businessAddress,
            phone: businessPhone,
            whatsapp: businessWhatsapp,
            email: businessEmail,
            website: businessWebsite,
            logoURL: businessLogo,
            defaultPaymentTerms: paymentTerms,
            defaultTermsAndConditions: terms,
            defaultNotes: notes,
            defaultPaymentInstructions: paymentInstructions,
            defaultThankYouMessage: thankYouMessage,
          })
          await updateDocument(COLLECTIONS.SETTINGS, 'branding', {
            businessName,
            logoUrl: businessLogo,
          })
        } catch (bErr) {
          console.warn('Could not persist default business info:', bErr)
        }
      }

      const finalStatus = targetStatus || status

      // Generate or retain payment link
      let paymentLinkId = invoiceToEdit?.paymentLinkId
      let paymentLinkUrl = invoiceToEdit?.paymentLinkUrl
      let paymentLinkToken = invoiceToEdit?.paymentLinkToken

      if (generatePaymentLinkOption && (!paymentLinkToken || !paymentLinkUrl)) {
        try {
          const token = generateSecureToken('pay_')
          paymentLinkToken = token
          paymentLinkUrl = getPaymentLink(token)

          const linkDocId = await addDocument(COLLECTIONS.CLIENT_LINKS, {
            token,
            clientId: finalClientId || '',
            clientName: clientName.trim(),
            clientEmail: clientEmail.trim(),
            invoiceNumber: invoiceNumber.trim(),
            amount: balanceDue > 0 ? balanceDue : grandTotal,
            currency,
            status: finalStatus === 'Paid' ? 'Paid' : 'Pending Payment',
            createdBy: 'admin',
            createdAt: new Date().toISOString(),
          })
          paymentLinkId = linkDocId
        } catch (linkErr) {
          console.warn('Could not generate client link document:', linkErr)
        }
      }

      const invoicePayload: Partial<Invoice> = {
        invoiceNumber: invoiceNumber.trim(),
        clientId: finalClientId || '',
        clientName: clientName.trim(),
        clientCompany: clientCompany.trim(),
        clientEmail: clientEmail.trim(),
        clientPhone: clientPhone.trim(),
        clientAddress: clientAddress.trim(),
        businessInfo: {
          name: businessName.trim(),
          logo: businessLogo,
          address: businessAddress.trim(),
          phone: businessPhone.trim(),
          whatsapp: businessWhatsapp.trim(),
          email: businessEmail.trim(),
          website: businessWebsite.trim(),
        },
        clientInfo: {
          id: finalClientId || '',
          name: clientName.trim(),
          company: clientCompany.trim(),
          email: clientEmail.trim(),
          phone: clientPhone.trim(),
          address: clientAddress.trim(),
        },
        items,
        subtotal,
        discountType,
        discountValue,
        discountAmount,
        taxRate,
        taxAmount,
        total: grandTotal,
        amountPaid,
        balanceDue,
        currency,
        currencySymbol: symbol,
        status: finalStatus,
        paymentTerms,
        paymentMethod,
        paymentDate: paymentDate || '',
        paymentReference: paymentReference.trim(),
        paymentNotes: paymentNotes.trim(),
        paymentLinkId: paymentLinkId || '',
        paymentLinkUrl: paymentLinkUrl || '',
        paymentLinkToken: paymentLinkToken || '',
        notes: notes.trim(),
        terms: terms.trim(),
        paymentInstructions: paymentInstructions.trim(),
        thankYouMessage: thankYouMessage.trim(),
        invoiceDate,
        dueDate: dueDate || '',
        updatedAt: new Date().toISOString(),
      }

      let savedInvoice: Invoice

      if (invoiceToEdit && invoiceToEdit.id) {
        await updateDocument(COLLECTIONS.INVOICES, invoiceToEdit.id, invoicePayload)
        savedInvoice = {
          ...invoiceToEdit,
          ...invoicePayload,
          id: invoiceToEdit.id,
        } as Invoice
        toast.success(`Invoice ${invoiceNumber} updated!`, { id: toastId })
      } else {
        const createdDocId = await addDocument(COLLECTIONS.INVOICES, {
          ...invoicePayload,
          createdAt: new Date().toISOString(),
          createdBy: 'admin',
        })
        savedInvoice = {
          ...invoicePayload,
          id: createdDocId,
        } as Invoice
        toast.success(`Invoice ${invoiceNumber} created!`, { id: toastId })
      }

      onSuccess(savedInvoice)

      if (sendAfterSave && onSaveAndSend) {
        onSaveAndSend(savedInvoice)
      } else {
        onClose()
      }
    } catch (err: any) {
      console.error('Save invoice error:', err)
      toast.error(err.message || 'Failed to save invoice', { id: toastId })
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title=""
      size="full"
    >
      <div className="space-y-6">
        {/* ─── Top Header & Controls ─── */}
        <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-gray-200">
          <div>
            <h2 className="text-xl font-bold text-gray-900">
              {invoiceToEdit ? 'Edit Invoice' : 'Create Custom Invoice'}
            </h2>
            <p className="text-xs text-gray-500">
              Create professional, customizable invoices for any client, service, or product.
            </p>
          </div>

          <div className="flex items-center gap-2">
            {/* View Tab Switcher */}
            <div className="flex items-center bg-gray-100 rounded-lg p-0.5 text-xs font-semibold text-gray-600">
              <button
                type="button"
                onClick={() => setActiveTab('editor')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md transition-all ${
                  activeTab === 'editor'
                    ? 'bg-white text-gray-900 shadow-xs'
                    : 'text-gray-500 hover:text-gray-900'
                }`}
              >
                <Edit3 size={13} />
                Editor
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('preview')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md transition-all ${
                  activeTab === 'preview'
                    ? 'bg-white text-gray-900 shadow-xs'
                    : 'text-gray-500 hover:text-gray-900'
                }`}
              >
                <Eye size={13} />
                Live Preview
              </button>
            </div>

            <Button
              variant="outline"
              size="sm"
              onClick={() => handleSaveInvoice('Draft')}
              disabled={isSubmitting}
            >
              Save as Draft
            </Button>

            <Button
              variant="outline"
              size="sm"
              icon={<Send size={13} />}
              onClick={() => handleSaveInvoice('Sent', true)}
              disabled={isSubmitting}
              className="text-blue-700 border-blue-200 hover:bg-blue-50"
            >
              Save &amp; Send
            </Button>

            <Button
              variant="primary"
              size="sm"
              icon={<Save size={13} />}
              loading={isSubmitting}
              onClick={() => handleSaveInvoice()}
            >
              {invoiceToEdit ? 'Update Invoice' : 'Save Invoice'}
            </Button>
          </div>
        </div>

        {/* ─── Mode 1: Live Preview Mode ─── */}
        {activeTab === 'preview' && (
          <div className="bg-slate-100 p-4 sm:p-8 rounded-xl max-h-[75vh] overflow-y-auto">
            <InvoiceDocument
              invoice={currentInvoiceDraft}
              elementId="builder-live-preview-render"
              showPaymentButton={true}
              paymentUrl={currentInvoiceDraft.paymentLinkUrl || ''}
            />
          </div>
        )}

        {/* ─── Mode 2: Editor Mode ─── */}
        {activeTab === 'editor' && (
          <div className="space-y-8 max-h-[75vh] overflow-y-auto pr-1">
            {/* ─── SECTION 1: BUSINESS / BRAND INFORMATION & LOGO UPLOAD ─── */}
            <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-4">
              <div className="flex items-center justify-between border-b border-gray-100 pb-3">
                <div className="flex items-center gap-2">
                  <Building2 size={16} className="text-gray-500" />
                  <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wider">
                    1. Business &amp; Brand Profile
                  </h3>
                </div>
                <span className="text-[11px] text-gray-400">Default info pre-filled from settings</span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {/* Logo Uploader Column */}
                <div className="space-y-2">
                  <label className="block text-xs font-semibold text-gray-700">
                    Business Logo (PNG, JPG, WebP, SVG)
                  </label>
                  <div className="border border-dashed border-gray-300 rounded-xl p-3 bg-gray-50/60 flex flex-col items-center justify-center min-h-[140px] text-center space-y-2">
                    {businessLogo ? (
                      <div className="relative group w-full flex flex-col items-center">
                        <img
                          src={businessLogo}
                          alt="Brand Logo"
                          className="max-h-20 max-w-[180px] object-contain rounded-md"
                        />
                        <div className="flex items-center gap-2 mt-2">
                          <button
                            type="button"
                            onClick={() => logoInputRef.current?.click()}
                            className="text-xs text-blue-600 hover:text-blue-800 font-semibold"
                          >
                            Replace
                          </button>
                          <span className="text-gray-300">·</span>
                          <button
                            type="button"
                            onClick={handleRemoveLogo}
                            className="text-xs text-rose-600 hover:text-rose-800 font-semibold"
                          >
                            Remove
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className="w-12 h-12 rounded-lg bg-gray-200 flex items-center justify-center text-gray-400">
                          <ImageIcon size={22} />
                        </div>
                        <div>
                          <button
                            type="button"
                            onClick={() => logoInputRef.current?.click()}
                            disabled={isUploadingLogo}
                            className="text-xs font-semibold text-blue-600 hover:text-blue-800 underline"
                          >
                            {isUploadingLogo ? 'Uploading...' : 'Click to Upload Logo'}
                          </button>
                          <p className="text-[11px] text-gray-400 mt-0.5">PNG, JPG, SVG up to 5MB</p>
                        </div>
                      </>
                    )}

                    <input
                      ref={logoInputRef}
                      type="file"
                      accept="image/png, image/jpeg, image/webp, image/svg+xml"
                      onChange={handleLogoUpload}
                      className="hidden"
                    />
                  </div>

                  <label className="flex items-center gap-2 text-xs text-gray-600 cursor-pointer pt-1">
                    <input
                      type="checkbox"
                      checked={saveAsDefaultBrand}
                      onChange={(e) => setSaveAsDefaultBrand(e.target.checked)}
                      className="rounded text-blue-600"
                    />
                    <span>Save profile &amp; logo as default for future invoices</span>
                  </label>
                </div>

                {/* Business Details Columns */}
                <div className="md:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Input
                    label="Business Name *"
                    required
                    value={businessName}
                    onChange={(e) => setBusinessName(e.target.value)}
                    placeholder="e.g. LEXMEDIA"
                  />
                  <Input
                    label="Business Email"
                    type="email"
                    value={businessEmail}
                    onChange={(e) => setBusinessEmail(e.target.value)}
                    placeholder="billing@lexmedia.com"
                  />
                  <Input
                    label="Phone Number"
                    value={businessPhone}
                    onChange={(e) => setBusinessPhone(e.target.value)}
                    placeholder="+233 24 123 4567"
                  />
                  <Input
                    label="WhatsApp"
                    value={businessWhatsapp}
                    onChange={(e) => setBusinessWhatsapp(e.target.value)}
                    placeholder="+233 24 123 4567"
                  />
                  <Input
                    label="Website URL"
                    value={businessWebsite}
                    onChange={(e) => setBusinessWebsite(e.target.value)}
                    placeholder="https://lexmedia.gh"
                  />
                  <Input
                    label="Physical Address"
                    value={businessAddress}
                    onChange={(e) => setBusinessAddress(e.target.value)}
                    placeholder="East Legon, Accra, Ghana"
                  />
                </div>
              </div>
            </div>

            {/* ─── SECTION 2: CLIENT INFORMATION ─── */}
            <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-4">
              <div className="flex items-center justify-between border-b border-gray-100 pb-3">
                <div className="flex items-center gap-2">
                  <User size={16} className="text-gray-500" />
                  <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wider">
                    2. Client Information
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => setIsAddingNewClient(!isAddingNewClient)}
                  className="text-xs text-blue-600 hover:text-blue-800 font-semibold"
                >
                  {isAddingNewClient ? '← Select Existing Client' : '+ Create New Client Directly'}
                </button>
              </div>

              {!isAddingNewClient ? (
                <div className="space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="sm:col-span-2 space-y-1.5">
                      <label className="block text-xs font-semibold text-gray-700">
                        Choose Existing Client *
                      </label>
                      <select
                        value={selectedClientId}
                        onChange={(e) => handleClientSelect(e.target.value)}
                        className="w-full px-3 py-2 text-xs rounded-lg border border-gray-300 focus:ring-2 focus:ring-blue-500 bg-white"
                      >
                        <option value="">-- Select Client --</option>
                        {clients.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.fullName} {c.company ? `(${c.company})` : ''} — {c.email}
                          </option>
                        ))}
                        <option value="new">+ Add New Client Inline</option>
                      </select>
                    </div>

                    <Input
                      label="Client Name *"
                      required
                      value={clientName}
                      onChange={(e) => setClientName(e.target.value)}
                      placeholder="e.g. Ama Mensah"
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <Input
                      label="Company / Business Name"
                      value={clientCompany}
                      onChange={(e) => setClientCompany(e.target.value)}
                      placeholder="e.g. Mensah Corp Ltd"
                    />
                    <Input
                      label="Client Email *"
                      type="email"
                      value={clientEmail}
                      onChange={(e) => setClientEmail(e.target.value)}
                      placeholder="ama@mensahcorp.com"
                    />
                    <Input
                      label="Client Phone"
                      value={clientPhone}
                      onChange={(e) => setClientPhone(e.target.value)}
                      placeholder="+233 50 987 6543"
                    />
                  </div>
                </div>
              ) : (
                <div className="space-y-3 bg-blue-50/40 p-4 rounded-xl border border-blue-100">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-blue-900">
                      New Client Details (will be saved automatically)
                    </span>
                    <button
                      type="button"
                      onClick={() => setIsAddingNewClient(false)}
                      className="text-xs text-gray-500 hover:text-gray-800"
                    >
                      Cancel &amp; Select Existing
                    </button>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <Input
                      label="Full Name *"
                      required
                      value={clientName}
                      onChange={(e) => setClientName(e.target.value)}
                      placeholder="John Doe"
                    />
                    <Input
                      label="Company Name"
                      value={clientCompany}
                      onChange={(e) => setClientCompany(e.target.value)}
                      placeholder="Acme Studios"
                    />
                    <Input
                      label="Email Address *"
                      type="email"
                      value={clientEmail}
                      onChange={(e) => setClientEmail(e.target.value)}
                      placeholder="john@example.com"
                    />
                    <Input
                      label="Phone Number"
                      value={clientPhone}
                      onChange={(e) => setClientPhone(e.target.value)}
                      placeholder="+233 20 123 4567"
                    />
                    <div className="sm:col-span-2">
                      <Input
                        label="Client Address"
                        value={clientAddress}
                        onChange={(e) => setClientAddress(e.target.value)}
                        placeholder="Airport Residential, Accra"
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* ─── SECTION 3: INVOICE DETAILS & METADATA ─── */}
            <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-4">
              <div className="flex items-center gap-2 border-b border-gray-100 pb-3">
                <Calendar size={16} className="text-gray-500" />
                <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wider">
                  3. Invoice Details
                </h3>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                <Input
                  label="Invoice Number *"
                  required
                  value={invoiceNumber}
                  onChange={(e) => setInvoiceNumber(e.target.value)}
                  placeholder="LEX-INV-0001"
                />

                <Input
                  label="Invoice Date *"
                  type="date"
                  required
                  value={invoiceDate}
                  onChange={(e) => setInvoiceDate(e.target.value)}
                />

                <div className="space-y-1">
                  <Input
                    label="Due Date"
                    type="date"
                    value={dueDate}
                    onChange={(e) => setDueDate(e.target.value)}
                  />
                  {/* Quick Due Presets */}
                  <div className="flex items-center gap-1 text-[10px] text-gray-500 pt-0.5">
                    <span className="text-gray-400">Presets:</span>
                    <button
                      type="button"
                      onClick={() => handleSetDuePreset(0)}
                      className="text-blue-600 hover:underline"
                    >
                      Today
                    </button>
                    <span>·</span>
                    <button
                      type="button"
                      onClick={() => handleSetDuePreset(7)}
                      className="text-blue-600 hover:underline"
                    >
                      +7d
                    </button>
                    <span>·</span>
                    <button
                      type="button"
                      onClick={() => handleSetDuePreset(14)}
                      className="text-blue-600 hover:underline"
                    >
                      +14d
                    </button>
                    <span>·</span>
                    <button
                      type="button"
                      onClick={() => handleSetDuePreset(30)}
                      className="text-blue-600 hover:underline"
                    >
                      +30d
                    </button>
                  </div>
                </div>

                {/* Currency Selector */}
                <div className="space-y-1.5">
                  <label className="block text-xs font-semibold text-gray-700">Currency *</label>
                  <select
                    value={currency}
                    onChange={(e) => setCurrency(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-lg border border-gray-300 focus:ring-2 focus:ring-blue-500 bg-white font-medium"
                  >
                    {SUPPORTED_CURRENCIES.map((c) => (
                      <option key={c.code} value={c.code}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                <div className="space-y-1.5">
                  <label className="block text-xs font-semibold text-gray-700">Payment Terms</label>
                  <select
                    value={paymentTerms}
                    onChange={(e) => setPaymentTerms(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-lg border border-gray-300 focus:ring-2 focus:ring-blue-500 bg-white"
                  >
                    {PAYMENT_TERMS_PRESETS.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="block text-xs font-semibold text-gray-700">Invoice Status</label>
                  <select
                    value={status}
                    onChange={(e) => setStatus(e.target.value as InvoiceStatus)}
                    className="w-full px-3 py-2 text-xs rounded-lg border border-gray-300 focus:ring-2 focus:ring-blue-500 bg-white font-medium"
                  >
                    <option value="Draft">Draft</option>
                    <option value="Sent">Sent</option>
                    <option value="Pending">Pending</option>
                    <option value="Partially Paid">Partially Paid</option>
                    <option value="Paid">Paid</option>
                    <option value="Overdue">Overdue</option>
                    <option value="Cancelled">Cancelled</option>
                  </select>
                </div>
              </div>
            </div>

            {/* ─── SECTION 4: UNLIMITED DYNAMIC LINE ITEMS ─── */}
            <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-100 pb-3">
                <div className="flex items-center gap-2">
                  <DollarSign size={16} className="text-gray-500" />
                  <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wider">
                    4. Line Items &amp; Services
                  </h3>
                </div>

                {/* Pre-saved Catalog Pickers */}
                <div className="flex items-center gap-2">
                  {services.length > 0 && (
                    <select
                      onChange={(e) => {
                        if (e.target.value) {
                          handleAddFromCatalog('service', e.target.value)
                          e.target.value = ''
                        }
                      }}
                      className="px-2.5 py-1 text-xs rounded-md border border-gray-300 bg-white text-gray-700"
                    >
                      <option value="">+ Add Service</option>
                      {services.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name} ({formatCurrency(s.defaultPrice || 0, currency, symbol)})
                        </option>
                      ))}
                    </select>
                  )}

                  {packages.length > 0 && (
                    <select
                      onChange={(e) => {
                        if (e.target.value) {
                          handleAddFromCatalog('package', e.target.value)
                          e.target.value = ''
                        }
                      }}
                      className="px-2.5 py-1 text-xs rounded-md border border-gray-300 bg-white text-gray-700"
                    >
                      <option value="">+ Add Package</option>
                      {packages.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.title} ({formatCurrency(p.price || 0, currency, symbol)})
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              </div>

              {/* Items List */}
              <div className="space-y-3">
                {items.map((item, idx) => (
                  <div
                    key={item.id || idx}
                    className="p-3 bg-gray-50/70 border border-gray-200 rounded-xl grid grid-cols-1 sm:grid-cols-12 gap-3 items-start"
                  >
                    <div className="sm:col-span-5 space-y-1.5">
                      <Input
                        label={idx === 0 ? 'Item / Service Title *' : undefined}
                        value={item.title || ''}
                        onChange={(e) => handleUpdateItem(idx, 'title', e.target.value)}
                        placeholder="e.g. Wedding Cinematic Coverage"
                      />
                      <Input
                        label={idx === 0 ? 'Description (Optional)' : undefined}
                        value={item.description || ''}
                        onChange={(e) => handleUpdateItem(idx, 'description', e.target.value)}
                        placeholder="Details of delivery, dates, specifics..."
                      />
                    </div>

                    <div className="sm:col-span-2">
                      <Input
                        label={idx === 0 ? 'Quantity' : undefined}
                        type="number"
                        min="1"
                        value={item.quantity || 1}
                        onChange={(e) => handleUpdateItem(idx, 'quantity', e.target.value)}
                      />
                    </div>

                    <div className="sm:col-span-2">
                      <Input
                        label={idx === 0 ? `Rate (${symbol})` : undefined}
                        type="number"
                        step="0.01"
                        min="0"
                        value={item.unitPrice || 0}
                        onChange={(e) => handleUpdateItem(idx, 'unitPrice', e.target.value)}
                      />
                    </div>

                    <div className="sm:col-span-2 text-right">
                      {idx === 0 && (
                        <span className="block text-xs font-semibold text-gray-700 mb-1.5">
                          Line Total
                        </span>
                      )}
                      <p className="font-mono font-bold text-gray-900 text-sm py-2">
                        {formatCurrency(item.total || 0, currency, symbol)}
                      </p>
                    </div>

                    <div className="sm:col-span-1 flex justify-end pt-1">
                      <button
                        type="button"
                        onClick={() => handleDeleteItem(idx)}
                        className="p-2 text-gray-400 hover:text-rose-600 transition-colors"
                        title="Delete line item"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                ))}

                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  icon={<Plus size={13} />}
                  onClick={handleAddItem}
                  className="w-full border-dashed"
                >
                  Add Another Line Item
                </Button>
              </div>

              {/* ─── Calculations Summary ─── */}
              <div className="border-t border-gray-200 pt-4 flex flex-col sm:flex-row justify-between items-start gap-6">
                <div className="grid grid-cols-2 gap-3 w-full sm:max-w-md">
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1">
                      Discount
                    </label>
                    <div className="flex gap-1">
                      <select
                        value={discountType}
                        onChange={(e) => setDiscountType(e.target.value as 'percentage' | 'fixed')}
                        className="px-2 py-1.5 text-xs rounded-lg border border-gray-300 bg-white"
                      >
                        <option value="percentage">%</option>
                        <option value="fixed">{symbol}</option>
                      </select>
                      <input
                        type="number"
                        min="0"
                        value={discountValue || ''}
                        onChange={(e) => setDiscountValue(parseFloat(e.target.value) || 0)}
                        placeholder="0"
                        className="w-full px-2 py-1.5 text-xs rounded-lg border border-gray-300 focus:ring-2 focus:ring-blue-500 bg-white"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1">
                      Tax Rate (%)
                    </label>
                    <input
                      type="number"
                      min="0"
                      step="0.1"
                      value={taxRate || ''}
                      onChange={(e) => setTaxRate(parseFloat(e.target.value) || 0)}
                      placeholder="e.g. 15"
                      className="w-full px-2 py-1.5 text-xs rounded-lg border border-gray-300 focus:ring-2 focus:ring-blue-500 bg-white"
                    />
                  </div>
                </div>

                <div className="w-full sm:w-72 bg-gray-50 border border-gray-200 rounded-xl p-4 space-y-2 text-xs">
                  <div className="flex justify-between text-gray-600">
                    <span>Subtotal:</span>
                    <span className="font-mono font-medium text-gray-900">
                      {formatCurrency(subtotal, currency, symbol)}
                    </span>
                  </div>
                  {discountAmount > 0 && (
                    <div className="flex justify-between text-emerald-700">
                      <span>Discount:</span>
                      <span className="font-mono">-{formatCurrency(discountAmount, currency, symbol)}</span>
                    </div>
                  )}
                  {taxAmount > 0 && (
                    <div className="flex justify-between text-gray-600">
                      <span>Tax ({taxRate}%):</span>
                      <span className="font-mono">+{formatCurrency(taxAmount, currency, symbol)}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-sm font-extrabold text-gray-900 pt-2 border-t border-gray-200">
                    <span>Grand Total:</span>
                    <span className="font-mono">{formatCurrency(grandTotal, currency, symbol)}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* ─── SECTION 5: PAYMENT TRACKING & PAYMENT LINK ─── */}
            <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-4">
              <div className="flex items-center gap-2 border-b border-gray-100 pb-3">
                <CreditCard size={16} className="text-gray-500" />
                <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wider">
                  5. Payment Tracking &amp; Online Link
                </h3>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <Input
                  label={`Amount Already Paid (${symbol})`}
                  type="number"
                  step="0.01"
                  min="0"
                  value={amountPaid || ''}
                  onChange={(e) => setAmountPaid(parseFloat(e.target.value) || 0)}
                  placeholder="0.00"
                />

                <div className="space-y-1.5">
                  <label className="block text-xs font-semibold text-gray-700">Payment Method</label>
                  <select
                    value={paymentMethod}
                    onChange={(e) => setPaymentMethod(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-lg border border-gray-300 focus:ring-2 focus:ring-blue-500 bg-white"
                  >
                    {PAYMENT_METHODS.map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                  </select>
                </div>

                <Input
                  label="Payment Reference / Tx ID"
                  value={paymentReference}
                  onChange={(e) => setPaymentReference(e.target.value)}
                  placeholder="e.g. PAY-98234"
                />
              </div>

              {/* Calculated Balance Banner */}
              <div className="flex items-center justify-between p-3.5 bg-blue-50/60 border border-blue-200 rounded-xl">
                <div>
                  <span className="text-xs font-bold text-blue-900 block">Remaining Balance Due</span>
                  <span className="text-[11px] text-blue-700">
                    Grand Total ({formatCurrency(grandTotal, currency, symbol)}) - Amount Paid ({formatCurrency(amountPaid, currency, symbol)})
                  </span>
                </div>
                <span className="font-mono font-black text-xl text-blue-800">
                  {formatCurrency(balanceDue, currency, symbol)}
                </span>
              </div>

              <label className="flex items-center gap-2 text-xs text-gray-700 cursor-pointer pt-1">
                <input
                  type="checkbox"
                  checked={generatePaymentLinkOption}
                  onChange={(e) => setGeneratePaymentLinkOption(e.target.checked)}
                  className="rounded text-blue-600"
                />
                <span className="font-medium">
                  Automatically generate secure, production-ready online payment link for client
                </span>
              </label>
            </div>

            {/* ─── SECTION 6: NOTES, TERMS & INSTRUCTIONS ─── */}
            <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-4">
              <div className="flex items-center gap-2 border-b border-gray-100 pb-3">
                <FileText size={16} className="text-gray-500" />
                <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wider">
                  6. Notes, Terms &amp; Payment Instructions
                </h3>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Textarea
                  label="Payment Instructions (e.g. Bank Account / Mobile Money details)"
                  rows={3}
                  value={paymentInstructions}
                  onChange={(e) => setPaymentInstructions(e.target.value)}
                  placeholder="Provide Bank Details or Mobile Money numbers here..."
                />

                <Textarea
                  label="Notes / Special Instructions for Client"
                  rows={3}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Any delivery timelines, meeting dates, or special notes..."
                />

                <Textarea
                  label="Terms & Conditions"
                  rows={3}
                  value={terms}
                  onChange={(e) => setTerms(e.target.value)}
                  placeholder="State your contractual terms or refund policy..."
                />

                <Textarea
                  label="Thank You Message"
                  rows={3}
                  value={thankYouMessage}
                  onChange={(e) => setThankYouMessage(e.target.value)}
                  placeholder="Thank you message displayed at the bottom of the invoice..."
                />
              </div>
            </div>
          </div>
        )}

        {/* ─── Modal Action Footer ─── */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-4 border-t border-gray-200">
          <Button type="button" variant="ghost" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </Button>

          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => handleSaveInvoice('Draft')}
              disabled={isSubmitting}
            >
              Save Draft
            </Button>
            <Button
              type="button"
              variant="primary"
              loading={isSubmitting}
              icon={<Save size={14} />}
              onClick={() => handleSaveInvoice()}
            >
              {invoiceToEdit ? 'Save Changes' : 'Create Invoice'}
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  )
}

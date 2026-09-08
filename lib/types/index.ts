// ============================================================
// Lexmedia — TypeScript Types & Interfaces
// ============================================================

import { Timestamp } from 'firebase/firestore'

// ─── User / Auth ─────────────────────────────────────────────
export type UserRole = 'admin' | 'staff'

export interface LexUser {
  uid: string
  email: string
  name: string
  role: UserRole
  photoURL?: string
  phone?: string
  createdAt: Timestamp
  lastLogin?: Timestamp
}

// ─── Client ──────────────────────────────────────────────────
export type ClientStatus = 'active' | 'inactive' | 'archived'

export interface Client {
  id: string
  fullName: string
  email: string
  phone: string
  whatsappNumber?: string
  company?: string
  address?: string
  photoURL?: string
  notes?: string
  status: ClientStatus
  projectCount?: number
  totalBilled?: number
  totalPaid?: number
  outstandingBalance?: number
  lastMessageSentAt?: Timestamp
  lastMessageStatus?: string
  createdAt: Timestamp
  updatedAt: Timestamp
  createdBy: string // uid
}

// ─── Service ─────────────────────────────────────────────────
export type ServiceCategory =
  | 'Photography'
  | 'Graphic Design'
  | 'Logo Design'
  | 'Brand Identity'
  | 'Flyer Design'
  | 'Video Production'
  | 'Video Editing'
  | 'Website Design'
  | 'Social Media Design'
  | 'Retouching'
  | 'Branding'
  | 'Other'

export type ServicePricingType = 'fixed' | 'starting_from' | 'custom'

export interface Service {
  id: string
  name: string
  category: ServiceCategory | string
  description?: string
  defaultPrice: number
  pricingType: ServicePricingType
  currency: string
  status: 'active' | 'inactive' | 'archived'
  createdAt: Timestamp
  updatedAt: Timestamp
  createdBy: string
}

// ─── Project ─────────────────────────────────────────────────
export type ProjectStatus =
  | 'Inquiry'
  | 'Awaiting Payment'
  | 'Paid'
  | 'In Progress'
  | 'Review'
  | 'Revision'
  | 'Completed'
  | 'Cancelled'

export type PaymentStatus = 'Unpaid' | 'Partially Paid' | 'Paid'

export interface Project {
  id: string
  name: string
  clientId: string
  clientName: string // denormalized for display
  clientEmail?: string // denormalized
  serviceId: string
  serviceName: string // denormalized
  packageId?: string
  packageTitle?: string // denormalized
  invoiceId?: string
  invoiceNumber?: string // denormalized
  description?: string
  price: number
  depositAmount?: number // required deposit / first payment
  amountPaid?: number // total paid so far
  outstandingBalance?: number // price - amountPaid
  currency: string
  startDate?: Timestamp
  deadline?: Timestamp
  status: ProjectStatus
  paymentStatus: PaymentStatus
  progress: number // 0-100
  notes?: string
  fileIds?: string[]
  createdAt: Timestamp
  updatedAt: Timestamp
  createdBy: string
}

// ─── Package ─────────────────────────────────────────────────
export interface PackageItem {
  id: string
  text: string
}

export interface Package {
  id: string
  title: string
  description?: string
  clientId?: string
  projectId?: string
  serviceId?: string
  serviceName?: string
  includedServiceIds?: string[]
  includedServices?: string[]
  price: number
  discount?: number
  currency: string
  whatsIncluded: PackageItem[]
  deliveryTimeline?: string
  revisions?: number
  imageUrls?: string[]
  additionalNotes?: string
  termsAndConditions?: string
  status: 'active' | 'inactive' | 'archived'
  createdAt: Timestamp
  updatedAt: Timestamp
  createdBy: string
}

// ─── Invoice ─────────────────────────────────────────────────
export type InvoiceStatus =
  | 'Draft'
  | 'Pending'
  | 'Partially Paid'
  | 'Paid'
  | 'Overdue'
  | 'Cancelled'

export interface InvoiceItem {
  id: string
  description: string
  quantity: number
  unitPrice: number
  total: number
}

export interface Invoice {
  id: string
  invoiceNumber: string // e.g. LM-INV-0001
  clientId: string
  clientName: string
  clientEmail: string
  projectId?: string
  projectName?: string
  packageId?: string
  packageTitle?: string
  items: InvoiceItem[]
  subtotal: number
  discountType?: 'percentage' | 'fixed'
  discountValue?: number
  discountAmount: number
  taxRate?: number
  taxAmount?: number
  total: number
  amountPaid?: number
  balanceDue?: number
  currency: string
  status: InvoiceStatus
  notes?: string
  invoiceDate: Timestamp
  dueDate?: Timestamp
  paidAt?: Timestamp
  paystackReference?: string
  createdAt: Timestamp
  updatedAt: Timestamp
  createdBy: string
}

// ─── Payment ─────────────────────────────────────────────────
export interface Payment {
  id: string
  invoiceId: string
  invoiceNumber: string
  clientId: string
  clientName: string
  projectId?: string
  paystackReference: string
  amount: number
  currency: string
  paymentMethod?: string
  channel?: string // card, bank, ussd, etc.
  paidAt: Timestamp
  status: 'success' | 'failed' | 'abandoned'
  metadata?: Record<string, unknown>
  createdAt: Timestamp
}

// ─── Client Link ─────────────────────────────────────────────
export interface ClientLink {
  id: string
  token: string // nanoid — used in URL: /p/[token]
  clientId: string
  clientName: string
  projectId?: string
  projectName?: string
  packageId?: string
  packageTitle?: string
  invoiceId?: string
  invoiceNumber?: string
  amount?: number
  currency?: string
  status: 'Pending Payment' | 'Payment Processing' | 'Paid' | 'Failed' | 'Expired' | 'Cancelled' | 'active' | 'disabled' | 'archived'
  paymentStatus: PaymentStatus
  expiresAt?: Timestamp
  viewCount: number
  lastViewedAt?: Timestamp
  createdAt: Timestamp
  updatedAt: Timestamp
  createdBy: string
}

// ─── WhatsApp Message ──────────────────────────────────────────
export type WhatsAppMessageStatus = 'queued' | 'sending' | 'sent' | 'delivered' | 'read' | 'failed'
export type WhatsAppMessageType = 'payment_link' | 'payment_reminder' | 'delivery_ready' | 'custom'

export interface WhatsAppMessage {
  id: string
  clientId: string
  clientName?: string
  projectId?: string
  invoiceId?: string
  deliveryId?: string
  messageType?: WhatsAppMessageType
  toNumber: string
  templateName?: string
  status: WhatsAppMessageStatus
  metaMessageId?: string // ID returned by Meta's API
  errorDetails?: string
  createdAt: Timestamp
  updatedAt: Timestamp
}

// ─── Delivery & Files ─────────────────────────────────────────
export type DeliveryStatus = 'Not Ready' | 'Ready for Delivery' | 'Delivered' | 'Downloaded'
export type DeliveryExpirationOption = 'never' | '1_day' | '3_days' | '7_days' | '14_days' | '30_days' | 'custom'

export interface Delivery {
  id: string
  clientId: string
  clientName: string
  projectId: string
  projectName: string
  invoiceId?: string
  title: string
  notes?: string
  status: DeliveryStatus
  accessToken: string
  expiresAt?: Timestamp | null
  expirationOption: DeliveryExpirationOption
  isReleased: boolean // Admin override to allow access even if invoice balance remains
  requiresFullPayment: boolean
  releasedAt?: Timestamp | null
  releasedBy?: string
  firstAccessedAt?: Timestamp | null
  lastAccessedAt?: Timestamp | null
  accessCount: number
  fileCount: number
  totalSize?: number
  notifyEmailSent?: boolean
  notifyEmailSentAt?: Timestamp | null
  notifyEmailMessageId?: string | null
  uploadEmailSent?: boolean
  uploadEmailSentAt?: Timestamp | null
  uploadEmailMessageId?: string | null
  createdAt: Timestamp
  updatedAt: Timestamp
}

export interface DeliveryFile {
  id: string
  deliveryId: string
  projectId: string
  clientId: string
  fileName: string
  originalName: string
  fileType: string // extension or mime type
  fileSize: number // bytes
  storagePath: string
  downloadUrl: string
  downloadCount: number
  lastDownloadedAt?: Timestamp | null
  uploadedAt: Timestamp
  uploadedBy: string
}

// ─── File ─────────────────────────────────────────────────────
export interface ProjectFile {
  id: string
  name: string
  originalName: string
  url: string
  storagePath: string
  mimeType: string
  size: number
  projectId: string
  clientId: string
  isShared: boolean // shared with client via their link
  uploadedBy: string
  createdAt: Timestamp
}

// ─── Activity Log ─────────────────────────────────────────────
export type ActivityEvent =
  | 'client_created'
  | 'client_updated'
  | 'client_archived'
  | 'project_created'
  | 'project_updated'
  | 'project_status_changed'
  | 'service_created'
  | 'package_created'
  | 'invoice_created'
  | 'invoice_updated'
  | 'invoice_cancelled'
  | 'client_link_generated'
  | 'client_link_opened'
  | 'client_link_disabled'
  | 'payment_initiated'
  | 'payment_completed'
  | 'payment_failed'
  | 'invoice_marked_paid'
  | 'file_uploaded'
  | 'delivery_created'
  | 'delivery_released'
  | 'delivery_link_generated'
  | 'delivery_opened'
  | 'delivery_file_downloaded'
  | 'whatsapp_message_sent'
  | 'whatsapp_message_failed'
  | 'settings_updated'

export interface ActivityLog {
  id: string
  event: ActivityEvent
  description: string
  entityId?: string
  entityType?: string
  clientId?: string
  clientName?: string
  performedBy?: string // uid, or 'system' for webhook events
  performedByName?: string
  metadata?: Record<string, unknown>
  createdAt: Timestamp
}

// ─── Notification ─────────────────────────────────────────────
export type NotificationType =
  | 'payment_received'
  | 'new_client'
  | 'new_project'
  | 'invoice_overdue'
  | 'client_opened_link'
  | 'client_payment_attempt'
  | 'file_uploaded'

export interface Notification {
  id: string
  type: NotificationType
  title: string
  message: string
  isRead: boolean
  entityId?: string
  entityType?: string
  clientId?: string
  createdAt: Timestamp
}

// ─── Settings ─────────────────────────────────────────────────
export interface BusinessSettings {
  businessName: string
  tagline?: string
  logoURL?: string
  email: string
  phone?: string
  whatsapp?: string
  address?: string
  website?: string
  currency: string
  currencySymbol: string
  invoicePrefix: string
  invoiceStartNumber: number
  defaultTaxRate: number
  defaultPaymentTerms?: string
  defaultTermsAndConditions?: string
  defaultWhatsAppMessage: string
  paystackPublicKey?: string
  updatedAt: Timestamp
}

export interface BrandingSettings {
  businessName: string
  shortName: string
  tagline: string
  logoUrl: string
  logoLightUrl: string
  faviconUrl: string
  primaryColor: string
  secondaryColor: string
  accentColor: string
  backgroundColor: string
  surfaceColor: string
  textColor: string
  mutedTextColor: string
  buttonColor: string
  buttonTextColor: string
}

// ─── UI / Utility Types ───────────────────────────────────────
export interface SelectOption {
  value: string
  label: string
}

export interface TableColumn<T> {
  key: keyof T | string
  label: string
  render?: (value: unknown, row: T) => React.ReactNode
  sortable?: boolean
  width?: string
}

export interface PaginationState {
  page: number
  perPage: number
  total: number
}

export interface FilterState {
  search: string
  status?: string
  dateFrom?: string
  dateTo?: string
}

// ─── Dashboard Stats ──────────────────────────────────────────
export interface DashboardStats {
  totalClients: number
  activeProjects: number
  pendingInvoices: number
  totalRevenue: number
  monthlyRevenue: number
  completedProjects: number
  outstandingPayments: number
  overdueInvoices: number
}

import type { Client, Project, Invoice, Payment, Service } from '@/lib/types'

export type AnalyticsPeriod =
  | 'today'
  | 'this_week'
  | 'this_month'
  | 'this_quarter'
  | 'this_year'
  | 'previous_year'
  | 'custom'
  | 'all'

export interface DateFilterState {
  period: AnalyticsPeriod
  year: number | 'all'
  startDate?: string // YYYY-MM-DD
  endDate?: string // YYYY-MM-DD
}

export interface MonthlyRevenueData {
  month: string
  monthIndex: number // 0-11
  projectCount: number
  invoiced: number
  paid: number
  outstanding: number
}

export interface ServicePerformanceData {
  serviceName: string
  category: string
  projectCount: number
  totalRevenue: number
  totalPaid: number
  outstanding: number
  avgProjectValue: number
  completedCount: number
  activeCount: number
  paidCount: number
  unpaidCount: number
}

export interface PaymentMethodData {
  method: string
  count: number
  totalAmount: number
  percentage: number
}

export interface ClientFinancialData {
  id: string
  name: string
  company?: string
  email?: string
  phone?: string
  projectCount: number
  totalBilled: number
  totalPaid: number
  outstanding: number
  lastPaymentDate?: string
  isReturning: boolean
}

export interface FinancialSummaryKPIs {
  totalClients: number
  newClients: number
  returningClients: number
  totalProjects: number
  activeProjects: number
  completedProjects: number
  cancelledProjects: number
  totalRevenue: number
  paidRevenue: number
  outstandingRevenue: number
  pendingPaymentsCount: number
  avgProjectValue: number
  avgInvoiceValue: number
  revenueGrowthRate?: number
}

/**
 * Safely converts Firestore Timestamp, ISO string, or Date to JavaScript Date object
 */
export function parseDateSafe(val: any): Date | null {
  if (!val) return null
  if (typeof val?.toDate === 'function') {
    try {
      return val.toDate()
    } catch {
      return null
    }
  }
  if (val?.seconds) {
    return new Date(val.seconds * 1000)
  }
  if (typeof val === 'string' || typeof val === 'number') {
    const d = new Date(val)
    return isNaN(d.getTime()) ? null : d
  }
  if (val instanceof Date) {
    return isNaN(val.getTime()) ? null : val
  }
  return null
}

/**
 * Computes start and end Date boundaries for the selected filter
 */
export function getDateRangeBoundaries(filter: DateFilterState): { start: Date; end: Date } {
  const now = new Date()
  const currentYear = filter.year !== 'all' ? filter.year : now.getFullYear()

  let start = new Date(currentYear, 0, 1, 0, 0, 0, 0)
  let end = new Date(currentYear, 11, 31, 23, 59, 59, 999)

  if (filter.year !== 'all' && filter.period === 'all') {
    return { start, end }
  }

  switch (filter.period) {
    case 'today': {
      start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0)
      end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999)
      break
    }
    case 'this_week': {
      const day = now.getDay()
      const diff = now.getDate() - day + (day === 0 ? -6 : 1) // Monday start
      start = new Date(now.getFullYear(), now.getMonth(), diff, 0, 0, 0, 0)
      end = new Date(start)
      end.setDate(start.getDate() + 6)
      end.setHours(23, 59, 59, 999)
      break
    }
    case 'this_month': {
      start = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0)
      end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999)
      break
    }
    case 'this_quarter': {
      const quarter = Math.floor(now.getMonth() / 3)
      start = new Date(now.getFullYear(), quarter * 3, 1, 0, 0, 0, 0)
      end = new Date(now.getFullYear(), quarter * 3 + 3, 0, 23, 59, 59, 999)
      break
    }
    case 'this_year': {
      start = new Date(now.getFullYear(), 0, 1, 0, 0, 0, 0)
      end = new Date(now.getFullYear(), 11, 31, 23, 59, 59, 999)
      break
    }
    case 'previous_year': {
      const prev = now.getFullYear() - 1
      start = new Date(prev, 0, 1, 0, 0, 0, 0)
      end = new Date(prev, 11, 31, 23, 59, 59, 999)
      break
    }
    case 'custom': {
      if (filter.startDate) {
        const [y, m, d] = filter.startDate.split('-').map(Number)
        start = new Date(y, m - 1, d, 0, 0, 0, 0)
      }
      if (filter.endDate) {
        const [y, m, d] = filter.endDate.split('-').map(Number)
        end = new Date(y, m - 1, d, 23, 59, 59, 999)
      }
      break
    }
    case 'all':
    default: {
      if (filter.year !== 'all') {
        start = new Date(filter.year, 0, 1, 0, 0, 0, 0)
        end = new Date(filter.year, 11, 31, 23, 59, 59, 999)
      } else {
        start = new Date(2020, 0, 1, 0, 0, 0, 0)
        end = new Date(2035, 11, 31, 23, 59, 59, 999)
      }
      break
    }
  }

  return { start, end }
}

/**
 * Filter an array of items by date range
 */
export function filterItemsByDate<T>(
  items: T[],
  getDateFn: (item: T) => any,
  filter: DateFilterState
): T[] {
  if (!items || !items.length) return []
  if (filter.period === 'all' && filter.year === 'all') return items

  const { start, end } = getDateRangeBoundaries(filter)
  const startTime = start.getTime()
  const endTime = end.getTime()

  return items.filter((item) => {
    const rawDate = getDateFn(item)
    const dateObj = parseDateSafe(rawDate)
    if (!dateObj) return true // include if no explicit date or consider valid
    const t = dateObj.getTime()
    return t >= startTime && t <= endTime
  })
}

const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
]

/**
 * Calculates complete Analytics dataset from raw Firestore records
 */
export function calculateAnalytics({
  clients = [],
  projects = [],
  invoices = [],
  payments = [],
  services = [],
  filter,
}: {
  clients: Client[]
  projects: Project[]
  invoices: Invoice[]
  payments: Payment[]
  services?: Service[]
  filter: DateFilterState
}) {
  // Filtered subsets according to date/year selection
  const filteredProjects = filterItemsByDate(
    projects,
    (p) => p.createdAt || p.startDate,
    filter
  )

  const filteredInvoices = filterItemsByDate(
    invoices,
    (i) => i.invoiceDate || i.createdAt,
    filter
  )

  const filteredPayments = filterItemsByDate(
    payments.filter((p) => p && p.status === 'success'),
    (p) => p.paidAt || p.createdAt,
    filter
  )

  const filteredClients = filterItemsByDate(
    clients,
    (c) => c.createdAt,
    filter
  )

  // ── 1. KPI Summaries ───────────────────────────────────────
  const totalClients = clients.length
  const newClientsInPeriod = filteredClients.length

  const totalProjects = filteredProjects.length
  const completedProjects = filteredProjects.filter((p) => p.status === 'Completed').length
  const cancelledProjects = filteredProjects.filter((p) => p.status === 'Cancelled').length
  const activeProjects = filteredProjects.filter(
    (p) => !['Completed', 'Cancelled'].includes(p.status)
  ).length

  // Revenue computations
  // Total Revenue: sum of all invoiced totals in period, or project prices if invoices not linked
  const invoicedTotal = filteredInvoices.reduce((acc, inv) => acc + (Number(inv.total) || 0), 0)
  const projectTotal = filteredProjects.reduce((acc, p) => acc + (Number(p.price) || 0), 0)
  
  // Use project total or invoice total (whichever is primary source, with fallback)
  const totalRevenue = Math.max(invoicedTotal, projectTotal)
  const paidRevenue = filteredPayments.reduce((acc, p) => acc + (Number(p.amount) || 0), 0)
  const outstandingRevenue = Math.max(0, totalRevenue - paidRevenue)

  const pendingPaymentsCount = filteredInvoices.filter(
    (inv) => inv.status === 'Pending' || inv.status === 'Partially Paid' || inv.status === 'Sent'
  ).length

  const avgProjectValue = totalProjects > 0 ? totalRevenue / totalProjects : 0
  const avgInvoiceValue = filteredInvoices.length > 0 ? invoicedTotal / filteredInvoices.length : 0

  // ── 2. Monthly Revenue Breakdown ───────────────────────────
  const monthlyMap: Record<number, MonthlyRevenueData> = {}
  for (let i = 0; i < 12; i++) {
    monthlyMap[i] = {
      month: MONTH_NAMES[i],
      monthIndex: i,
      projectCount: 0,
      invoiced: 0,
      paid: 0,
      outstanding: 0,
    }
  }

  // Populate projects in months
  filteredProjects.forEach((p) => {
    const d = parseDateSafe(p.createdAt || p.startDate)
    if (d) {
      const m = d.getMonth()
      if (monthlyMap[m]) {
        monthlyMap[m].projectCount += 1
        monthlyMap[m].invoiced += Number(p.price) || 0
      }
    }
  })

  // Populate payments in months
  filteredPayments.forEach((pmt) => {
    const d = parseDateSafe(pmt.paidAt || pmt.createdAt)
    if (d) {
      const m = d.getMonth()
      if (monthlyMap[m]) {
        monthlyMap[m].paid += Number(pmt.amount) || 0
      }
    }
  })

  // Calculate monthly outstanding
  const monthlyRevenue: MonthlyRevenueData[] = Object.values(monthlyMap).map((m) => ({
    ...m,
    outstanding: Math.max(0, m.invoiced - m.paid),
  }))

  // ── 3. Service Performance Analysis ────────────────────────
  const serviceMap: Record<string, ServicePerformanceData> = {}

  filteredProjects.forEach((p) => {
    const serviceName = p.serviceName || 'Custom Service'
    const category = p.serviceName || 'General'

    if (!serviceMap[serviceName]) {
      serviceMap[serviceName] = {
        serviceName,
        category,
        projectCount: 0,
        totalRevenue: 0,
        totalPaid: 0,
        outstanding: 0,
        avgProjectValue: 0,
        completedCount: 0,
        activeCount: 0,
        paidCount: 0,
        unpaidCount: 0,
      }
    }

    const item = serviceMap[serviceName]
    item.projectCount += 1
    const price = Number(p.price) || 0
    const paid = Number(p.amountPaid) || 0
    item.totalRevenue += price
    item.totalPaid += paid
    item.outstanding += Math.max(0, price - paid)

    if (p.status === 'Completed') {
      item.completedCount += 1
    } else if (p.status !== 'Cancelled') {
      item.activeCount += 1
    }

    if (p.paymentStatus === 'Paid' || paid >= price) {
      item.paidCount += 1
    } else {
      item.unpaidCount += 1
    }
  })

  // Compute averages
  const servicePerformance: ServicePerformanceData[] = Object.values(serviceMap)
    .map((s) => ({
      ...s,
      avgProjectValue: s.projectCount > 0 ? s.totalRevenue / s.projectCount : 0,
    }))
    .sort((a, b) => b.totalRevenue - a.totalRevenue)

  // ── 4. Payment Method Distribution ─────────────────────────
  const methodMap: Record<string, { count: number; total: number }> = {}
  filteredPayments.forEach((p) => {
    const method = p.channel || p.paymentMethod || 'Mobile Money'
    const normalizedMethod =
      method.toLowerCase().includes('momo') || method.toLowerCase().includes('mobile')
        ? 'Mobile Money'
        : method.toLowerCase().includes('card')
        ? 'Card / Paystack'
        : method.toLowerCase().includes('bank')
        ? 'Bank Transfer'
        : method.toLowerCase().includes('cash')
        ? 'Cash'
        : method

    if (!methodMap[normalizedMethod]) {
      methodMap[normalizedMethod] = { count: 0, total: 0 }
    }
    methodMap[normalizedMethod].count += 1
    methodMap[normalizedMethod].total += Number(p.amount) || 0
  })

  const totalPaymentSum = filteredPayments.reduce((acc, p) => acc + (Number(p.amount) || 0), 0)
  const paymentMethods: PaymentMethodData[] = Object.entries(methodMap)
    .map(([method, data]) => ({
      method,
      count: data.count,
      totalAmount: data.total,
      percentage: totalPaymentSum > 0 ? Math.round((data.total / totalPaymentSum) * 100) : 0,
    }))
    .sort((a, b) => b.totalAmount - a.totalAmount)

  // ── 5. Client Financial Breakdown & Analysis ───────────────
  const clientFinancialMap: Record<string, ClientFinancialData> = {}

  // Initialize from all clients
  clients.forEach((c) => {
    clientFinancialMap[c.id] = {
      id: c.id,
      name: c.fullName || 'Unnamed Client',
      company: c.company || '',
      email: c.email || '',
      phone: c.phone || c.whatsappNumber || '',
      projectCount: 0,
      totalBilled: 0,
      totalPaid: 0,
      outstanding: 0,
      isReturning: false,
    }
  })

  // Accumulate from projects
  filteredProjects.forEach((p) => {
    if (p.clientId && clientFinancialMap[p.clientId]) {
      const c = clientFinancialMap[p.clientId]
      c.projectCount += 1
      c.totalBilled += Number(p.price) || 0
      c.totalPaid += Number(p.amountPaid) || 0
    }
  })

  // Accumulate from payments
  filteredPayments.forEach((pmt) => {
    if (pmt.clientId && clientFinancialMap[pmt.clientId]) {
      const c = clientFinancialMap[pmt.clientId]
      const pDate = pmt.paidAt ? String(pmt.paidAt) : undefined
      if (pDate && (!c.lastPaymentDate || pDate > c.lastPaymentDate)) {
        c.lastPaymentDate = pDate
      }
    }
  })

  const clientList: ClientFinancialData[] = Object.values(clientFinancialMap)
    .map((c) => {
      const outstanding = Math.max(0, c.totalBilled - c.totalPaid)
      return {
        ...c,
        outstanding,
        isReturning: c.projectCount > 1,
      }
    })
    .sort((a, b) => b.totalPaid - a.totalPaid)

  const returningClientsCount = clientList.filter((c) => c.isReturning).length

  const kpis: FinancialSummaryKPIs = {
    totalClients,
    newClients: newClientsInPeriod,
    returningClients: returningClientsCount,
    totalProjects,
    activeProjects,
    completedProjects,
    cancelledProjects,
    totalRevenue,
    paidRevenue,
    outstandingRevenue,
    pendingPaymentsCount,
    avgProjectValue,
    avgInvoiceValue,
  }

  return {
    kpis,
    monthlyRevenue,
    servicePerformance,
    paymentMethods,
    clientList,
    filteredProjects,
    filteredInvoices,
    filteredPayments,
    filteredClients,
  }
}

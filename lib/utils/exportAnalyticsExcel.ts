import * as XLSX from 'xlsx'
import type { Client, Project, Invoice, Payment } from '@/lib/types'
import { calculateAnalytics, type DateFilterState, parseDateSafe } from './analyticsCalculations'

export interface ExportExcelParams {
  year: number
  clients: Client[]
  projects: Project[]
  invoices: Invoice[]
  payments: Payment[]
}

export function exportAnnualReportExcel({
  year,
  clients,
  projects,
  invoices,
  payments,
}: ExportExcelParams): boolean {
  try {
    const filter: DateFilterState = {
      period: 'all',
      year,
    }

    const { kpis, monthlyRevenue, servicePerformance, clientList, filteredProjects, filteredPayments } =
      calculateAnalytics({
        clients,
        projects,
        invoices,
        payments,
        filter,
      })

    // Create a new workbook
    const wb = XLSX.utils.book_new()

    // ─────────────────────────────────────────────────────────
    // Sheet 1: Annual Summary
    // ─────────────────────────────────────────────────────────
    const summaryData = [
      { Metric: 'Reporting Year', Value: String(year) },
      { Metric: 'Generated On', Value: new Date().toLocaleDateString('en-GB') },
      { Metric: 'Currency', Value: 'Ghana Cedi (GHS / GH₵)' },
      { Metric: '', Value: '' },
      { Metric: 'Total Clients', Value: kpis.totalClients },
      { Metric: 'New Clients In Period', Value: kpis.newClients },
      { Metric: 'Returning Clients', Value: kpis.returningClients },
      { Metric: 'Total Projects', Value: kpis.totalProjects },
      { Metric: 'Active Projects', Value: kpis.activeProjects },
      { Metric: 'Completed Projects', Value: kpis.completedProjects },
      { Metric: 'Cancelled Projects', Value: kpis.cancelledProjects },
      { Metric: '', Value: '' },
      { Metric: 'Total Revenue (GHS)', Value: Number(kpis.totalRevenue.toFixed(2)) },
      { Metric: 'Paid Revenue (GHS)', Value: Number(kpis.paidRevenue.toFixed(2)) },
      { Metric: 'Outstanding Revenue (GHS)', Value: Number(kpis.outstandingRevenue.toFixed(2)) },
      { Metric: 'Pending Invoices Count', Value: kpis.pendingPaymentsCount },
      { Metric: 'Average Project Value (GHS)', Value: Number(kpis.avgProjectValue.toFixed(2)) },
      { Metric: 'Average Invoice Value (GHS)', Value: Number(kpis.avgInvoiceValue.toFixed(2)) },
    ]
    const wsSummary = XLSX.utils.json_to_sheet(summaryData)
    wsSummary['!cols'] = [{ wch: 30 }, { wch: 25 }]
    XLSX.utils.book_append_sheet(wb, wsSummary, 'Annual Summary')

    // ─────────────────────────────────────────────────────────
    // Sheet 2: Clients
    // ─────────────────────────────────────────────────────────
    const clientsData = clientList.map((c, index) => ({
      '#': index + 1,
      'Client Name': c.name,
      'Business / Company': c.company || '—',
      'Email Address': c.email || '—',
      'Phone Number': c.phone || '—',
      'Total Projects': c.projectCount,
      'Total Billed (GHS)': Number(c.totalBilled.toFixed(2)),
      'Total Paid (GHS)': Number(c.totalPaid.toFixed(2)),
      'Outstanding (GHS)': Number(c.outstanding.toFixed(2)),
      'Client Type': c.isReturning ? 'Returning' : 'Standard',
    }))
    const wsClients = XLSX.utils.json_to_sheet(clientsData)
    wsClients['!cols'] = [
      { wch: 6 },
      { wch: 25 },
      { wch: 25 },
      { wch: 30 },
      { wch: 18 },
      { wch: 15 },
      { wch: 18 },
      { wch: 18 },
      { wch: 18 },
      { wch: 14 },
    ]
    XLSX.utils.book_append_sheet(wb, wsClients, 'Clients')

    // ─────────────────────────────────────────────────────────
    // Sheet 3: Projects
    // ─────────────────────────────────────────────────────────
    const projectsData = filteredProjects.map((p, index) => {
      const createdDate = parseDateSafe(p.createdAt || p.startDate)
      const formattedDate = createdDate ? createdDate.toLocaleDateString('en-GB') : '—'
      const deadlineDate = parseDateSafe(p.deadline)
      const formattedDeadline = deadlineDate ? deadlineDate.toLocaleDateString('en-GB') : '—'

      return {
        '#': index + 1,
        'Project ID': p.id?.slice(0, 8) || '—',
        'Client Name': p.clientName || '—',
        'Project Name': p.name || 'Untitled',
        'Service Category': p.serviceName || '—',
        'Package': p.packageTitle || 'Custom',
        'Project Status': p.status || 'In Progress',
        'Payment Status': p.paymentStatus || 'Unpaid',
        'Agreed Amount (GHS)': Number((p.price || 0).toFixed(2)),
        'Amount Paid (GHS)': Number((p.amountPaid || 0).toFixed(2)),
        'Outstanding (GHS)': Number(((p.price || 0) - (p.amountPaid || 0)).toFixed(2)),
        'Start Date': formattedDate,
        'Completion / Deadline': formattedDeadline,
      }
    })
    const wsProjects = XLSX.utils.json_to_sheet(projectsData)
    wsProjects['!cols'] = [
      { wch: 6 },
      { wch: 12 },
      { wch: 24 },
      { wch: 28 },
      { wch: 20 },
      { wch: 18 },
      { wch: 16 },
      { wch: 16 },
      { wch: 20 },
      { wch: 18 },
      { wch: 18 },
      { wch: 14 },
      { wch: 20 },
    ]
    XLSX.utils.book_append_sheet(wb, wsProjects, 'Projects')

    // ─────────────────────────────────────────────────────────
    // Sheet 4: Payments
    // ─────────────────────────────────────────────────────────
    const paymentsData = filteredPayments.map((pmt, index) => {
      const pDate = parseDateSafe(pmt.paidAt || pmt.createdAt)
      const formattedPDate = pDate ? pDate.toLocaleDateString('en-GB') : '—'

      return {
        '#': index + 1,
        'Payment ID': pmt.id?.slice(0, 8) || '—',
        'Client Name': pmt.clientName || '—',
        'Invoice #': pmt.invoiceNumber || '—',
        'Amount (GHS)': Number((pmt.amount || 0).toFixed(2)),
        'Payment Method': pmt.channel || pmt.paymentMethod || 'Mobile Money',
        'Transaction Reference': pmt.paystackReference || pmt.reference || '—',
        'Status': pmt.status || 'success',
        'Payment Date': formattedPDate,
        'Recorded By': pmt.recordedBy || pmt.source || 'system',
      }
    })
    const wsPayments = XLSX.utils.json_to_sheet(paymentsData)
    wsPayments['!cols'] = [
      { wch: 6 },
      { wch: 12 },
      { wch: 24 },
      { wch: 16 },
      { wch: 16 },
      { wch: 18 },
      { wch: 28 },
      { wch: 12 },
      { wch: 14 },
      { wch: 15 },
    ]
    XLSX.utils.book_append_sheet(wb, wsPayments, 'Payments')

    // ─────────────────────────────────────────────────────────
    // Sheet 5: Monthly Revenue
    // ─────────────────────────────────────────────────────────
    const monthlyData = monthlyRevenue.map((m) => ({
      Month: m.month,
      'Number of Projects': m.projectCount,
      'Amount Invoiced (GHS)': Number(m.invoiced.toFixed(2)),
      'Amount Paid (GHS)': Number(m.paid.toFixed(2)),
      'Outstanding Amount (GHS)': Number(m.outstanding.toFixed(2)),
      'Collection Rate (%)':
        m.invoiced > 0 ? `${Math.min(100, Math.round((m.paid / m.invoiced) * 100))}%` : '0%',
    }))
    const wsMonthly = XLSX.utils.json_to_sheet(monthlyData)
    wsMonthly['!cols'] = [
      { wch: 16 },
      { wch: 20 },
      { wch: 22 },
      { wch: 20 },
      { wch: 24 },
      { wch: 20 },
    ]
    XLSX.utils.book_append_sheet(wb, wsMonthly, 'Monthly Revenue')

    // ─────────────────────────────────────────────────────────
    // Sheet 6: Service Performance
    // ─────────────────────────────────────────────────────────
    const serviceData = servicePerformance.map((s, index) => ({
      '#': index + 1,
      'Service Name': s.serviceName,
      'Projects Count': s.projectCount,
      'Total Revenue (GHS)': Number(s.totalRevenue.toFixed(2)),
      'Total Paid (GHS)': Number(s.totalPaid.toFixed(2)),
      'Outstanding (GHS)': Number(s.outstanding.toFixed(2)),
      'Average Project Value (GHS)': Number(s.avgProjectValue.toFixed(2)),
      'Completed': s.completedCount,
      'Active / In-Progress': s.activeCount,
    }))
    const wsService = XLSX.utils.json_to_sheet(serviceData)
    wsService['!cols'] = [
      { wch: 6 },
      { wch: 26 },
      { wch: 16 },
      { wch: 20 },
      { wch: 18 },
      { wch: 18 },
      { wch: 26 },
      { wch: 14 },
      { wch: 20 },
    ]
    XLSX.utils.book_append_sheet(wb, wsService, 'Service Performance')

    // Generate and trigger download
    const filename = `LexMedia_Annual_Report_${year}.xlsx`
    XLSX.writeFile(wb, filename)
    return true
  } catch (err) {
    console.error('Error generating Excel spreadsheet:', err)
    return false
  }
}

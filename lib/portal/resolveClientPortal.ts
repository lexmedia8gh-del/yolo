import crypto from 'crypto'
import { getAdminDb } from '@/lib/firebase/admin'
import { COLLECTIONS } from '@/lib/firebase/firestore'
import { formatCurrency } from '@/lib/utils'
import { isLocalhostUrl, resolveStrictProductionBaseUrl } from '@/lib/utils/app-url'

export interface ResolvedProjectSummary {
  id: string
  name: string
  status: string
  serviceName: string
  invoiceId: string
  invoiceNumber: string
  totalAmount: number
  amountPaid: number
  outstandingBalance: number
  paymentStatus: string
  currency: string
  formattedTotal: string
  formattedPaid: string
  formattedBalance: string
}

export interface ResolvedPortalTarget {
  ok: boolean
  portalType: 'project_portal' | 'payment_portal' | 'preview_portal' | 'general_portal'
  portalPath: string
  portalUrl: string
  accessToken?: string
  project?: ResolvedProjectSummary | null
  error?: string
}

function generatePortalToken(length = 24): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
  const bytes = crypto.randomBytes(length)
  let out = ''
  for (let i = 0; i < length; i++) {
    out += chars[bytes[i] % chars.length]
  }
  return out
}

function toTimestampMs(val: any): number {
  if (!val) return 0
  if (typeof val?.toMillis === 'function') return val.toMillis()
  if (typeof val?.toDate === 'function') return val.toDate().getTime()
  if (typeof val?.seconds === 'number') return val.seconds * 1000
  if (typeof val?._seconds === 'number') return val._seconds * 1000
  const parsed = new Date(val).getTime()
  return Number.isFinite(parsed) ? parsed : 0
}

function projectPriorityScore(p: Record<string, any>): number {
  const statusRank: Record<string, number> = {
    'Ready for Delivery': 60,
    Review: 55,
    'In Progress': 50,
    Revision: 45,
    'Awaiting Payment': 40,
    Inquiry: 30,
    Completed: 25,
    Cancelled: 0,
  }
  return statusRank[String(p.status || '')] ?? 20
}

/**
 * Ensures a canonical public-readable `deliveries/{projectId}` portal record exists
 * for a given project, preserving any existing `accessToken` and enriching safe
 * display/financial fields so `/delivery/{accessToken}` loads cleanly for unauthenticated clients.
 */
export async function ensureProjectPortalRecord(params: {
  projectId: string
  projectData: Record<string, any>
  clientId?: string
  clientName?: string
  clientEmail?: string
}): Promise<{ accessToken: string; summary: ResolvedProjectSummary }> {
  const db = getAdminDb()
  const { projectId, projectData } = params
  const resolvedClientId = String(params.clientId || projectData.clientId || '').trim()
  const resolvedClientName = String(
    params.clientName || projectData.clientName || 'Valued Client'
  ).trim()
  const resolvedProjectName = String(projectData.name || projectData.title || 'Client Project').trim()
  const resolvedServiceName = String(projectData.serviceName || 'Digital Production').trim()
  const resolvedStatus = String(projectData.status || 'In Progress').trim()
  const currency = String(projectData.currency || 'GHS').toUpperCase()

  // Resolve linked invoice if available
  let invoiceId = String(projectData.invoiceId || '').trim()
  let invoiceNumber = String(projectData.invoiceNumber || '').trim()
  let totalAmount = Number(projectData.price ?? projectData.totalAmount ?? 0) || 0
  let amountPaid = Number(projectData.amountPaid ?? 0) || 0
  let outstandingBalance =
    projectData.outstandingBalance !== undefined
      ? Math.max(0, Number(projectData.outstandingBalance) || 0)
      : Math.max(0, totalAmount - amountPaid)
  let paymentLinkToken = projectId

  try {
    if (invoiceId) {
      const invDoc = await db.collection(COLLECTIONS.INVOICES).doc(invoiceId).get()
      if (invDoc.exists) {
        const inv = invDoc.data() || {}
        invoiceNumber = inv.invoiceNumber || invoiceNumber
        totalAmount = Number(inv.total ?? totalAmount) || totalAmount
        amountPaid = Number(inv.amountPaid ?? amountPaid) || 0
        outstandingBalance =
          inv.balanceDue !== undefined
            ? Math.max(0, Number(inv.balanceDue) || 0)
            : Math.max(0, totalAmount - amountPaid)
        if (inv.paymentLinkToken) paymentLinkToken = inv.paymentLinkToken
      }
    } else {
      const invSnap = await db
        .collection(COLLECTIONS.INVOICES)
        .where('projectId', '==', projectId)
        .limit(1)
        .get()
      if (!invSnap.empty) {
        const invDoc = invSnap.docs[0]
        const inv = invDoc.data() || {}
        invoiceId = invDoc.id
        invoiceNumber = inv.invoiceNumber || invoiceNumber
        totalAmount = Number(inv.total ?? totalAmount) || totalAmount
        amountPaid = Number(inv.amountPaid ?? amountPaid) || 0
        outstandingBalance =
          inv.balanceDue !== undefined
            ? Math.max(0, Number(inv.balanceDue) || 0)
            : Math.max(0, totalAmount - amountPaid)
        if (inv.paymentLinkToken) paymentLinkToken = inv.paymentLinkToken
      }
    }
  } catch {
    // Non-fatal: continue with project-level financial figures
  }

  const paymentStatus =
    outstandingBalance <= 0 && totalAmount > 0
      ? 'Paid'
      : amountPaid > 0
      ? 'Partially Paid'
      : String(projectData.paymentStatus || 'Pending')

  const canonicalRef = db.collection(COLLECTIONS.DELIVERIES).doc(projectId)
  const existingCanonical = await canonicalRef.get()
  const nowIso = new Date().toISOString()

  let accessToken = ''
  if (existingCanonical.exists) {
    const existingData = existingCanonical.data() || {}
    accessToken = String(existingData.accessToken || '').trim() || generatePortalToken()
    await canonicalRef.set(
      {
        accessToken,
        clientId: existingData.clientId || resolvedClientId,
        clientName: existingData.clientName || resolvedClientName,
        clientEmail: existingData.clientEmail || params.clientEmail || '',
        projectId,
        projectName: resolvedProjectName,
        projectStatus: resolvedStatus,
        serviceName: resolvedServiceName,
        invoiceId: invoiceId || existingData.invoiceId || null,
        invoiceNumber: invoiceNumber || existingData.invoiceNumber || '',
        projectTotal: totalAmount,
        amountPaid,
        remainingBalance: outstandingBalance,
        currency,
        paymentLinkToken: existingData.paymentLinkToken || paymentLinkToken,
        updatedAt: nowIso,
      },
      { merge: true }
    )
  } else {
    // Check if a legacy delivery document already exists for this projectId
    const legacySnap = await db
      .collection(COLLECTIONS.DELIVERIES)
      .where('projectId', '==', projectId)
      .limit(1)
      .get()

    if (!legacySnap.empty) {
      const legacyDoc = legacySnap.docs[0]
      const legacyData = legacyDoc.data() || {}
      accessToken = String(legacyData.accessToken || '').trim() || generatePortalToken()
      await legacyDoc.ref.set(
        {
          accessToken,
          clientId: legacyData.clientId || resolvedClientId,
          clientName: legacyData.clientName || resolvedClientName,
          clientEmail: legacyData.clientEmail || params.clientEmail || '',
          projectName: resolvedProjectName,
          projectStatus: resolvedStatus,
          serviceName: resolvedServiceName,
          invoiceId: invoiceId || legacyData.invoiceId || null,
          invoiceNumber: invoiceNumber || legacyData.invoiceNumber || '',
          projectTotal: totalAmount,
          amountPaid,
          remainingBalance: outstandingBalance,
          currency,
          paymentLinkToken: legacyData.paymentLinkToken || paymentLinkToken,
          updatedAt: nowIso,
        },
        { merge: true }
      )
    } else {
      accessToken = generatePortalToken()
      await canonicalRef.set({
        clientId: resolvedClientId,
        clientName: resolvedClientName,
        clientEmail: params.clientEmail || '',
        projectId,
        quickJobId: null,
        projectName: resolvedProjectName,
        projectStatus: resolvedStatus,
        serviceName: resolvedServiceName,
        invoiceId: invoiceId || null,
        invoiceNumber: invoiceNumber || '',
        projectTotal: totalAmount,
        amountPaid,
        remainingBalance: outstandingBalance,
        currency,
        paymentLinkToken,
        title: `${resolvedProjectName} Portal`,
        notes: projectData.description || '',
        status: resolvedStatus === 'Completed' ? 'Delivered' : resolvedStatus,
        accessToken,
        expiresAt: null,
        expirationOption: 'never',
        isReleased: outstandingBalance <= 0,
        requiresFullPayment: outstandingBalance > 0,
        accessCount: 0,
        fileCount: 0,
        totalSize: 0,
        createdAt: nowIso,
        updatedAt: nowIso,
      })
    }
  }

  return {
    accessToken,
    summary: {
      id: projectId,
      name: resolvedProjectName,
      status: resolvedStatus,
      serviceName: resolvedServiceName,
      invoiceId,
      invoiceNumber,
      totalAmount,
      amountPaid,
      outstandingBalance,
      paymentStatus,
      currency,
      formattedTotal: formatCurrency(totalAmount, currency),
      formattedPaid: formatCurrency(amountPaid, currency),
      formattedBalance: formatCurrency(outstandingBalance, currency),
    },
  }
}

/**
 * Resolves the authoritative client portal URL for a recipient and optional project.
 * - Uses existing public client routes (`/delivery/{accessToken}` for project portals,
 *   `/pay/{token}` or `/client-preview/{token}` if explicitly requested, and `/delivery`
 *   general client portal when no project is associated).
 * - NEVER points clients to admin-only routes (`/login` or `/projects/{id}`).
 * - NEVER produces `localhost` or `127.0.0.1` URLs.
 */
export async function resolveRecipientPortalTarget(params: {
  clientId?: string
  clientName?: string
  clientEmail?: string
  projectId?: string
  preferGeneralPortal?: boolean
  explicitPublicPath?: string
  requestContext?: any
}): Promise<ResolvedPortalTarget> {
  const prod = resolveStrictProductionBaseUrl(params.requestContext)
  if (!prod.ok || !prod.baseUrl || isLocalhostUrl(prod.baseUrl)) {
    return {
      ok: false,
      portalType: 'general_portal',
      portalPath: '',
      portalUrl: '',
      error:
        prod.error ||
        'Production base URL (APP_URL) is missing or resolves to localhost.',
    }
  }

  const baseUrl = prod.baseUrl.replace(/\/+$/, '')
  const db = getAdminDb()
  const cleanClientId = String(params.clientId || '').trim()
  let cleanProjectId = String(params.projectId || '').trim()

  // If caller passed a legacy /projects/{id} path, extract projectId so we upgrade it to /delivery/{token}
  if (params.explicitPublicPath) {
    const rawPath = params.explicitPublicPath.trim()
    const projMatch = rawPath.match(/^\/projects\/([^/?#]+)/i)
    if (projMatch && !cleanProjectId) {
      cleanProjectId = projMatch[1]
    } else if (
      (rawPath.startsWith('/delivery/') ||
        rawPath.startsWith('/d/') ||
        rawPath.startsWith('/pay/') ||
        rawPath.startsWith('/p/') ||
        rawPath.startsWith('/client-preview/') ||
        rawPath.startsWith('/preview/')) &&
      !cleanProjectId
    ) {
      const portalType = rawPath.startsWith('/pay') || rawPath.startsWith('/p/')
        ? 'payment_portal'
        : rawPath.startsWith('/client-preview') || rawPath.startsWith('/preview/')
        ? 'preview_portal'
        : 'project_portal'
      return {
        ok: true,
        portalType,
        portalPath: rawPath,
        portalUrl: `${baseUrl}${rawPath}`,
      }
    }
  }

  if (!params.preferGeneralPortal) {
    let targetProjectId = ''
    let targetProjectData: Record<string, any> | null = null

    if (cleanProjectId) {
      const projDoc = await db.collection(COLLECTIONS.PROJECTS).doc(cleanProjectId).get()
      if (projDoc.exists) {
        const pData = projDoc.data() || {}
        // Ensure project belongs to this client when dispatching to multiple clients,
        // or use directly when no conflicting clientId is present.
        if (!cleanClientId || !pData.clientId || pData.clientId === cleanClientId) {
          targetProjectId = projDoc.id
          targetProjectData = pData
        }
      }
    }

    // If no matching explicit project (or multi-recipient dispatch for another client),
    // look up the recipient client's associated projects automatically.
    if (!targetProjectData && cleanClientId && !cleanClientId.startsWith('custom_')) {
      const clientProjectsSnap = await db
        .collection(COLLECTIONS.PROJECTS)
        .where('clientId', '==', cleanClientId)
        .get()

      if (!clientProjectsSnap.empty) {
        const sorted = [...clientProjectsSnap.docs].sort((a, b) => {
          const rankDiff = projectPriorityScore(b.data()) - projectPriorityScore(a.data())
          if (rankDiff !== 0) return rankDiff
          return (
            toTimestampMs(b.data().updatedAt || b.data().createdAt) -
            toTimestampMs(a.data().updatedAt || a.data().createdAt)
          )
        })
        targetProjectId = sorted[0].id
        targetProjectData = sorted[0].data()
      }
    }

    if (targetProjectId && targetProjectData) {
      const { accessToken, summary } = await ensureProjectPortalRecord({
        projectId: targetProjectId,
        projectData: targetProjectData,
        clientId: cleanClientId || targetProjectData.clientId,
        clientName: params.clientName || targetProjectData.clientName,
        clientEmail: params.clientEmail,
      })
      const portalPath = `/delivery/${encodeURIComponent(accessToken)}`
      return {
        ok: true,
        portalType: 'project_portal',
        portalPath,
        portalUrl: `${baseUrl}${portalPath}`,
        accessToken,
        project: summary,
      }
    }
  }

  // Fallback when no project is associated (or General Client Portal explicitly requested):
  // Route cleanly to the public Client Portal Hub (/delivery) with optional client context
  const queryParts: string[] = []
  if (cleanClientId && !cleanClientId.startsWith('custom_')) {
    queryParts.push(`client=${encodeURIComponent(cleanClientId)}`)
  }
  if (params.clientName?.trim()) {
    queryParts.push(`name=${encodeURIComponent(params.clientName.trim())}`)
  }
  const portalPath = queryParts.length > 0 ? `/delivery?${queryParts.join('&')}` : '/delivery'

  return {
    ok: true,
    portalType: 'general_portal',
    portalPath,
    portalUrl: `${baseUrl}${portalPath}`,
    project: null,
  }
}

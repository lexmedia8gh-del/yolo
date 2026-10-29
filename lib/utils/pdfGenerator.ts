import jsPDF from 'jspdf'
import html2canvas from 'html2canvas'

export interface GeneratePdfOptions {
  filename?: string
  scale?: number
}

interface AtomicBlock {
  topCss: number
  bottomCss: number
}

interface TableMeasure {
  theadTopCss: number
  theadHeightCss: number
  tbodyTopCss: number
  tableBottomCss: number
}

const A4_RENDER_WIDTH_PX = 794

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onloadend = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result)
      } else {
        reject(new Error('Failed to encode image as data URL'))
      }
    }
    reader.onerror = () => reject(new Error('FileReader error'))
    reader.readAsDataURL(blob)
  })
}

function resolveProxyOrDirectUrl(rawSrc: string): string {
  if (!rawSrc || rawSrc.startsWith('data:') || rawSrc.startsWith('blob:')) {
    return rawSrc
  }
  try {
    const parsed = new URL(rawSrc, window.location.origin)
    if (
      parsed.hostname === 'firebasestorage.googleapis.com' ||
      parsed.hostname === 'storage.googleapis.com'
    ) {
      return `/api/branding/image?url=${encodeURIComponent(parsed.toString())}`
    }
    return parsed.toString()
  } catch {
    return rawSrc
  }
}

async function prefetchImagesAsDataUrls(
  root: HTMLElement
): Promise<{ hydrated: Map<number, string>; broken: Set<number> }> {
  const hydrated = new Map<number, string>()
  const broken = new Set<number>()
  const imgs = Array.from(root.querySelectorAll('img'))

  await Promise.all(
    imgs.map(async (img, idx) => {
      const src = img.currentSrc || img.getAttribute('src') || ''
      if (!src) {
        broken.add(idx)
        return
      }
      if (src.startsWith('data:')) {
        hydrated.set(idx, src)
        return
      }

      const fetchTarget = resolveProxyOrDirectUrl(src)
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), 6000)

      try {
        const res = await fetch(fetchTarget, {
          cache: 'force-cache',
          signal: controller.signal,
        })
        if (!res.ok) {
          if (img.complete && img.naturalWidth === 0) {
            broken.add(idx)
          }
          return
        }
        const contentType = res.headers.get('content-type') || ''
        if (!contentType.startsWith('image/')) {
          return
        }
        const blob = await res.blob()
        const dataUrl = await blobToDataUrl(blob)
        hydrated.set(idx, dataUrl)
      } catch {
        if (img.complete && img.naturalWidth === 0) {
          broken.add(idx)
        }
      } finally {
        clearTimeout(timer)
      }
    })
  )

  return { hydrated, broken }
}

/**
 * Generates and downloads a high-resolution, print-matched A4 PDF of the invoice element.
 * - Pre-hydrates Firebase Storage logos through same-origin `/api/branding/image` to prevent canvas CORS tainting
 * - Strips `.dark` theme classes so PDFs always render on crisp light paper
 * - Preserves atomic rows/sections across multi-page breaks and repeats table headers on continuation pages
 */
export async function downloadInvoicePdf(
  elementId: string,
  options: GeneratePdfOptions = {}
): Promise<boolean> {
  const { filename = 'Invoice.pdf', scale = 2.5 } = options

  const element = document.getElementById(elementId)
  if (!element) {
    console.error(`[PDF Generator] Element with id "${elementId}" not found.`)
    return false
  }

  try {
    if (typeof document !== 'undefined' && document.fonts?.ready) {
      await Promise.race([
        document.fonts.ready,
        new Promise((r) => setTimeout(r, 1500)),
      ])
    }

    const { hydrated, broken } = await prefetchImagesAsDataUrls(element)

    let atomicBlocks: AtomicBlock[] = []
    let tableMeasure: TableMeasure | null = null

    const canvas = await html2canvas(element, {
      scale,
      useCORS: true,
      allowTaint: false,
      backgroundColor: '#ffffff',
      logging: false,
      windowWidth: 960,
      onclone: (clonedDoc) => {
        // Force light paper surface in cloned document regardless of active admin theme
        clonedDoc.documentElement.classList.remove('dark')
        clonedDoc.documentElement.classList.add('light')
        clonedDoc.documentElement.style.colorScheme = 'light'
        clonedDoc.body.classList.remove('dark')
        clonedDoc.body.style.background = '#ffffff'
        clonedDoc.body.style.color = '#0F172A'

        // Reset any responsive stage scaling ancestors on the cloned tree
        clonedDoc
          .querySelectorAll<HTMLElement>('[data-stage-inner], [data-stage-outer]')
          .forEach((stageNode) => {
            stageNode.style.transform = 'none'
            stageNode.style.width = `${A4_RENDER_WIDTH_PX}px`
            stageNode.style.height = 'auto'
          })

        const clonedEl = clonedDoc.getElementById(elementId)
        if (!clonedEl) return

        clonedEl.style.width = `${A4_RENDER_WIDTH_PX}px`
        clonedEl.style.maxWidth = `${A4_RENDER_WIDTH_PX}px`
        clonedEl.style.minHeight = '0px'
        clonedEl.style.margin = '0'
        clonedEl.style.transform = 'none'
        clonedEl.style.background = '#ffffff'
        clonedEl.style.borderRadius = '0px'
        clonedEl.style.boxShadow = 'none'
        clonedEl.style.border = 'none'

        // Inject pre-hydrated inline data URLs for Firebase Storage / remote logos
        const clonedImgs = Array.from(clonedEl.querySelectorAll('img'))
        clonedImgs.forEach((cImg, idx) => {
          const dataUrl = hydrated.get(idx)
          if (dataUrl) {
            cImg.removeAttribute('crossorigin')
            cImg.src = dataUrl
          } else if (broken.has(idx)) {
            cImg.style.display = 'none'
          }
        })

        // Measure 1:1 unscaled CSS coordinates for row-safe pagination
        const rootRect = clonedEl.getBoundingClientRect()
        if (rootRect.height > 0) {
          const keepNodes = Array.from(
            clonedEl.querySelectorAll<HTMLElement>('tbody tr, .invoice-keep-together')
          )
          atomicBlocks = keepNodes
            .map((node) => {
              const r = node.getBoundingClientRect()
              return {
                topCss: Math.max(0, r.top - rootRect.top),
                bottomCss: Math.max(0, r.bottom - rootRect.top),
              }
            })
            .filter((b) => b.bottomCss > b.topCss)

          const tableEl = clonedEl.querySelector<HTMLTableElement>(
            'table[data-invoice-table="true"]'
          )
          const theadEl = tableEl?.querySelector('thead')
          const tbodyEl = tableEl?.querySelector('tbody')
          if (tableEl && theadEl && tbodyEl) {
            const tableRect = tableEl.getBoundingClientRect()
            const theadRect = theadEl.getBoundingClientRect()
            const tbodyRect = tbodyEl.getBoundingClientRect()
            if (theadRect.height > 0 && tbodyRect.height > 0) {
              tableMeasure = {
                theadTopCss: Math.max(0, theadRect.top - rootRect.top),
                theadHeightCss: theadRect.height,
                tbodyTopCss: Math.max(0, tbodyRect.top - rootRect.top),
                tableBottomCss: Math.max(0, tableRect.bottom - rootRect.top),
              }
            }
          }
        }
      },
    })

    const pdf = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4',
      compress: true,
    })

    const pageWidthMm = 210
    const pageHeightMm = 297
    const marginMm = 10
    const contentWidthMm = pageWidthMm - marginMm * 2 // 190mm
    const singlePageMaxMm = pageHeightMm - marginMm * 2 // 277mm

    const pxPerMm = canvas.width / contentWidthMm
    const cssToCanvasRatio = canvas.width / A4_RENDER_WIDTH_PX
    const singlePageMaxPx = Math.floor(singlePageMaxMm * pxPerMm)

    if (canvas.height <= singlePageMaxPx + 6) {
      const imgData = canvas.toDataURL('image/jpeg', 0.97)
      const renderedHeightMm = (canvas.height * contentWidthMm) / canvas.width
      pdf.addImage(
        imgData,
        'JPEG',
        marginMm,
        marginMm,
        contentWidthMm,
        Math.min(singlePageMaxMm, renderedHeightMm)
      )
    } else {
      // Multi-page pagination with atomic row protection & repeated table header
      const footerReserveMm = 7
      const multiPageMaxMm = pageHeightMm - marginMm * 2 - footerReserveMm // 270mm
      const multiPageMaxPx = Math.floor(multiPageMaxMm * pxPerMm)

      const blocksPx = atomicBlocks.map((b) => ({
        topPx: Math.round(b.topCss * cssToCanvasRatio),
        bottomPx: Math.round(b.bottomCss * cssToCanvasRatio),
      }))

      const tblPx = tableMeasure
        ? {
            theadTopPx: Math.round(
              (tableMeasure as TableMeasure).theadTopCss * cssToCanvasRatio
            ),
            theadHeightPx: Math.round(
              (tableMeasure as TableMeasure).theadHeightCss * cssToCanvasRatio
            ),
            tbodyTopPx: Math.round(
              (tableMeasure as TableMeasure).tbodyTopCss * cssToCanvasRatio
            ),
            tableBottomPx: Math.round(
              (tableMeasure as TableMeasure).tableBottomCss * cssToCanvasRatio
            ),
          }
        : null

      const slices: Array<{ startPx: number; endPx: number; repeatThead: boolean }> = []
      let cursorPx = 0

      while (cursorPx < canvas.height - 4) {
        const repeatThead = Boolean(
          tblPx &&
            cursorPx > tblPx.tbodyTopPx + 8 &&
            cursorPx < tblPx.tableBottomPx - 24
        )
        const theadOffsetPx = repeatThead && tblPx ? tblPx.theadHeightPx : 0
        const maxSliceBodyPx = Math.max(200, multiPageMaxPx - theadOffsetPx)
        let nextEndPx = Math.min(canvas.height, cursorPx + maxSliceBodyPx)

        if (nextEndPx < canvas.height) {
          for (const blk of blocksPx) {
            const blkHeight = blk.bottomPx - blk.topPx
            if (
              blk.topPx > cursorPx + 48 &&
              blk.topPx < nextEndPx &&
              blk.bottomPx > nextEndPx &&
              blkHeight < maxSliceBodyPx * 0.85
            ) {
              nextEndPx = Math.min(nextEndPx, blk.topPx)
            }
          }
        }

        if (nextEndPx <= cursorPx) {
          nextEndPx = Math.min(canvas.height, cursorPx + maxSliceBodyPx)
        }

        slices.push({ startPx: cursorPx, endPx: nextEndPx, repeatThead })
        cursorPx = nextEndPx
      }

      slices.forEach((slice, pageIdx) => {
        if (pageIdx > 0) {
          pdf.addPage()
        }

        const bodyHeightPx = slice.endPx - slice.startPx
        const headerPx = slice.repeatThead && tblPx ? tblPx.theadHeightPx : 0
        const totalSlicePx = headerPx + bodyHeightPx

        const pageCanvas = document.createElement('canvas')
        pageCanvas.width = canvas.width
        pageCanvas.height = totalSlicePx

        const ctx = pageCanvas.getContext('2d')
        if (!ctx) return

        ctx.fillStyle = '#ffffff'
        ctx.fillRect(0, 0, pageCanvas.width, pageCanvas.height)

        if (slice.repeatThead && tblPx && headerPx > 0) {
          ctx.drawImage(
            canvas,
            0,
            tblPx.theadTopPx,
            canvas.width,
            headerPx,
            0,
            0,
            canvas.width,
            headerPx
          )
        }

        ctx.drawImage(
          canvas,
          0,
          slice.startPx,
          canvas.width,
          bodyHeightPx,
          0,
          headerPx,
          canvas.width,
          bodyHeightPx
        )

        const sliceImg = pageCanvas.toDataURL('image/jpeg', 0.96)
        const sliceHeightMm = totalSlicePx / pxPerMm
        pdf.addImage(
          sliceImg,
          'JPEG',
          marginMm,
          marginMm,
          contentWidthMm,
          sliceHeightMm
        )

        if (slices.length > 1) {
          pdf.setFont('helvetica', 'normal')
          pdf.setFontSize(8)
          pdf.setTextColor(100, 116, 139)
          pdf.text(
            `Page ${pageIdx + 1} of ${slices.length}`,
            pageWidthMm - marginMm,
            pageHeightMm - 6,
            { align: 'right' }
          )
        }
      })
    }

    pdf.save(filename.endsWith('.pdf') ? filename : `${filename}.pdf`)
    return true
  } catch (error) {
    console.error('[PDF Generator] Error creating PDF:', error)
    return false
  }
}

/**
 * Triggers native browser print dialog for an invoice inside a clean, light-paper A4 iframe.
 * Waits for stylesheets, fonts, and logo images before invoking print().
 */
export function printInvoiceDocument(
  elementId: string,
  documentTitle = 'Invoice'
): void {
  const element = document.getElementById(elementId)
  if (!element) {
    window.print()
    return
  }

  const iframe = document.createElement('iframe')
  iframe.setAttribute('aria-hidden', 'true')
  iframe.style.position = 'fixed'
  iframe.style.right = '0'
  iframe.style.bottom = '0'
  iframe.style.width = '0'
  iframe.style.height = '0'
  iframe.style.border = 'none'
  iframe.style.opacity = '0'
  document.body.appendChild(iframe)

  const printWin = iframe.contentWindow
  const doc = printWin?.document
  if (!printWin || !doc) {
    document.body.removeChild(iframe)
    window.print()
    return
  }

  const styles = Array.from(
    document.querySelectorAll('style, link[rel="stylesheet"]')
  )
    .map((s) => s.outerHTML)
    .join('\n')

  doc.open()
  doc.write(`<!DOCTYPE html>
<html lang="en" class="light">
  <head>
    <meta charset="utf-8" />
    <title>${documentTitle.replace(/[<>&"]/g, '')}</title>
    ${styles}
    <style>
      @page {
        size: A4 portrait;
        margin: 10mm;
      }
      html, body {
        background: #ffffff !important;
        color: #0F172A !important;
        color-scheme: light !important;
        margin: 0 !important;
        padding: 0 !important;
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
      }
      .no-print, [data-html2canvas-ignore="true"] {
        display: none !important;
      }
      .invoice-paper-sheet {
        width: 100% !important;
        max-width: 100% !important;
        min-height: 0 !important;
        margin: 0 !important;
        border: none !important;
        border-radius: 0 !important;
        box-shadow: none !important;
      }
      .invoice-paper-sheet thead {
        display: table-header-group !important;
      }
      .invoice-paper-sheet tfoot {
        display: table-footer-group !important;
      }
      .invoice-paper-sheet tr,
      .invoice-paper-sheet .invoice-keep-together {
        break-inside: avoid !important;
        page-break-inside: avoid !important;
      }
    </style>
  </head>
  <body>
    ${element.outerHTML}
  </body>
</html>`)
  doc.close()

  let cleanedUp = false
  const cleanup = () => {
    if (cleanedUp) return
    cleanedUp = true
    if (iframe.parentNode) {
      iframe.parentNode.removeChild(iframe)
    }
  }

  printWin.addEventListener('afterprint', cleanup)
  setTimeout(cleanup, 60000)

  const waitForImages = Promise.all(
    Array.from(doc.images).map(
      (img) =>
        new Promise<void>((resolve) => {
          if (img.complete) {
            resolve()
            return
          }
          const done = () => resolve()
          img.addEventListener('load', done, { once: true })
          img.addEventListener('error', done, { once: true })
          setTimeout(done, 3000)
        })
    )
  )

  const waitForFonts = doc.fonts?.ready
    ? Promise.race([doc.fonts.ready, new Promise((r) => setTimeout(r, 1500))])
    : Promise.resolve()

  Promise.all([waitForImages, waitForFonts]).then(() => {
    setTimeout(() => {
      try {
        printWin.focus()
        printWin.print()
      } catch {
        cleanup()
      }
    }, 150)
  })
}

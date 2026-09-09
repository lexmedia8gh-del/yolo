import jsPDF from 'jspdf'
import html2canvas from 'html2canvas'

export interface GeneratePdfOptions {
  filename?: string
  scale?: number
}

/**
 * Generates and downloads a high-resolution, pixel-perfect PDF of the target DOM element.
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
    // Render element to high-res canvas
    const canvas = await html2canvas(element, {
      scale,
      useCORS: true,
      allowTaint: true,
      backgroundColor: '#ffffff',
      logging: false,
      windowWidth: 800, // Standardize viewport width for consistent desktop layout
      onclone: (clonedDoc) => {
        const clonedEl = clonedDoc.getElementById(elementId)
        if (clonedEl) {
          clonedEl.style.width = '794px' // Standard A4 pixel width at 96 DPI
          clonedEl.style.maxWidth = '794px'
          clonedEl.style.margin = '0 auto'
          clonedEl.style.padding = '32px'
          clonedEl.style.background = '#ffffff'
          clonedEl.style.borderRadius = '0px'
          clonedEl.style.boxShadow = 'none'
        }
      },
    })

    const imgData = canvas.toDataURL('image/jpeg', 0.98)
    
    // Create jsPDF instance in A4 format (210 x 297 mm)
    const pdf = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4',
      compress: true,
    })

    const pageWidth = 210
    const pageHeight = 297
    const margin = 8 // 8mm margin
    const contentWidth = pageWidth - margin * 2
    const contentHeight = (canvas.height * contentWidth) / canvas.width

    if (contentHeight <= pageHeight - margin * 2) {
      // Single page fits comfortably
      pdf.addImage(imgData, 'JPEG', margin, margin, contentWidth, contentHeight)
    } else {
      // Multi-page handling
      let heightLeft = contentHeight
      let position = margin

      pdf.addImage(imgData, 'JPEG', margin, position, contentWidth, contentHeight)
      heightLeft -= pageHeight

      while (heightLeft > 0) {
        position = heightLeft - contentHeight
        pdf.addPage()
        pdf.addImage(imgData, 'JPEG', margin, position, contentWidth, contentHeight)
        heightLeft -= pageHeight
      }
    }

    pdf.save(filename.endsWith('.pdf') ? filename : `${filename}.pdf`)
    return true
  } catch (error) {
    console.error('[PDF Generator] Error creating PDF:', error)
    return false
  }
}

/**
 * Triggers native browser print dialog for an invoice
 */
export function printInvoiceDocument(elementId: string): void {
  const element = document.getElementById(elementId)
  if (!element) {
    window.print()
    return
  }

  // Create a hidden iframe for clean, isolated printing
  const iframe = document.createElement('iframe')
  iframe.style.position = 'fixed'
  iframe.style.right = '0'
  iframe.style.bottom = '0'
  iframe.style.width = '0'
  iframe.style.height = '0'
  iframe.style.border = 'none'
  document.body.appendChild(iframe)

  const doc = iframe.contentWindow?.document
  if (!doc) {
    window.print()
    return
  }

  // Copy stylesheets to iframe
  const styles = Array.from(document.querySelectorAll('style, link[rel="stylesheet"]'))
    .map((s) => s.outerHTML)
    .join('\n')

  doc.open()
  doc.write(`
    <!DOCTYPE html>
    <html>
      <head>
        <title>Print Invoice</title>
        ${styles}
        <style>
          @page {
            size: A4 portrait;
            margin: 12mm;
          }
          body {
            background: #ffffff !important;
            color: #111827 !important;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif !important;
            margin: 0;
            padding: 0;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          .no-print { display: none !important; }
        </style>
      </head>
      <body>
        <div style="width: 100%; max-width: 800px; margin: 0 auto;">
          ${element.innerHTML}
        </div>
      </body>
    </html>
  `)
  doc.close()

  setTimeout(() => {
    iframe.contentWindow?.focus()
    iframe.contentWindow?.print()
    setTimeout(() => {
      document.body.removeChild(iframe)
    }, 1000)
  }, 500)
}

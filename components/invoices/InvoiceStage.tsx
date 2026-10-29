'use client'

import React, { useEffect, useId, useRef, useState } from 'react'

interface InvoiceStageProps {
  mode?: 'desktop' | 'mobile'
  children: React.ReactNode
  className?: string
}

const A4_WIDTH_PX = 794

export function InvoiceStage({
  mode = 'desktop',
  children,
  className = '',
}: InvoiceStageProps) {
  const rawId = useId()
  const stageKey = rawId.replace(/[^a-zA-Z0-9_-]/g, '')
  const viewportRef = useRef<HTMLDivElement | null>(null)
  const sheetMeasureRef = useRef<HTMLDivElement | null>(null)
  const [scale, setScale] = useState(1)
  const [scaledHeight, setScaledHeight] = useState<number | null>(null)

  useEffect(() => {
    if (mode !== 'desktop') {
      setScale(1)
      setScaledHeight(null)
      return
    }

    const viewportEl = viewportRef.current
    const sheetEl = sheetMeasureRef.current
    if (!viewportEl || !sheetEl) return

    const recalculate = () => {
      const style = window.getComputedStyle(viewportEl)
      const padX =
        (parseFloat(style.paddingLeft) || 0) + (parseFloat(style.paddingRight) || 0)
      const available = Math.max(260, viewportEl.clientWidth - padX)
      const nextScale =
        available < A4_WIDTH_PX
          ? Math.max(0.35, Number((available / A4_WIDTH_PX).toFixed(4)))
          : 1
      const rawHeight = sheetEl.offsetHeight || 0

      setScale(nextScale)
      setScaledHeight(nextScale < 1 && rawHeight > 0 ? Math.ceil(rawHeight * nextScale) : null)
    }

    recalculate()

    const ro = new ResizeObserver(() => {
      recalculate()
    })
    ro.observe(viewportEl)
    ro.observe(sheetEl)

    return () => {
      ro.disconnect()
    }
  }, [mode])

  const stageCss =
    mode === 'desktop' && scale < 1
      ? `
        [data-stage-outer="${stageKey}"] {
          width: ${ Math.floor(A4_WIDTH_PX * scale) }px;
          ${ scaledHeight ? `height: ${scaledHeight}px;` : '' }
        }
        [data-stage-inner="${stageKey}"] {
          width: ${A4_WIDTH_PX}px;
          transform: scale(${scale});
          transform-origin: top left;
        }
      `
      : `
        [data-stage-outer="${stageKey}"] {
          width: ${A4_WIDTH_PX}px;
        }
        [data-stage-inner="${stageKey}"] {
          width: ${A4_WIDTH_PX}px;
        }
      `

  return (
    <div
      ref={viewportRef}
      className={`bg-[#141518] border border-[#26282E] rounded-2xl p-3 sm:p-6 md:p-9 max-h-[78vh] overflow-y-auto overflow-x-hidden flex justify-center ${className}`}
    >
      {mode === 'mobile' ? (
        <div className="w-full max-w-[400px] rounded-[32px] overflow-hidden border-[5px] border-[#26282E] shadow-2xl bg-white self-start">
          {children}
        </div>
      ) : (
        <>
          <style dangerouslySetInnerHTML={{ __html: stageCss }} />
          <div data-stage-outer={stageKey} className="relative shrink-0 self-start">
            <div ref={sheetMeasureRef} data-stage-inner={stageKey}>
              {children}
            </div>
          </div>
        </>
      )}
    </div>
  )
}

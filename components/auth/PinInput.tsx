'use client'

import React, { useRef, useEffect, useState, useId } from 'react'
import { cn } from '@/lib/utils'

interface PinInputProps {
  value: string
  onChange: (value: string) => void
  onComplete?: (pin: string) => void
  disabled?: boolean
  hasError?: boolean
  errorMessage?: string
  autoFocus?: boolean
  className?: string
  id?: string
}

export function PinInput({
  value = '',
  onChange,
  onComplete,
  disabled = false,
  hasError = false,
  errorMessage,
  autoFocus = true,
  className,
  id: customId,
}: PinInputProps) {
  const generatedId = useId()
  const inputId = customId || generatedId
  const inputRefs = useRef<(HTMLInputElement | null)[]>([])
  const [digits, setDigits] = useState<string[]>(['', '', '', '', '', ''])

  // Synchronize internal digit array with value prop
  useEffect(() => {
    const clean = (value || '').replace(/\D/g, '').slice(0, 6)
    const arr = ['', '', '', '', '', '']
    for (let i = 0; i < clean.length; i++) {
      arr[i] = clean[i]
    }
    setDigits(arr)
  }, [value])

  // Focus first input on mount if requested
  useEffect(() => {
    if (autoFocus && !disabled && inputRefs.current[0]) {
      const timer = setTimeout(() => {
        inputRefs.current[0]?.focus()
      }, 50)
      return () => clearTimeout(timer)
    }
  }, [autoFocus, disabled])

  const handleDigitChange = (index: number, rawVal: string) => {
    if (disabled) return

    // Handle paste if multiple digits entered at once
    const numericStr = rawVal.replace(/\D/g, '')
    if (numericStr.length > 1) {
      handlePasteString(numericStr)
      return
    }

    const singleDigit = numericStr.slice(-1)
    const newDigits = [...digits]
    newDigits[index] = singleDigit
    const newPin = newDigits.join('')

    setDigits(newDigits)
    onChange(newPin)

    // Advance focus to next input if digit entered
    if (singleDigit && index < 5) {
      inputRefs.current[index + 1]?.focus()
    }

    // Trigger onComplete callback when 6 digits are reached
    if (newPin.length === 6 && onComplete) {
      onComplete(newPin)
    }
  }

  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (disabled) return

    if (e.key === 'Backspace') {
      if (!digits[index] && index > 0) {
        // Clear previous input and move focus back
        const newDigits = [...digits]
        newDigits[index - 1] = ''
        const newPin = newDigits.join('')
        setDigits(newDigits)
        onChange(newPin)
        inputRefs.current[index - 1]?.focus()
      } else if (digits[index]) {
        // Clear current input
        const newDigits = [...digits]
        newDigits[index] = ''
        const newPin = newDigits.join('')
        setDigits(newDigits)
        onChange(newPin)
      }
    } else if (e.key === 'ArrowLeft' && index > 0) {
      e.preventDefault()
      inputRefs.current[index - 1]?.focus()
    } else if (e.key === 'ArrowRight' && index < 5) {
      e.preventDefault()
      inputRefs.current[index + 1]?.focus()
    }
  }

  const handlePasteString = (pasted: string) => {
    const clean = pasted.replace(/\D/g, '').slice(0, 6)
    if (!clean) return

    const newDigits = ['', '', '', '', '', '']
    for (let i = 0; i < clean.length; i++) {
      newDigits[i] = clean[i]
    }
    setDigits(newDigits)
    onChange(clean)

    // Focus last filled box or next empty box
    const nextFocusIndex = Math.min(clean.length, 5)
    inputRefs.current[nextFocusIndex]?.focus()

    if (clean.length === 6 && onComplete) {
      onComplete(clean)
    }
  }

  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault()
    if (disabled) return
    const pastedData = e.clipboardData.getData('text')
    handlePasteString(pastedData)
  }

  return (
    <div className={cn('space-y-2', className)}>
      <div
        id={inputId}
        role="group"
        aria-label="6-digit PIN"
        className="flex items-center justify-between gap-1.5 sm:gap-2.5 max-w-[380px] mx-auto select-none"
      >
        {digits.map((digit, idx) => {
          const isFocused = Boolean(inputRefs.current[idx] && document.activeElement === inputRefs.current[idx])

          return (
            <input
              key={idx}
              ref={(el) => {
                inputRefs.current[idx] = el
              }}
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={1}
              autoComplete="one-time-code"
              value={digit}
              disabled={disabled}
              onChange={(e) => handleDigitChange(idx, e.target.value)}
              onKeyDown={(e) => handleKeyDown(idx, e)}
              onPaste={handlePaste}
              onFocus={(e) => e.target.select()}
              aria-label={`Digit ${idx + 1} of 6`}
              aria-invalid={hasError}
              className={cn(
                'w-11 h-13 sm:w-13 sm:h-14 rounded-xl text-center text-xl sm:text-2xl font-bold tracking-tight',
                'bg-[#F8FAFC] border transition-all duration-150 outline-none',
                'disabled:opacity-50 disabled:cursor-not-allowed',
                hasError
                  ? 'border-[#DC2626] bg-[#FEF2F2] text-[#B91C1C] focus:border-[#DC2626] focus:ring-4 focus:ring-[#DC2626]/15'
                  : isFocused || digit
                  ? 'border-[#1D63ED] bg-white text-[#0F172A] shadow-xs ring-4 ring-[#1D63ED]/15'
                  : 'border-[#E2E8F0] text-[#0F172A] hover:border-[#CBD5E1] focus:border-[#1D63ED] focus:bg-white focus:ring-4 focus:ring-[#1D63ED]/15'
              )}
            />
          )
        })}
      </div>

      {hasError && errorMessage && (
        <p role="alert" className="text-xs font-medium text-[#DC2626] text-center pt-1 animate-fade-in">
          {errorMessage}
        </p>
      )}
    </div>
  )
}

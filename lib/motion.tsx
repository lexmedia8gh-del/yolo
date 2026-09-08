/**
 * LexMedia Motion Design System
 * Reusable Framer Motion primitives for client-facing portals only.
 * Respects prefers-reduced-motion. No business logic.
 */
'use client'

import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'
import React from 'react'

export const DURATION = { fast: 0.15, normal: 0.25, slow: 0.4 } as const
export const EASE_OUT = [0.25, 0.46, 0.45, 0.94] as const
export const SPRING_SMOOTH = { type: 'spring', stiffness: 260, damping: 22 }

// Page-level fade+slide entrance
export function PageEnter({ children, className }: { children: React.ReactNode; className?: string }) {
  const r = useReducedMotion()
  return (
    <motion.div
      className={className}
      initial={r ? { opacity: 0 } : { opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: DURATION.slow, ease: EASE_OUT }}
    >
      {children}
    </motion.div>
  )
}

// Simple opacity fade
export function FadeIn({ children, delay = 0, duration = DURATION.normal, className }: {
  children: React.ReactNode; delay?: number; duration?: number; className?: string
}) {
  return (
    <motion.div className={className} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration, delay, ease: EASE_OUT }}>
      {children}
    </motion.div>
  )
}

// Fade + slide up
export function SlideUp({ children, delay = 0, duration = DURATION.normal, distance = 20, className }: {
  children: React.ReactNode; delay?: number; duration?: number; distance?: number; className?: string
}) {
  const r = useReducedMotion()
  return (
    <motion.div
      className={className}
      initial={r ? { opacity: 0 } : { opacity: 0, y: distance }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration, delay, ease: EASE_OUT }}
    >
      {children}
    </motion.div>
  )
}

// Stagger container
export function StaggerContainer({ children, stagger = 0.07, delayStart = 0, className }: {
  children: React.ReactNode; stagger?: number; delayStart?: number; className?: string
}) {
  const r = useReducedMotion()
  return (
    <motion.div
      className={className}
      initial="hidden"
      animate="visible"
      variants={{ hidden: {}, visible: { transition: { staggerChildren: r ? 0 : stagger, delayChildren: r ? 0 : delayStart } } }}
    >
      {children}
    </motion.div>
  )
}

// Stagger child item
export function StaggerItem({ children, className }: { children: React.ReactNode; className?: string }) {
  const r = useReducedMotion()
  return (
    <motion.div
      className={className}
      variants={r ? { hidden: { opacity: 0 }, visible: { opacity: 1 } } : { hidden: { opacity: 0, y: 16 }, visible: { opacity: 1, y: 0 } }}
      transition={{ duration: DURATION.normal, ease: EASE_OUT }}
    >
      {children}
    </motion.div>
  )
}

// Card with scale+fade reveal
export function CardReveal({ children, delay = 0, className }: { children: React.ReactNode; delay?: number; className?: string }) {
  const r = useReducedMotion()
  return (
    <motion.div
      className={className}
      initial={r ? { opacity: 0 } : { opacity: 0, scale: 0.97, y: 14 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{ duration: DURATION.slow, delay, ease: EASE_OUT }}
    >
      {children}
    </motion.div>
  )
}

// Success state spring entrance
export function SuccessReveal({ children, className }: { children: React.ReactNode; className?: string }) {
  const r = useReducedMotion()
  return (
    <motion.div
      className={className}
      initial={r ? { opacity: 0 } : { opacity: 0, scale: 0.88 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={r ? { duration: DURATION.fast } : SPRING_SMOOTH}
    >
      {children}
    </motion.div>
  )
}

// Error fade-down reveal
export function ErrorReveal({ children, className }: { children: React.ReactNode; className?: string }) {
  const r = useReducedMotion()
  return (
    <motion.div
      className={className}
      initial={r ? { opacity: 0 } : { opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: DURATION.normal, ease: EASE_OUT }}
    >
      {children}
    </motion.div>
  )
}

// Animated list item with exit (wrap in AnimatePresence)
export function AnimatedItem({ children, itemKey, className }: {
  children: React.ReactNode; itemKey: string; className?: string
}) {
  const r = useReducedMotion()
  return (
    <motion.div
      key={itemKey}
      layout
      className={className}
      initial={r ? { opacity: 0 } : { opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      exit={r ? { opacity: 0 } : { opacity: 0, x: -20, scale: 0.97 }}
      transition={{ duration: DURATION.normal, ease: EASE_OUT }}
    >
      {children}
    </motion.div>
  )
}

// Animated status badge swap
export function StatusBadge({ children, statusKey, className }: {
  children: React.ReactNode; statusKey: string; className?: string
}) {
  const r = useReducedMotion()
  return (
    <AnimatePresence mode="wait">
      <motion.span
        key={statusKey}
        className={className}
        initial={r ? { opacity: 0 } : { opacity: 0, scale: 0.85 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={r ? { opacity: 0 } : { opacity: 0, scale: 0.9 }}
        transition={{ duration: DURATION.fast, ease: EASE_OUT }}
      >
        {children}
      </motion.span>
    </AnimatePresence>
  )
}

// Gentle pulsing icon for loading
export function PulseIcon({ children, className }: { children: React.ReactNode; className?: string }) {
  const r = useReducedMotion()
  if (r) return <div className={className}>{children}</div>
  return (
    <motion.div className={className} animate={{ opacity: [1, 0.4, 1] }} transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }}>
      {children}
    </motion.div>
  )
}

// Shimmer skeleton for loading placeholders
export function Skeleton({ className }: { className?: string }) {
  const r = useReducedMotion()
  return (
    <motion.div
      className={`rounded-xl bg-slate-800/60 ${className ?? ''}`}
      animate={r ? undefined : { opacity: [0.5, 0.85, 0.5] }}
      transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
    />
  )
}

export { AnimatePresence, motion }

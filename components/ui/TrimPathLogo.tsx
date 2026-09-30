'use client'

import React from 'react'

interface TrimPathLogoProps {
  size?: 'sm' | 'md' | 'lg' | 'xl'
  className?: string
  animated?: boolean
}

const sizeDimensions = {
  sm: 'w-16 h-16 sm:w-20 sm:h-20',
  md: 'w-20 h-20 sm:w-28 sm:h-28',
  lg: 'w-24 h-24 sm:w-32 sm:h-32',
  xl: 'w-32 h-32 sm:w-40 sm:h-40',
}

export function TrimPathLogo({
  size = 'lg',
  className = '',
  animated = true,
}: TrimPathLogoProps) {
  return (
    <div className={`relative flex flex-col items-center justify-center ${className}`}>
      <style jsx>{`
        @keyframes strokeDraw {
          0% {
            stroke-dashoffset: 100;
            fill-opacity: 0;
          }
          65% {
            stroke-dashoffset: 0;
            fill-opacity: 0;
          }
          100% {
            stroke-dashoffset: 0;
            fill-opacity: 1;
          }
        }

        @keyframes fillFadeIn {
          0% {
            fill-opacity: 0;
          }
          100% {
            fill-opacity: 1;
          }
        }

        @keyframes brandGlowSettle {
          0% {
            transform: scale(0.96);
            filter: drop-shadow(0 0 10px rgba(99, 102, 241, 0.2));
          }
          60% {
            transform: scale(1.03);
            filter: drop-shadow(0 0 25px rgba(99, 102, 241, 0.6));
          }
          100% {
            transform: scale(1);
            filter: drop-shadow(0 0 16px rgba(99, 102, 241, 0.4));
          }
        }

        .trim-path-element {
          stroke-dasharray: 100;
          stroke-dashoffset: 100;
          animation: strokeDraw 1.1s cubic-bezier(0.25, 1, 0.5, 1) forwards;
        }

        .trim-path-delay-1 {
          animation-delay: 0.1s;
        }

        .trim-path-delay-2 {
          animation-delay: 0.25s;
        }

        .trim-path-delay-3 {
          animation-delay: 0.4s;
        }

        .brand-logo-container {
          animation: brandGlowSettle 1.4s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }

        @media (prefers-reduced-motion: reduce) {
          .trim-path-element {
            stroke-dashoffset: 0 !important;
            fill-opacity: 1 !important;
            animation: fillFadeIn 0.3s ease-out forwards !important;
          }
          .brand-logo-container {
            animation: none !important;
            filter: drop-shadow(0 0 12px rgba(99, 102, 241, 0.3)) !important;
          }
        }
      `}</style>

      {/* SVG Trim-Path Logo Emblem */}
      <div className={`brand-logo-container ${sizeDimensions[size]}`}>
        <svg
          viewBox="0 0 200 200"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className="w-full h-full"
        >
          <defs>
            {/* Brand Linear Gradient */}
            <linearGradient id="lexBrandGradient" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#818CF8" />
              <stop offset="50%" stopColor="#6366F1" />
              <stop offset="100%" stopColor="#4338CA" />
            </linearGradient>

            <linearGradient id="lexStrokeGradient" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#A5B4FC" />
              <stop offset="100%" stopColor="#6366F1" />
            </linearGradient>

            <linearGradient id="lexAccentGradient" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#38BDF8" />
              <stop offset="100%" stopColor="#818CF8" />
            </linearGradient>
          </defs>

          {/* Path 1: Outer Squircle Frame */}
          <rect
            x="15"
            y="15"
            width="170"
            height="170"
            rx="42"
            ry="42"
            fill="url(#lexBrandGradient)"
            stroke="url(#lexStrokeGradient)"
            strokeWidth="5"
            strokeLinecap="round"
            strokeLinejoin="round"
            pathLength="100"
            className={animated ? 'trim-path-element' : ''}
          />

          {/* Path 2: Monogram "L" Base & Vertical */}
          <path
            d="M 60 52 V 148 H 115"
            fill="none"
            stroke="#FFFFFF"
            strokeWidth="14"
            strokeLinecap="round"
            strokeLinejoin="round"
            pathLength="100"
            className={animated ? 'trim-path-element trim-path-delay-1' : ''}
          />

          {/* Path 3: Monogram "M" Slash / Camera Crest Accent */}
          <path
            d="M 110 148 L 132 80 L 152 118 L 170 58 V 148"
            fill="none"
            stroke="url(#lexAccentGradient)"
            strokeWidth="10"
            strokeLinecap="round"
            strokeLinejoin="round"
            pathLength="100"
            className={animated ? 'trim-path-element trim-path-delay-2' : ''}
          />

          {/* Path 4: High-Tech Spark Aperture Diamond */}
          <path
            d="M 148 38 L 156 48 L 148 58 L 140 48 Z"
            fill="#38BDF8"
            stroke="#A5B4FC"
            strokeWidth="3"
            strokeLinejoin="round"
            pathLength="100"
            className={animated ? 'trim-path-element trim-path-delay-3' : ''}
          />
        </svg>
      </div>
    </div>
  )
}

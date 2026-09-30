'use client'

import React from 'react'

interface TrimPathLogoProps {
  size?: 'sm' | 'md' | 'lg' | 'xl'
  className?: string
  animated?: boolean
}

const sizeDimensions = {
  sm: 'w-[70px] h-[70px] sm:w-[90px] sm:h-[90px]',
  md: 'w-[80px] h-[80px] sm:w-[110px] sm:h-[110px]',
  lg: 'w-[90px] h-[90px] sm:w-[120px] sm:h-[120px]', // Exact match: 90px mobile, 120px desktop
  xl: 'w-[110px] h-[110px] sm:w-[140px] sm:h-[140px]',
}

export function TrimPathLogo({
  size = 'lg',
  className = '',
  animated = true,
}: TrimPathLogoProps) {
  return (
    <div className={`relative flex flex-col items-center justify-center ${className}`}>
      <style jsx>{`
        @keyframes drawUpper {
          0% {
            stroke-dashoffset: 100;
            opacity: 0;
          }
          1% {
            opacity: 1;
          }
          100% {
            stroke-dashoffset: 0;
            opacity: 1;
          }
        }

        @keyframes drawLower {
          0% {
            stroke-dashoffset: 100;
            opacity: 0;
          }
          1% {
            opacity: 1;
          }
          100% {
            stroke-dashoffset: 0;
            opacity: 1;
          }
        }

        @keyframes containerReveal {
          0% {
            opacity: 0;
          }
          100% {
            opacity: 1;
          }
        }

        .trim-path-upper {
          stroke-dasharray: 100;
          stroke-dashoffset: 100;
          opacity: 0;
          animation: drawUpper 0.5s cubic-bezier(0.25, 1, 0.5, 1) forwards;
          animation-delay: 0.2s;
        }

        .trim-path-lower {
          stroke-dasharray: 100;
          stroke-dashoffset: 100;
          opacity: 0;
          animation: drawLower 0.7s cubic-bezier(0.25, 1, 0.5, 1) forwards;
          animation-delay: 0.8s;
        }

        .brand-logo-container {
          opacity: 0;
          animation: containerReveal 0.1s ease-out forwards;
          animation-delay: 0.15s;
        }

        @media (prefers-reduced-motion: reduce) {
          .trim-path-upper,
          .trim-path-lower {
            stroke-dashoffset: 0 !important;
            opacity: 1 !important;
            animation: none !important;
          }
          .brand-logo-container {
            animation: none !important;
            opacity: 1 !important;
          }
        }
      `}</style>

      {/* SVG Trim-Path Logo Emblem */}
      <div className={`brand-logo-container ${sizeDimensions[size]}`}>
        <svg
          viewBox="0 0 500 500"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className="w-full h-full animate-none"
        >
          {/* Upper-Right Light Blue Hook Shape */}
          <path
            d="M 250 130 L 330 210 L 380 160"
            fill="none"
            stroke="#7BC4F4"
            strokeWidth="46"
            strokeLinecap="round"
            strokeLinejoin="round"
            pathLength="100"
            className={animated ? 'trim-path-upper' : ''}
          />

          {/* Upper-Left Light Blue Short Pill Shape */}
          <path
            d="M 180 220 L 230 270"
            fill="none"
            stroke="#7BC4F4"
            strokeWidth="46"
            strokeLinecap="round"
            strokeLinejoin="round"
            pathLength="100"
            className={animated ? 'trim-path-upper' : ''}
          />

          {/* Bottom Dark Blue "W" Shape */}
          <path
            d="M 110 290 L 190 370 L 250 310 L 310 370 L 390 290"
            fill="none"
            stroke="#3B62E3"
            strokeWidth="46"
            strokeLinecap="round"
            strokeLinejoin="round"
            pathLength="100"
            className={animated ? 'trim-path-lower' : ''}
          />
        </svg>
      </div>
    </div>
  )
}

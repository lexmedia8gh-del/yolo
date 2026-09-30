'use client'

import React from 'react'

interface TrimPathLogoProps {
  size?: 'sm' | 'md' | 'lg' | 'xl'
  className?: string
  animated?: boolean
}

const sizeDimensions = {
  sm: 'w-20 h-20 sm:w-24 sm:h-24',
  md: 'w-24 h-24 sm:w-28 sm:h-28',
  lg: 'w-28 h-28 sm:w-36 sm:h-36', // ~112px mobile, ~144px desktop
  xl: 'w-36 h-36 sm:w-44 sm:h-44',
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
          }
          100% {
            stroke-dashoffset: 0;
          }
        }

        @keyframes brandGlowSettle {
          0% {
            transform: scale(0.95);
            opacity: 0;
            filter: drop-shadow(0 0 0px rgba(59, 98, 227, 0));
          }
          20% {
            opacity: 1;
          }
          70% {
            transform: scale(1.02);
            filter: drop-shadow(0 0 20px rgba(59, 98, 227, 0.45));
          }
          100% {
            transform: scale(1);
            opacity: 1;
            filter: drop-shadow(0 0 12px rgba(59, 98, 227, 0.25));
          }
        }

        .trim-path-element {
          stroke-dasharray: 100;
          stroke-dashoffset: 100;
          animation: strokeDraw 1.1s cubic-bezier(0.25, 1, 0.5, 1) forwards;
        }

        .trim-path-delay-1 {
          animation-delay: 0.2s;
        }

        .trim-path-delay-2 {
          animation-delay: 0.35s;
        }

        .brand-logo-container {
          animation: brandGlowSettle 1.4s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }

        @media (prefers-reduced-motion: reduce) {
          .trim-path-element {
            stroke-dashoffset: 0 !important;
            animation: none !important;
          }
          .brand-logo-container {
            animation: none !important;
            opacity: 1 !important;
            transform: scale(1) !important;
            filter: drop-shadow(0 0 8px rgba(59, 98, 227, 0.2)) !important;
          }
        }
      `}</style>

      {/* SVG Trim-Path Logo Emblem */}
      <div className={`brand-logo-container ${sizeDimensions[size]}`}>
        <svg
          viewBox="0 0 500 500"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className="w-full h-full"
        >
          {/* Path 1: Bottom Dark Blue "W" Shape */}
          <path
            d="M 110 290 L 190 370 L 250 310 L 310 370 L 390 290"
            fill="none"
            stroke="#3B62E3"
            strokeWidth="46"
            strokeLinecap="round"
            strokeLinejoin="round"
            pathLength="100"
            className={animated ? 'trim-path-element' : ''}
          />

          {/* Path 2: Top-Right Light Blue Hook Shape */}
          <path
            d="M 250 130 L 330 210 L 380 160"
            fill="none"
            stroke="#7BC4F4"
            strokeWidth="46"
            strokeLinecap="round"
            strokeLinejoin="round"
            pathLength="100"
            className={animated ? 'trim-path-element trim-path-delay-1' : ''}
          />

          {/* Path 3: Top-Left Light Blue Short Pill Shape */}
          <path
            d="M 180 220 L 230 270"
            fill="none"
            stroke="#7BC4F4"
            strokeWidth="46"
            strokeLinecap="round"
            strokeLinejoin="round"
            pathLength="100"
            className={animated ? 'trim-path-element trim-path-delay-2' : ''}
          />
        </svg>
      </div>
    </div>
  )
}

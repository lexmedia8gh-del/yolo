'use client';

import { Toaster } from 'react-hot-toast';

export function ToasterWrapper() {
  return (
    <Toaster
      position="top-right"
      toastOptions={{
        duration: 4000,
        style: {
          borderRadius: '12px',
          boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
          fontSize: '14px',
          fontFamily: 'var(--font-inter)',
        },
        success: {
          iconTheme: { primary: '#22C55E', secondary: '#fff' },
        },
        error: {
          iconTheme: { primary: '#EF4444', secondary: '#fff' },
        },
      }}
    />
  );
}

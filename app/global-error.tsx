'use client'

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <html lang="en">
      <body>
        <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-4 text-center">
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Something went wrong!</h2>
          <button
            onClick={() => reset()}
            className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors"
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  )
}

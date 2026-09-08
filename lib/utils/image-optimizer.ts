export function optimizeImageFile(
  file: File,
  maxDimension = 2400,
  quality = 0.82
): Promise<{ file: File; optimized: boolean; originalSize: number; optimizedSize: number }> {
  return new Promise((resolve) => {
    if (typeof window === 'undefined') {
      resolve({ file, optimized: false, originalSize: file.size, optimizedSize: file.size })
      return
    }

    // If not an image, resolve immediately
    if (!file.type.startsWith('image/')) {
      resolve({ file, optimized: false, originalSize: file.size, optimizedSize: file.size })
      return
    }

    // Only process JPEG, PNG, WebP
    const supportedTypes = ['image/jpeg', 'image/png', 'image/webp']
    if (!supportedTypes.includes(file.type)) {
      resolve({ file, optimized: false, originalSize: file.size, optimizedSize: file.size })
      return
    }

    const reader = new FileReader()
    reader.onload = (e) => {
      const img = new Image()
      img.onload = () => {
        let width = img.width
        let height = img.height

        // Determine if we need to downscale
        let needResize = false
        if (width > maxDimension || height > maxDimension) {
          needResize = true
          if (width > height) {
            height = Math.round((height * maxDimension) / width)
            width = maxDimension
          } else {
            width = Math.round((width * maxDimension) / height)
            height = maxDimension
          }
        }

        const originalSize = file.size
        // Optimize if resized OR original is larger than 1.5MB
        const shouldOptimize = needResize || originalSize > 1.5 * 1024 * 1024

        if (!shouldOptimize) {
          resolve({ file, optimized: false, originalSize, optimizedSize: originalSize })
          return
        }

        const canvas = document.createElement('canvas')
        canvas.width = width
        canvas.height = height

        const ctx = canvas.getContext('2d')
        if (!ctx) {
          resolve({ file, optimized: false, originalSize, optimizedSize: originalSize })
          return
        }

        // Draw image on canvas
        ctx.drawImage(img, 0, 0, width, height)

        // Convert canvas to Blob (prefer image/jpeg for photos, preserve PNG only for smaller images with transparency)
        const outputType = file.type === 'image/png' && originalSize < 1024 * 1024 ? 'image/png' : 'image/jpeg'
        canvas.toBlob(
          (blob) => {
            if (!blob) {
              resolve({ file, optimized: false, originalSize, optimizedSize: originalSize })
              return
            }

            // Create a new File with the original filename and proper metadata
            const optimizedFile = new File([blob], file.name, {
              type: outputType,
              lastModified: Date.now(),
            })

            // Only return the optimized file if it's actually smaller than the original!
            if (optimizedFile.size < originalSize) {
              resolve({
                file: optimizedFile,
                optimized: true,
                originalSize,
                optimizedSize: optimizedFile.size,
              })
            } else {
              resolve({ file, optimized: false, originalSize, optimizedSize: originalSize })
            }
          },
          outputType,
          quality
        )
      }

      img.onerror = () => {
        resolve({ file, optimized: false, originalSize: file.size, optimizedSize: file.size })
      }

      img.src = e.target?.result as string
    }

    reader.onerror = () => {
      resolve({ file, optimized: false, originalSize: file.size, optimizedSize: file.size })
    }

    reader.readAsDataURL(file)
  })
}

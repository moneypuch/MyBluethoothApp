// app/utils/logger.ts
// Debug logger that can be disabled in production for performance

const DEBUG = __DEV__ && true // Temporarily enabled to test polling performance
const DEBUG_DATA_PROCESSING = false // Separate flag for high-frequency data logs

export const debugLog = (...args: any[]) => {
  if (DEBUG) console.log(...args)
}

export const debugError = (...args: any[]) => {
  // Always log errors even in production
  console.error(...args)
}

export const debugWarn = (...args: any[]) => {
  if (DEBUG) console.warn(...args)
}

export const debugDataLog = (...args: any[]) => {
  // Special logger for high-frequency data processing
  // This should almost always be disabled
  if (DEBUG_DATA_PROCESSING) console.log(...args)
}

// Performance logger for monitoring
export const perfLog = (label: string, start: number) => {
  if (DEBUG) {
    const duration = Date.now() - start
    console.log(`[PERF] ${label}: ${duration}ms`)
  }
}

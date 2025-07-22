// app/utils/SEmgDataProcessor.ts
/**
 * Non-observable data processor for high-frequency sEMG data
 * This class handles all data processing outside of MobX to prevent UI blocking
 */

import { SEmgCircularBuffer, type SEmgSample } from "./CircularBuffer"

export interface ProcessorSnapshot {
  latestSamples: SEmgSample[]
  channelStats: Record<string, { min: number; max: number; avg: number; rms: number; count: number }>
  bufferStats: {
    buffer1kHz: { size: number; capacity: number; fillRate: number }
    buffer100Hz: { size: number; capacity: number; fillRate: number }
  }
  totalSamplesProcessed: number
  lastUpdateTime: number
}

export class SEmgDataProcessor {
  // Buffers are NOT observable - this is key!
  private buffer1kHz: SEmgCircularBuffer
  private buffer100Hz: SEmgCircularBuffer
  private buffer10Hz: SEmgCircularBuffer
  
  // Processing state
  private totalSamplesProcessed = 0
  private downsampleCounter = 0
  private lastSnapshotTime = 0
  private currentSessionId: string | null = null
  
  // Performance tracking
  private processingTimes: number[] = []
  private maxProcessingTimes = 100
  
  constructor() {
    this.buffer1kHz = new SEmgCircularBuffer(10000) // 10 seconds at 1kHz
    this.buffer100Hz = new SEmgCircularBuffer(6000) // 60 seconds at 100Hz
    this.buffer10Hz = new SEmgCircularBuffer(3600) // 6 minutes at 10Hz
  }
  
  /**
   * Process a single line of data - NO MobX reactivity here!
   */
  processLine(line: string, sessionId: string): boolean {
    const startTime = performance.now()
    
    if (!line || !sessionId) return false
    
    const values = line
      .split(/\s+/)
      .map((n) => Number(n))
      .filter((n) => !isNaN(n))
    
    if (values.length !== 10) return false
    
    const sample: SEmgSample = {
      timestamp: Date.now(),
      values,
      sessionId,
    }
    
    // Add to 1kHz buffer
    this.buffer1kHz.push(sample)
    this.totalSamplesProcessed++
    
    // Downsample for 100Hz buffer (every 10th sample)
    this.downsampleCounter++
    if (this.downsampleCounter >= 10) {
      this.buffer100Hz.push(sample)
      this.downsampleCounter = 0
      
      // Downsample for 10Hz buffer (every 100th sample)
      if (this.totalSamplesProcessed % 100 === 0) {
        this.buffer10Hz.push(sample)
      }
    }
    
    // Track processing performance
    const processingTime = performance.now() - startTime
    this.processingTimes.push(processingTime)
    if (this.processingTimes.length > this.maxProcessingTimes) {
      this.processingTimes.shift()
    }
    
    return true
  }
  
  /**
   * Process multiple lines in batch
   */
  processBatch(lines: string[], sessionId: string): number {
    let processed = 0
    for (const line of lines) {
      if (this.processLine(line, sessionId)) {
        processed++
      }
    }
    return processed
  }
  
  /**
   * Get a snapshot of current data for UI rendering
   * This is called periodically, not reactively
   */
  getSnapshot(sampleCount: number = 20): ProcessorSnapshot {
    const now = Date.now()
    this.lastSnapshotTime = now
    
    // Get latest samples for display
    const latestSamples = this.buffer1kHz.getLatest(sampleCount)
    
    // Calculate channel statistics
    const channelStats: Record<string, { min: number; max: number; avg: number; rms: number; count: number }> = {}
    for (let ch = 0; ch < 10; ch++) {
      channelStats[`ch${ch}`] = this.buffer1kHz.getChannelStatistics(ch, 100)
    }
    
    // Get buffer statistics
    const bufferStats = {
      buffer1kHz: this.buffer1kHz.getStats(),
      buffer100Hz: this.buffer100Hz.getStats(),
      buffer10Hz: this.buffer10Hz.getStats(),
    }
    
    return {
      latestSamples,
      channelStats,
      bufferStats,
      totalSamplesProcessed: this.totalSamplesProcessed,
      lastUpdateTime: now,
    }
  }
  
  /**
   * Get chart data for a specific channel
   */
  getChartData(channel: number, count: number = 50, bufferType: '1kHz' | '100Hz' | '10Hz' = '100Hz') {
    const buffer = bufferType === '1kHz' ? this.buffer1kHz : 
                   bufferType === '100Hz' ? this.buffer100Hz : 
                   this.buffer10Hz
    return buffer.getChartData(channel, count)
  }
  
  /**
   * Clear all buffers and reset state
   */
  clear() {
    this.buffer1kHz.clear()
    this.buffer100Hz.clear()
    this.buffer10Hz.clear()
    this.totalSamplesProcessed = 0
    this.downsampleCounter = 0
    this.processingTimes = []
  }
  
  /**
   * Set current session ID
   */
  setSessionId(sessionId: string | null) {
    this.currentSessionId = sessionId
  }
  
  /**
   * Get performance metrics
   */
  getPerformanceMetrics() {
    if (this.processingTimes.length === 0) {
      return { avg: 0, max: 0, min: 0 }
    }
    
    const avg = this.processingTimes.reduce((a, b) => a + b, 0) / this.processingTimes.length
    const max = Math.max(...this.processingTimes)
    const min = Math.min(...this.processingTimes)
    
    return { avg, max, min }
  }
  
  /**
   * Get samples for a specific frequency
   */
  getLatestSamples(count: number, frequency: '1kHz' | '100Hz' | '10Hz' = '1kHz'): SEmgSample[] {
    const buffer = frequency === '1kHz' ? this.buffer1kHz :
                   frequency === '100Hz' ? this.buffer100Hz :
                   this.buffer10Hz
    return buffer.getLatest(count)
  }
}
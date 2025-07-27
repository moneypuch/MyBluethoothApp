/**
 * High-performance circular buffer implementation for real-time data streaming.
 * Provides O(1) insertions and retrievals, eliminating the O(n) operations
 * caused by array.unshift() and array.slice() in high-frequency scenarios.
 */

export interface SEmgSample {
  timestamp: number
  values: number[] // 10 channels
  sessionId: string
}

export class CircularBuffer<T> {
  private buffer: (T | undefined)[]
  private head = 0 // Points to the next insertion position
  private size = 0 // Current number of elements
  private readonly capacity: number

  constructor(capacity: number) {
    this.capacity = capacity
    this.buffer = new Array(capacity)
  }

  /**
   * Add a new item to the buffer (newest items go to the front conceptually)
   * O(1) operation
   */
  push(item: T): void {
    this.buffer[this.head] = item
    this.head = (this.head + 1) % this.capacity
    if (this.size < this.capacity) {
      this.size++
    }
  }

  /**
   * Get the most recent N items (equivalent to buffer.slice(0, count))
   * Returns items in newest-to-oldest order
   * O(n) where n is the requested count, not the buffer size
   */
  getLatest(count: number): T[] {
    const actualCount = Math.min(count, this.size)
    const result: T[] = []

    for (let i = 0; i < actualCount; i++) {
      const index = (this.head - 1 - i + this.capacity) % this.capacity
      const item = this.buffer[index]
      if (item !== undefined) {
        result.push(item)
      }
    }

    return result
  }

  /**
   * Get all items in the buffer
   * Returns items in newest-to-oldest order
   * O(n) where n is the current size
   */
  getAll(): T[] {
    return this.getLatest(this.size)
  }

  /**
   * Get items within a specific time range
   * Assumes items have a 'timestamp' property
   * O(n) where n is the current size (unavoidable for time range queries)
   */
  getTimeRange(startTime: number, endTime: number): T[] {
    const result: T[] = []

    for (let i = 0; i < this.size; i++) {
      const index = (this.head - 1 - i + this.capacity) % this.capacity
      const item = this.buffer[index]

      if (item && typeof item === "object" && "timestamp" in item) {
        const timestamp = (item as any).timestamp
        if (timestamp >= startTime && timestamp <= endTime) {
          result.push(item)
        }
        // Since items are ordered by insertion time (newest first),
        // we can break early if we've passed the start time
        if (timestamp < startTime) {
          break
        }
      }
    }

    return result
  }

  /**
   * Clear the buffer
   * O(1) operation
   */
  clear(): void {
    this.head = 0
    this.size = 0
    // Note: We don't need to clear the array elements for performance,
    // they'll be overwritten as needed
  }

  /**
   * Get current size of the buffer
   */
  getSize(): number {
    return this.size
  }

  /**
   * Remove the oldest element from the buffer
   * O(1) operation
   */
  removeOldest(): T | undefined {
    if (this.size === 0) {
      return undefined
    }

    // Calculate the position of the oldest element
    const oldestIndex = (this.head - this.size + this.capacity) % this.capacity
    const oldest = this.buffer[oldestIndex]
    
    // Decrease size
    this.size--
    
    return oldest
  }

  /**
   * Get maximum capacity of the buffer
   */
  getCapacity(): number {
    return this.capacity
  }

  /**
   * Check if buffer is empty
   */
  isEmpty(): boolean {
    return this.size === 0
  }

  /**
   * Check if buffer is full
   */
  isFull(): boolean {
    return this.size === this.capacity
  }

  /**
   * Get the newest (most recently added) item
   * O(1) operation
   */
  getNewest(): T | undefined {
    if (this.size === 0) return undefined
    const index = (this.head - 1 + this.capacity) % this.capacity
    return this.buffer[index]
  }

  /**
   * Get the oldest item in the buffer
   * O(1) operation
   */
  getOldest(): T | undefined {
    if (this.size === 0) return undefined
    if (this.size < this.capacity) {
      // Buffer not full, oldest is at index 0
      return this.buffer[0]
    } else {
      // Buffer is full, oldest is at current head position
      return this.buffer[this.head]
    }
  }

  /**
   * Get buffer statistics for monitoring
   */
  getStats(): {
    size: number
    capacity: number
    usage: number // Percentage full
    memoryEstimateMB: number
  } {
    // Rough estimate assuming each item is ~100 bytes (10 channels * 8 bytes + metadata)
    const avgItemSize = 100
    const memoryEstimate = (this.capacity * avgItemSize) / (1024 * 1024)

    return {
      size: this.size,
      capacity: this.capacity,
      usage: (this.size / this.capacity) * 100,
      memoryEstimateMB: memoryEstimate,
    }
  }
}

/**
 * Specialized circular buffer for sEMG samples with additional utility methods
 */
export class SEmgCircularBuffer extends CircularBuffer<SEmgSample> {
  /**
   * Get samples for a specific channel
   * O(n) where n is the requested count
   */
  getChannelData(channel: number, count?: number): Array<{ timestamp: number; value: number }> {
    const samples = count ? this.getLatest(count) : this.getAll()
    return samples.map((sample) => ({
      timestamp: sample.timestamp,
      value: sample.values[channel] || 0,
    }))
  }

  /**
   * Calculate statistics for a specific channel
   * O(n) where n is the sample count for calculation
   */
  getChannelStatistics(
    channel: number,
    sampleCount?: number,
  ): {
    min: number
    max: number
    avg: number
    rms: number
    count: number
  } {
    const samples = sampleCount ? this.getLatest(sampleCount) : this.getAll()
    const values = samples.map((s) => s.values[channel] || 0)

    if (values.length === 0) {
      return { min: 0, max: 0, avg: 0, rms: 0, count: 0 }
    }

    const min = Math.min(...values)
    const max = Math.max(...values)
    const avg = values.reduce((sum, val) => sum + val, 0) / values.length
    const rms = Math.sqrt(values.reduce((sum, val) => sum + val * val, 0) / values.length)

    return { min, max, avg, rms, count: values.length }
  }

  /**
   * Get data formatted for chart libraries (react-native-gifted-charts)
   * O(n) where n is the requested count
   */
  getChartData(channel: number, count?: number): Array<{ x: number; y: number }> {
    const samples = count ? this.getLatest(count) : this.getAll()
    return samples
      .map((sample) => ({
        x: sample.timestamp,
        y: sample.values[channel] || 0,
      }))
      .reverse() // Reverse to get chronological order for charts
  }

  /**
   * Get downsampled data for efficient charting of large datasets
   * O(n) where n is the buffer size, but returns only 'maxPoints' items
   */
  getDownsampledChartData(
    channel: number,
    maxPoints: number = 1000,
    timeRange?: { start: number; end: number },
  ): Array<{ x: number; y: number }> {
    const samples = timeRange ? this.getTimeRange(timeRange.start, timeRange.end) : this.getAll()

    if (samples.length <= maxPoints) {
      return this.getChartData(channel, samples.length)
    }

    // Simple decimation downsampling
    const step = Math.floor(samples.length / maxPoints)
    const downsampled: SEmgSample[] = []

    for (let i = 0; i < samples.length; i += step) {
      downsampled.push(samples[i])
    }

    return downsampled
      .map((sample) => ({
        x: sample.timestamp,
        y: sample.values[channel] || 0,
      }))
      .reverse()
  }
}

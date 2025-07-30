// backend-example.js
// Example Express.js backend for sEMG data collection
// This is a reference implementation - copy to your backend project

const express = require("express")
const mongoose = require("mongoose")
const cors = require("cors")

const app = express()
app.use(cors())
app.use(express.json({ limit: "50mb" })) // Large limit for batch data

// MongoDB Schema
const semgSampleSchema = new mongoose.Schema({
  sessionId: { type: String, required: true, index: true },
  timestamp: { type: Number, required: true },
  values: { type: [Number], required: true }, // Array of 10 channel values
  deviceInfo: {
    name: String,
    address: String,
  },
  receivedAt: { type: Date, default: Date.now },
  batchId: String,
})

// Create compound index for efficient queries
semgSampleSchema.index({ sessionId: 1, timestamp: 1 })

const SemgSample = mongoose.model("SemgSample", semgSampleSchema)

// Session schema for metadata
const sessionSchema = new mongoose.Schema({
  sessionId: { type: String, required: true, unique: true },
  deviceName: String,
  deviceAddress: String,
  startTime: Number,
  endTime: Number,
  sampleCount: Number,
  createdAt: { type: Date, default: Date.now },
})

const Session = mongoose.model("Session", sessionSchema)

// Batch endpoint for high-frequency data
app.post("/api/semg/batch", async (req, res) => {
  const { sessionId, samples, deviceInfo, batchInfo } = req.body

  if (!sessionId || !samples || !Array.isArray(samples)) {
    return res.status(400).json({
      error: "Invalid request: sessionId and samples array required",
    })
  }

  try {
    // Generate batch ID for tracking
    const batchId = `batch_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`

    // Transform samples for bulk insert
    const documents = samples.map((sample) => ({
      sessionId,
      timestamp: sample.timestamp,
      values: sample.values,
      deviceInfo,
      batchId,
    }))

    // Bulk insert for performance
    const result = await SemgSample.insertMany(documents, {
      ordered: false, // Continue on error
    })

    // Update session metadata
    await Session.findOneAndUpdate(
      { sessionId },
      {
        $set: {
          deviceName: deviceInfo.name,
          deviceAddress: deviceInfo.address,
          endTime: batchInfo.endTime,
        },
        $inc: { sampleCount: samples.length },
      },
      { upsert: true },
    )

    console.log(`Received batch ${batchId}: ${samples.length} samples for session ${sessionId}`)

    res.status(200).json({
      success: true,
      batchId,
      samplesReceived: result.length,
      message: `Successfully stored ${result.length} samples`,
    })
  } catch (error) {
    console.error("Batch insert error:", error)
    res.status(500).json({
      error: "Failed to store samples",
      message: error.message,
    })
  }
})

// Get session data endpoint
app.get("/api/semg/session/:sessionId", async (req, res) => {
  try {
    const { sessionId } = req.params
    const { start, end, downsample } = req.query

    let query = { sessionId }
    if (start || end) {
      query.timestamp = {}
      if (start) query.timestamp.$gte = parseInt(start)
      if (end) query.timestamp.$lte = parseInt(end)
    }

    let samples = await SemgSample.find(query).sort({ timestamp: 1 }).lean()

    // Optional downsampling for large datasets
    if (downsample && samples.length > downsample) {
      const factor = Math.ceil(samples.length / downsample)
      samples = samples.filter((_, index) => index % factor === 0)
    }

    res.json({
      sessionId,
      sampleCount: samples.length,
      samples,
    })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

// Get all sessions
app.get("/api/semg/sessions", async (req, res) => {
  try {
    const sessions = await Session.find().sort({ createdAt: -1 }).limit(100)
    res.json(sessions)
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

// MongoDB connection
mongoose.connect("mongodb://localhost:27017/semg_data", {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})

const PORT = process.env.PORT || 3000
app.listen(PORT, () => {
  console.log(`sEMG backend server running on port ${PORT}`)
})

// Graceful shutdown
process.on("SIGINT", async () => {
  await mongoose.connection.close()
  process.exit(0)
})

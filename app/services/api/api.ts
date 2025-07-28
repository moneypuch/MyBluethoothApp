// app/services/api/api.ts
import { ApisauceInstance, create, ApiResponse } from "apisauce"
import { GeneralApiProblem, getGeneralApiProblem } from "./apiProblem"

// Types based on your Express API
export interface User {
  id: string
  name: string
  email: string
  role: "user" | "admin"
  isVerified: boolean
  createdAt: string
  updatedAt: string
}

export interface AuthResponse {
  success: boolean
  token: string
  user: User
}

export interface ApiError {
  success: false
  message: string
  errors?: string[]
}

export interface LoginRequest {
  email: string
  password: string
}

export interface RegisterRequest {
  name: string
  email: string
  password: string
}

// sEMG Data Types
export interface SampleData {
  timestamp: number
  values: number[] // Array of 10 channel values
  sessionId: string
}

export interface BatchRequest {
  sessionId: string
  samples: SampleData[]
  deviceInfo: {
    name: string
    address: string
  }
  batchInfo: {
    size: number
    startTime: number
    endTime: number
  }
}

export interface BatchResponse {
  success: boolean
  chunkId: string
  chunkIndex: number
  samplesProcessed: number
  sessionStatus: string
}

export interface Session {
  sessionId: string
  userId: string
  deviceId: string
  deviceName: string
  startTime: string
  endTime?: string
  sampleRate: number
  channelCount: number
  totalSamples: number
  status: "active" | "completed" | "error"
  duration?: number
  metadata?: {
    appVersion?: string
    deviceInfo?: any
    notes?: string
  }
}

export interface SessionsResponse {
  success: boolean
  sessions: Session[]
  pagination: {
    total: number
    limit: number
    offset: number
    hasMore: boolean
  }
}

export interface SessionDataResponse {
  success: boolean
  data: {
    sessionId: string
    timeRange: [number, number]
    chunks: number
    channels: {
      [channelKey: string]: Array<{
        timestamp: number
        value: number
      }>
    }
    stats: {
      [channelKey: string]: {
        min: number
        max: number
        avg: number
        rms: number
        count: number
      }
    }
  }
}

export interface CreateSessionRequest {
  sessionId: string
  deviceId: string
  deviceName: string
  startTime: string
  sampleRate?: number
  channelCount?: number
  metadata?: {
    appVersion?: string
    notes?: string
    deviceInfo?: any
  }
}

export interface ApiConfig {
  url: string
  timeout: number
}

export const DEFAULT_API_CONFIG_EMULATOR: ApiConfig = {
  url: "http://10.0.2.2:3000", // Your Express server
  timeout: 10000,
}
export const DEFAULT_API_CONFIG: ApiConfig = {
  url: "http://192.168.1.37:3000", // Your Express server
  timeout: 10000,
}

export class Api {
  apisauce: ApisauceInstance
  config: ApiConfig

  constructor(config: ApiConfig = DEFAULT_API_CONFIG) {
    this.config = config
    this.apisauce = create({
      baseURL: this.config.url,
      timeout: this.config.timeout,
      headers: {
        "Accept": "application/json",
        "Content-Type": "application/json",
      },
    })
  }

  setAuthToken = (token: string) => {
    this.apisauce.setHeader("Authorization", `Bearer ${token}`)
  }

  removeAuthToken = () => {
    this.apisauce.deleteHeader("Authorization")
  }

  // Login
  async login(
    credentials: LoginRequest,
  ): Promise<{ kind: "ok"; data: AuthResponse } | GeneralApiProblem> {
    const response: ApiResponse<AuthResponse | ApiError> = await this.apisauce.post(
      "/api/auth/login",
      credentials,
    )

    if (!response.ok) {
      const problem = getGeneralApiProblem(response)
      if (problem) return problem
    }

    return { kind: "ok", data: response.data as AuthResponse }
  }

  // Register
  async register(
    userData: RegisterRequest,
  ): Promise<{ kind: "ok"; data: AuthResponse } | GeneralApiProblem> {
    const response: ApiResponse<AuthResponse | ApiError> = await this.apisauce.post(
      "/api/auth/register",
      userData,
    )

    if (!response.ok) {
      const problem = getGeneralApiProblem(response)
      if (problem) return problem
    }

    return { kind: "ok", data: response.data as AuthResponse }
  }

  // Get Profile
  async getProfile(): Promise<
    { kind: "ok"; data: { success: boolean; user: User } } | GeneralApiProblem
  > {
    const response: ApiResponse<{ success: boolean; user: User } | ApiError> =
      await this.apisauce.get("/api/auth/me")

    if (!response.ok) {
      const problem = getGeneralApiProblem(response)
      if (problem) return problem
    }

    return { kind: "ok", data: response.data as { success: boolean; user: User } }
  }

  // Logout
  async logout(): Promise<{ kind: "ok" } | GeneralApiProblem> {
    const response = await this.apisauce.post("/api/auth/logout")

    if (!response.ok) {
      const problem = getGeneralApiProblem(response)
      if (problem) return problem
    }

    return { kind: "ok" }
  }

  // === sEMG Data API Methods ===

  // Upload batch of sEMG data
  async uploadBatch(
    batchData: BatchRequest,
  ): Promise<{ kind: "ok"; data: BatchResponse } | GeneralApiProblem> {
    const response: ApiResponse<BatchResponse | ApiError> = await this.apisauce.post(
      "/api/semg/batch",
      batchData,
    )

    if (!response.ok) {
      const problem = getGeneralApiProblem(response)
      if (problem) return problem
    }

    return { kind: "ok", data: response.data as BatchResponse }
  }

  // === Session API Methods ===

  // Get user's sessions
  async getSessions(params?: {
    limit?: number
    offset?: number
    status?: "active" | "completed" | "error"
    deviceId?: string
  }): Promise<{ kind: "ok"; data: SessionsResponse } | GeneralApiProblem> {
    const response: ApiResponse<SessionsResponse | ApiError> = await this.apisauce.get(
      "/api/sessions",
      params,
    )

    if (!response.ok) {
      const problem = getGeneralApiProblem(response)
      if (problem) return problem
    }

    return { kind: "ok", data: response.data as SessionsResponse }
  }

  // Create new session
  async createSession(
    sessionData: CreateSessionRequest,
  ): Promise<{ kind: "ok"; data: { success: boolean; session: Session } } | GeneralApiProblem> {
    const response: ApiResponse<{ success: boolean; session: Session } | ApiError> =
      await this.apisauce.post("/api/sessions", sessionData)

    if (!response.ok) {
      const problem = getGeneralApiProblem(response)
      if (problem) return problem
    }

    return { kind: "ok", data: response.data as { success: boolean; session: Session } }
  }

  // Get session details
  async getSession(
    sessionId: string,
  ): Promise<{ kind: "ok"; data: { success: boolean; session: Session } } | GeneralApiProblem> {
    const response: ApiResponse<{ success: boolean; session: Session } | ApiError> =
      await this.apisauce.get(`/api/sessions/${sessionId}`)

    if (!response.ok) {
      const problem = getGeneralApiProblem(response)
      if (problem) return problem
    }

    return { kind: "ok", data: response.data as { success: boolean; session: Session } }
  }

  // Get session data
  async getSessionData(
    sessionId: string,
    params?: {
      startTime?: number
      endTime?: number
      channels?: string // "0,1,2"
      maxPoints?: number
    },
  ): Promise<{ kind: "ok"; data: SessionDataResponse } | GeneralApiProblem> {
    const response: ApiResponse<SessionDataResponse | ApiError> = await this.apisauce.get(
      `/api/semg/sessions/${sessionId}/data`,
      params,
    )

    if (!response.ok) {
      const problem = getGeneralApiProblem(response)
      if (problem) return problem
    }

    return { kind: "ok", data: response.data as SessionDataResponse }
  }

  // End session
  async endSession(
    sessionId: string,
    endData: { endTime: string; totalSamples?: number },
  ): Promise<{ kind: "ok"; data: { success: boolean; session: Session } } | GeneralApiProblem> {
    const response: ApiResponse<{ success: boolean; session: Session } | ApiError> =
      await this.apisauce.put(`/api/sessions/${sessionId}/end`, endData)

    if (!response.ok) {
      const problem = getGeneralApiProblem(response)
      if (problem) return problem
    }

    return { kind: "ok", data: response.data as { success: boolean; session: Session } }
  }

  // Delete session
  async deleteSession(
    sessionId: string,
  ): Promise<
    | { kind: "ok"; data: { success: boolean; message: string; deletedChunks: number } }
    | GeneralApiProblem
  > {
    const response: ApiResponse<
      { success: boolean; message: string; deletedChunks: number } | ApiError
    > = await this.apisauce.delete(`/api/sessions/${sessionId}`)

    if (!response.ok) {
      const problem = getGeneralApiProblem(response)
      if (problem) return problem
    }

    return {
      kind: "ok",
      data: response.data as { success: boolean; message: string; deletedChunks: number },
    }
  }
}

// Singleton instance
export const api = new Api()

// Helper to get error message
export function getErrorMessage(problem: GeneralApiProblem | { kind: "ok"; data: any }): string {
  if (problem.kind === "ok") return ""

  switch (problem.kind) {
    case "unauthorized":
      return "Invalid email or password"
    case "forbidden":
      return "Access denied"
    case "not-found":
      return "Resource not found"
    case "bad-data":
      return "Invalid data provided"
    case "timeout":
      return "Request timeout. Please try again."
    case "cannot-connect":
      return "Cannot connect to server. Please check your internet connection."
    case "server":
      return "Server error. Please try again later."
    default:
      return "An unexpected error occurred"
  }
}

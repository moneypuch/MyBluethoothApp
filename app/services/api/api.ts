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
  deviceType?: "HC-05" | "IMU" | null
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
  deviceType?: "HC-05" | "IMU" | null
  startTime: string
  sampleRate?: number
  channelCount?: number
  metadata?: {
    appVersion?: string
    notes?: string
    deviceInfo?: any
  }
}

// Admin interfaces
export interface AdminUser {
  _id: string
  name: string
  email: string
  role: "user" | "admin"
  isVerified: boolean
  lastLogin?: string
  createdAt: string
  sessionCount: number
  activeSessions: number
  completedSessions: number
  lastSessionDate?: string
  totalSamples: number
}

export interface AdminUsersResponse {
  success: boolean
  users: AdminUser[]
  pagination: {
    page: number
    limit: number
    total: number
    hasMore: boolean
  }
}

export interface UserSessionsResponse {
  success: boolean
  user: {
    _id: string
    name: string
    email: string
  }
  sessions: Session[]
  pagination: {
    page: number
    limit: number
    total: number
    hasMore: boolean
  }
}

export interface AdminStatsResponse {
  success: boolean
  stats: {
    totalUsers: number
    totalSessions: number
    activeSessions: number
    completedSessions: number
    totalDataChunks: number
    totalSamples: number
    usersWithSessions: number
    avgSessionsPerUser: number
    avgSamplesPerSession: number
  }
  timestamp: string
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
  url: __DEV__
    ? "https://raccoon-advanced-cod.ngrok-free.app"
    : "https://raccoon-advanced-cod.ngrok-free.app", // Your Express server
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

  // Admin methods
  async getAdminUsers(params?: {
    page?: number
    limit?: number
    search?: string
    role?: "user" | "admin"
  }): Promise<{ kind: "ok"; data: AdminUsersResponse } | GeneralApiProblem> {
    const response: ApiResponse<AdminUsersResponse | ApiError> = await this.apisauce.get(
      "/api/admin/users",
      params,
    )

    if (!response.ok) {
      const problem = getGeneralApiProblem(response)
      if (problem) return problem
    }

    return { kind: "ok", data: response.data as AdminUsersResponse }
  }

  async getUserSessions(
    userId: string,
    params?: {
      page?: number
      limit?: number
      status?: "active" | "completed" | "error"
      deviceType?: "HC-05" | "IMU"
    },
  ): Promise<{ kind: "ok"; data: UserSessionsResponse } | GeneralApiProblem> {
    const response: ApiResponse<UserSessionsResponse | ApiError> = await this.apisauce.get(
      `/api/admin/users/${userId}/sessions`,
      params,
    )

    if (!response.ok) {
      const problem = getGeneralApiProblem(response)
      if (problem) return problem
    }

    return { kind: "ok", data: response.data as UserSessionsResponse }
  }

  async deleteAdminSession(
    sessionId: string,
  ): Promise<
    | { kind: "ok"; data: { success: boolean; message: string; deletedChunks: number } }
    | GeneralApiProblem
  > {
    const response: ApiResponse<
      { success: boolean; message: string; deletedChunks: number } | ApiError
    > = await this.apisauce.delete(`/api/admin/sessions/${sessionId}`)

    if (!response.ok) {
      const problem = getGeneralApiProblem(response)
      if (problem) return problem
    }

    return {
      kind: "ok",
      data: response.data as { success: boolean; message: string; deletedChunks: number },
    }
  }

  async getAdminStats(): Promise<{ kind: "ok"; data: AdminStatsResponse } | GeneralApiProblem> {
    const response: ApiResponse<AdminStatsResponse | ApiError> =
      await this.apisauce.get("/api/admin/stats")

    if (!response.ok) {
      const problem = getGeneralApiProblem(response)
      if (problem) return problem
    }

    return { kind: "ok", data: response.data as AdminStatsResponse }
  }

  async downloadSession(
    sessionId: string,
  ): Promise<{ kind: "ok"; data: Blob; filename: string } | GeneralApiProblem> {
    try {
      // Get the auth token from storage
      const token = this.apisauce.headers["Authorization"]

      const response = await fetch(
        `${this.apisauce.getBaseURL()}/api/sessions/${sessionId}/download`,
        {
          method: "GET",
          headers: {
            Authorization: (token as string) || "",
          },
        },
      )

      if (!response.ok) {
        // Convert fetch response to ApiResponse format for error handling
        const errorData = await response.text()
        const apiResponse: ApiResponse<any> = {
          ok: false,
          problem: response.status === 401 ? "CLIENT_ERROR" : "SERVER_ERROR",
          originalError: new Error(errorData) as any,
          data: errorData ? { message: errorData } : null,
          status: response.status,
          headers: response.headers as any,
          config: {} as any,
          duration: 0,
        }
        const problem = getGeneralApiProblem(apiResponse)
        if (problem) return problem
      }

      // Extract filename from Content-Disposition header or use default
      const contentDisposition = response.headers.get("Content-Disposition")
      let filename = `session_${sessionId}_data.csv`
      if (contentDisposition) {
        const match = contentDisposition.match(/filename="?(.+)"?/)
        if (match) filename = match[1]
      }

      const blob = await response.blob()
      return { kind: "ok", data: blob, filename }
    } catch (_error) {
      return { kind: "cannot-connect", temporary: true }
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
    case "rejected":
      return "Request rejected by server"
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

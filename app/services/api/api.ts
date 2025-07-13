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

export interface ApiConfig {
  url: string
  timeout: number
}

export const DEFAULT_API_CONFIG_EMULATOR: ApiConfig = {
  url: "http://10.0.2.2:3000", // Your Express server
  timeout: 10000,
}
export const DEFAULT_API_CONFIG: ApiConfig = {
  url: "http://192.168.1.54:3000", // Your Express server
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

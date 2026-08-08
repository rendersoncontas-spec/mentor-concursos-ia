export interface User {
  id: string
  email: string
  name?: string
  role?: string
}

export type AuthErrorCode = 
  | "UNCONFIRMED_EMAIL" 
  | "ALREADY_REGISTERED" 
  | "INVALID_CREDENTIALS"
  | "UNKNOWN_ERROR"

export interface AuthResponse<T = void> {
  success: boolean
  error?: string
  code?: AuthErrorCode
  data?: T
}

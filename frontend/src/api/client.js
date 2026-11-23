import axios from 'axios'
import { toApiError } from './errors.js'

// The single place the backend URL is configured. Only public, non-secret values belong in
// VITE_* variables because they are bundled into the browser. The Gemini key lives only in backend/.env.
export const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000').replace(/\/+$/, '')

const apiClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: 20000,
  headers: { 'Content-Type': 'application/json' },
})

// Every failure leaves this module as a friendly ApiError (see errors.js)
apiClient.interceptors.response.use(
  (response) => response,
  (error) => Promise.reject(toApiError(error, { baseUrl: API_BASE_URL })),
)

// Requests that wait on Gemini (start = question generation, evaluate = scoring). Must exceed the backend's worst case:
// two attempts of GEMINI_TIMEOUT_SECONDS (default 30s) plus a short pause. Raise it if you raise that setting.
export const AI_REQUEST_TIMEOUT_MS = 90000

export default apiClient

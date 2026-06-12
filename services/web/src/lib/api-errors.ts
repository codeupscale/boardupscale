import axios from 'axios'

export function isApiNotFound(error: unknown): boolean {
  return axios.isAxiosError(error) && error.response?.status === 404
}

export function getApiErrorMessage(error: unknown, fallback: string): string {
  if (!axios.isAxiosError(error)) return fallback
  const data = error.response?.data as { message?: string; error?: { message?: string } } | undefined
  return data?.message || data?.error?.message || fallback
}

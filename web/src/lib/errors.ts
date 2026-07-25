import { isAxiosError } from 'axios'

export function extractErrorMessage(error: unknown): string {
  if (isAxiosError(error)) {
    const data = error.response?.data as { message?: string } | undefined
    if (data?.message) return data.message
  }
  return 'Something went wrong. Please try again.'
}

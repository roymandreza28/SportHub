import { isAxiosError } from 'axios'

export function extractErrorMessage(error: unknown): string {
  if (isAxiosError(error)) {
    const data = error.response?.data as { message?: string } | undefined
    if (data?.message) return data.message
  }
  return 'Something went wrong. Please try again.'
}

// Laravel's 422 validation response shape: { message, errors: { field: [msg, ...] } }.
// Flattened to one message per field so a form can show it right under the
// relevant input instead of one generic paragraph at the top.
export function extractFieldErrors(error: unknown): Record<string, string> {
  if (isAxiosError(error)) {
    const data = error.response?.data as { errors?: Record<string, string[]> } | undefined
    if (data?.errors) {
      return Object.fromEntries(Object.entries(data.errors).map(([field, messages]) => [field, messages[0]]))
    }
  }
  return {}
}

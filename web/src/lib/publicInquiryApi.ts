import { api } from './api'

// Mirrors PublicInquiryController::TOPICS on the backend — kept in sync by
// hand since the validation rule there is the actual source of truth; this
// is only what populates the <select> here.
export const INQUIRY_TOPICS = [
  'Account & Registration',
  'Venue Booking',
  'Tournament Registration',
  'Report a Problem',
  'Partnership / Organizer Access',
  'Other',
] as const

export type InquiryTopic = (typeof INQUIRY_TOPICS)[number]

export type PublicInquiryInput = {
  name?: string
  email: string
  topic: InquiryTopic
  message: string
}

export async function submitPublicInquiry(input: PublicInquiryInput) {
  const { data } = await api.post<{ message: string }>('/api/public-inquiries', input)
  return data
}

export type PublicInquiryRecord = {
  id: number
  name: string | null
  email: string
  topic: string
  message: string
  created_at: string
}

// Admin-only — see PublicInquiryController::index(). Read-only: the admin
// replies over real email, not from anywhere in the app.
export async function fetchPublicInquiries() {
  const { data } = await api.get<PublicInquiryRecord[]>('/api/admin/public-inquiries')
  return data
}

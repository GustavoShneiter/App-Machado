export type ProfessionalIdentity = { id: string; name: string; active: boolean; photo_url: string | null; email?: string }
export type ProfessionalAccess = { profile: ProfessionalIdentity; administrative: boolean; choices: ProfessionalIdentity[] }
export type ProfessionalCredential = { id: string; name: string; email: string; password?: string; link: string; reset?: boolean }
export type ProfessionalAccount = ProfessionalIdentity & { email: string | null; role: string | null; account_active: boolean; link: string }
export type Preferences = { weekly_commission_goal_cents: number; weekly_service_goal: number; weekly_customer_goal: number; visible_cards: string[] }
export type ProfessionalEntry = { id: string; commission_cents: number; status: 'pending' | 'paid'; created_at: string; paid_at: string | null; description: string; type: 'service' | 'product'; quantity: number; customer_name: string | null; occurred_at: string }
export type ProfessionalCashData = { from: string; to: string; earned: number; pending: number; paid: number; totalPending: number; services: number; customers: number; preferences: Preferences; entries: ProfessionalEntry[] }

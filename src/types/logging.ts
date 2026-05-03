export type AuditLogStatus = 'success' | 'failed' | 'denied'

export type AuditLogRow = {
  id: string
  created_at: string
  actor_user_id: string | null
  action: string
  entity_type: string
  entity_id: string | null
  event_id: string | null
  status: AuditLogStatus
  metadata: Record<string, unknown>
}

export type TechnicalLogLevel = 'info' | 'warn' | 'error'

export type TechnicalLogRow = {
  id: string
  created_at: string
  user_id: string | null
  source: string
  level: TechnicalLogLevel
  operation: string
  message: string
  context: Record<string, unknown>
  correlation_id: string | null
  event_id: string | null
}

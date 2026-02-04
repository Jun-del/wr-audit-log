/**
 * Type of database operation
 */
export type AuditAction = "INSERT" | "UPDATE" | "DELETE" | "READ" | (string & {}); // Allow custom actions

/**
 * Internal representation of an audit log entry (before storage)
 */
export interface AuditLog {
  action: AuditAction;
  tableName: string;
  recordId: string;
  values?: Record<string, unknown>;
  metadata?: Record<string, unknown>; // Add metadata to individual logs
}

/**
 * Complete audit log entry with context (for storage)
 */
export interface AuditLogEntry extends AuditLog {
  userId?: string;
  ipAddress?: string;
  userAgent?: string;
  metadata?: Record<string, unknown>;
  transactionId?: string;
  createdAt?: Date;
}

/**
 * Audit log as stored in database
 */
export interface StoredAuditLog {
  id: string;
  userId: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  action: AuditAction;
  tableName: string;
  recordId: string;
  values: Record<string, unknown> | null;
  metadata: Record<string, unknown> | null;
  transactionId: string | null;
  createdAt: Date;
  deletedAt: Date | null;
}

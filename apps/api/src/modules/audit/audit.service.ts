import type { Logger } from '../../lib/logger.js';
import type { Db } from '../../lib/prisma.js';
import { Prisma } from '../../generated/prisma/client.js';

/**
 * Audit actions are a fixed list, not free text, so they can be searched and
 * counted reliably ("how many failed logins yesterday?").
 */
export type AuditAction =
  | 'auth.register'
  | 'auth.login.success'
  | 'auth.login.failure'
  | 'auth.logout'
  | 'auth.logout_all'
  | 'github.link'
  | 'github.installation.rejected'
  | 'repository.connect'
  | 'repository.disconnect'
  | 'suggestion.start_review'
  | 'suggestion.edit'
  | 'suggestion.request_changes'
  | 'suggestion.approve'
  | 'suggestion.reject'
  | 'suggestion.reopen'
  | 'docs_pr.create';

export interface AuditEvent {
  action: AuditAction;
  actorId: string | null;
  entityType: string;
  entityId: string;
  /** Small, non-secret context. Never passwords, tokens or request bodies. */
  metadata?: Record<string, string | number | boolean | null>;
}

export function createAuditService({ db, logger }: { db: Db; logger: Logger }) {
  return {
    /**
     * Best-effort: if writing the audit row fails, the user's request still
     * succeeds and the failure is logged loudly. For this project that is the
     * right trade-off (availability over a complete trail); a bank would do
     * the opposite and fail the request.
     */
    async record(event: AuditEvent) {
      try {
        await db.auditLog.create({
          data: {
            action: event.action,
            actorId: event.actorId,
            entityType: event.entityType,
            entityId: event.entityId,
            metadata: event.metadata ?? Prisma.JsonNull,
          },
        });
      } catch (err) {
        logger.error({ err, action: event.action }, 'Failed to write audit log');
      }
    },
  };
}

export type AuditService = ReturnType<typeof createAuditService>;

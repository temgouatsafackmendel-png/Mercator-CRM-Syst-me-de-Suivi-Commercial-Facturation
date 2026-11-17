/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Service d'historique d'activité et journal d'audit immuable (Append-Only Audit Trail)
 */

import crypto from 'crypto';
import { getDb } from '../db.ts';
import { ActivityLog, User } from '../../types/domain.ts';

export function recordActivity(params: {
  actor: User;
  entityType: ActivityLog['entityType'];
  entityId: string;
  entityLabel: string;
  action: string;
  summary: string;
  details?: Record<string, unknown>;
}): ActivityLog {
  const db = getDb();
  const id = `act-${crypto.randomUUID().slice(0, 8)}`;
  const createdAt = new Date().toISOString();
  const detailsJson = JSON.stringify(params.details || {});

  db.prepare(`
    INSERT INTO activity_logs (
      id, entity_type, entity_id, entity_label, action, summary,
      details_json, actor_id, actor_name, actor_role, created_at
    ) VALUES (
      @id, @entityType, @entityId, @entityLabel, @action, @summary,
      @detailsJson, @actorId, @actorName, @actorRole, @createdAt
    )
  `).run({
    id,
    entityType: params.entityType,
    entityId: params.entityId,
    entityLabel: params.entityLabel,
    action: params.action,
    summary: params.summary,
    detailsJson,
    actorId: params.actor.id,
    actorName: params.actor.name,
    actorRole: params.actor.role,
    createdAt,
  });

  return {
    id,
    entityType: params.entityType,
    entityId: params.entityId,
    entityLabel: params.entityLabel,
    action: params.action,
    summary: params.summary,
    detailsJson,
    actorId: params.actor.id,
    actorName: params.actor.name,
    actorRole: params.actor.role,
    createdAt,
  };
}

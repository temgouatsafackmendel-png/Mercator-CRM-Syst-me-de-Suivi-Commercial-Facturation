/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Middlewares de sécurité, d'authentification et de contrôle d'accès par rôles (RBAC)
 * - Principe du moindre privilège
 * - Limitation de débit (Rate Limiting) globale et dédiée aux exports
 * - En-têtes HTTP de sécurité (CSP, X-Content-Type-Options, Referrer-Policy)
 */

import { NextFunction, Request, Response } from 'express';
import { getDb } from '../db.ts';
import { Role, User } from '../../types/domain.ts';

export interface AuthenticatedRequest extends Request {
  actor?: User;
}

interface RateLimitBucket {
  count: number;
  resetAt: number;
}

const generalBuckets = new Map<string, RateLimitBucket>();
const exportBuckets = new Map<string, RateLimitBucket>();

export function securityHeadersMiddleware(_req: Request, res: Response, next: NextFunction): void {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('X-XSS-Protection', '0');
  next();
}

export function createRateLimiter(type: 'general' | 'export') {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (process.env.NODE_ENV === 'test' && req.headers['x-enforce-ratelimit'] !== 'true') {
      next();
      return;
    }

    const windowMs = 15 * 60 * 1000;
    const maxRequests =
      type === 'export'
        ? Number(process.env.RATE_LIMIT_EXPORT_MAX || 20)
        : Number(process.env.RATE_LIMIT_MAX_REQUESTS || 300);

    const store = type === 'export' ? exportBuckets : generalBuckets;
    const actorHeader = String(req.headers['x-actor-id'] || req.ip || 'anonymous');
    const key = `${type}:${actorHeader}`;
    const now = Date.now();

    const current = store.get(key);
    if (!current || current.resetAt <= now) {
      store.set(key, { count: 1, resetAt: now + windowMs });
      next();
      return;
    }

    if (current.count >= maxRequests) {
      res.status(429).json({
        error: 'Trop de requêtes effectuées sur cet endpoint. Veuillez patienter avant de réessayer.',
        code: 'RATE_LIMIT_EXCEEDED',
      });
      return;
    }

    current.count += 1;
    next();
  };
}

export function authContextMiddleware(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  try {
    const db = getDb();
    const requestedActorId = String(req.headers['x-actor-id'] || 'usr-admin').trim();

    const userRow = db
      .prepare('SELECT id, name, email, role, title, active FROM users WHERE id = ?')
      .get(requestedActorId) as
      | { id: string; name: string; email: string; role: Role; title: string; active: number }
      | undefined;

    if (!userRow || !userRow.active) {
      res.status(401).json({
        error: 'Utilisateur non reconnu ou compte désactivé.',
        code: 'UNAUTHORIZED_ACTOR',
      });
      return;
    }

    req.actor = {
      id: userRow.id,
      name: userRow.name,
      email: userRow.email,
      role: userRow.role,
      title: userRow.title,
      active: Boolean(userRow.active),
    };
    next();
  } catch (error) {
    console.error('Erreur dans authContextMiddleware:', error);
    res.status(500).json({ error: "Erreur interne lors de la vérification d'identité." });
  }
}

export function requireRoles(...allowedRoles: Role[]) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    const actor = req.actor;
    if (!actor) {
      res.status(401).json({ error: 'Authentification requise.', code: 'UNAUTHENTICATED' });
      return;
    }

    if (!allowedRoles.includes(actor.role)) {
      res.status(403).json({
        error: `Accès refusé : cette opération nécessite l'un des rôles suivants (${allowedRoles.join(', ')}). Votre rôle actuel est ${actor.role}.`,
        code: 'FORBIDDEN_ROLE',
      });
      return;
    }

    next();
  };
}

export function canAccessRecord(actor: User, recordOwnerId: string, mode: 'read' | 'write' | 'delete'): boolean {
  if (actor.role === Role.ADMIN) {
    return true;
  }
  if (actor.role === Role.MANAGER) {
    if (mode === 'delete') {
      // Seul ADMIN peut supprimer définitivement un enregistrement critique
      return false;
    }
    return true;
  }
  // Rôle SALES : lecture sur le référentiel partagé, écriture uniquement sur ses propres dossiers
  if (mode === 'read') {
    return true;
  }
  if (mode === 'write') {
    return actor.id === recordOwnerId;
  }
  return false;
}

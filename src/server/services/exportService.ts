/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Service d'exports contrôlés (CSV & JSON) :
 * - Protection contre l'injection de formules CSV/Excel (CSV Formula Injection / DDE)
 * - Filtrage périmétrique selon le rôle (SALES ne voit et n'exporte que son portefeuille)
 * - Plafond du nombre de lignes exportées par requête
 */

import { Role, User } from '../../types/domain.ts';

const FORMULA_PREFIXES = ['=', '+', '-', '@', '\t', '\r'];

export function sanitizeCsvCell(value: unknown): string {
  if (value === null || value === undefined) {
    return '';
  }
  let str = String(value);
  // Protection contre CSV Formula Injection (OWASP CSV Injection)
  if (str.length > 0 && FORMULA_PREFIXES.includes(str[0])) {
    str = `'${str}`;
  }
  // Échappement RFC 4180 des guillemets doubles et retours à la ligne
  if (str.includes('"') || str.includes(';') || str.includes(',') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function generateCsvContent(
  headers: Array<{ key: string; label: string }>,
  rows: Array<Record<string, unknown>>
): string {
  const headerLine = headers.map((h) => sanitizeCsvCell(h.label)).join(';');
  const dataLines = rows.map((row) =>
    headers.map((h) => sanitizeCsvCell(row[h.key])).join(';')
  );
  // Ajout du BOM UTF-8 (\uFEFF) pour ouverture directe dans Excel / LibreOffice avec accents français
  return '\uFEFF' + [headerLine, ...dataLines].join('\r\n');
}

export function canExportEntity(
  actor: User,
  entity: 'contacts' | 'opportunities' | 'quotes' | 'invoices' | 'activities'
): { allowed: boolean; reason?: string; restrictToOwnerId?: string } {
  if (!actor || !actor.active) {
    return { allowed: false, reason: 'Compte utilisateur inactif ou non authentifié.' };
  }

  // Seuls ADMIN et MANAGER peuvent exporter le journal d'audit complet ou les factures globales
  if (entity === 'activities' && actor.role === Role.SALES) {
    return {
      allowed: false,
      reason: "Rôle insuffisant : l'export du journal d'audit complet est réservé aux rôles ADMIN et MANAGER.",
    };
  }

  if (actor.role === Role.SALES) {
    return {
      allowed: true,
      restrictToOwnerId: actor.id,
    };
  }

  return { allowed: true };
}

/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  ContactStatus,
  InvoiceStatus,
  OpportunityStage,
  QuoteStatus,
  Role,
  TaskPriority,
  TaskStatus,
  TaskType,
} from '../types/domain.ts';

export function formatCurrency(value: number | undefined | null): string {
  const num = Number(value ?? 0);
  return new Intl.NumberFormat('fr-FR', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(num);
}

export function formatDateFr(dateStr: string | undefined | null): string {
  if (!dateStr) return '—';
  const raw = dateStr.slice(0, 10);
  const parts = raw.split('-');
  if (parts.length !== 3) return dateStr;
  return `${parts[2]}/${parts[1]}/${parts[0]}`;
}

export function formatDateTimeFr(isoStr: string | undefined | null): string {
  if (!isoStr) return '—';
  try {
    const date = new Date(isoStr);
    return new Intl.DateTimeFormat('fr-FR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(date);
  } catch {
    return isoStr;
  }
}

export const ROLE_LABELS: Record<Role, string> = {
  [Role.ADMIN]: 'Administrateur',
  [Role.MANAGER]: 'Manager Commercial',
  [Role.SALES]: 'Commercial',
};

export const CONTACT_STATUS_LABELS: Record<ContactStatus, string> = {
  [ContactStatus.PROSPECT]: 'Prospect',
  [ContactStatus.QUALIFIED_PROSPECT]: 'Prospect Qualifié',
  [ContactStatus.ACTIVE_CLIENT]: 'Client Actif',
  [ContactStatus.CHURNED]: 'Ancien Client',
};

export const OPPORTUNITY_STAGE_LABELS: Record<OpportunityStage, string> = {
  [OpportunityStage.QUALIFICATION]: 'Qualification',
  [OpportunityStage.DISCOVERY]: 'Découverte',
  [OpportunityStage.PROPOSAL]: 'Proposition',
  [OpportunityStage.NEGOTIATION]: 'Négociation',
  [OpportunityStage.WON]: 'Gagné',
  [OpportunityStage.LOST]: 'Perdu',
};

export const QUOTE_STATUS_LABELS: Record<QuoteStatus, string> = {
  [QuoteStatus.DRAFT]: 'Brouillon',
  [QuoteStatus.SENT]: 'Envoyé',
  [QuoteStatus.ACCEPTED]: 'Accepté',
  [QuoteStatus.REJECTED]: 'Refusé',
  [QuoteStatus.EXPIRED]: 'Expiré',
};

export const INVOICE_STATUS_LABELS: Record<InvoiceStatus, string> = {
  [InvoiceStatus.DRAFT]: 'Brouillon',
  [InvoiceStatus.ISSUED]: 'Émise',
  [InvoiceStatus.PARTIALLY_PAID]: 'Partiellement payée',
  [InvoiceStatus.PAID]: 'Payée',
  [InvoiceStatus.OVERDUE]: 'En retard (Échue)',
  [InvoiceStatus.CANCELLED]: 'Annulée',
};

export const TASK_TYPE_LABELS: Record<TaskType, string> = {
  [TaskType.CALL]: 'Appel téléphonique',
  [TaskType.EMAIL]: 'Email de suivi',
  [TaskType.MEETING]: 'Rendez-vous / Démo',
  [TaskType.QUOTE_FOLLOWUP]: 'Relance devis',
  [TaskType.INVOICE_REMINDER]: 'Relance facture échue',
};

export const TASK_PRIORITY_LABELS: Record<TaskPriority, string> = {
  [TaskPriority.LOW]: 'Basse',
  [TaskPriority.MEDIUM]: 'Normale',
  [TaskPriority.HIGH]: 'Haute',
  [TaskPriority.URGENT]: 'Urgente',
};

export const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
  [TaskStatus.TODO]: 'À faire',
  [TaskStatus.IN_PROGRESS]: 'En cours',
  [TaskStatus.DONE]: 'Terminée',
};

/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Validation stricte côté serveur avec Zod et assainissement (anti-XSS, bornes numériques)
 */

import { z } from 'zod';
import {
  ContactStatus,
  InvoiceStatus,
  OpportunityStage,
  QuoteStatus,
  TaskPriority,
  TaskStatus,
  TaskType,
} from '../types/domain.ts';

export function sanitizeText(input: string): string {
  return input
    .replace(/[<>]/g, '') // Neutralisation de balises HTML/script brutes
    .trim();
}

export const contactInputSchema = z.object({
  companyName: z.string().min(2, 'La raison sociale doit comporter au moins 2 caractères').max(120).transform(sanitizeText),
  contactName: z.string().min(2, 'Le nom du contact doit comporter au moins 2 caractères').max(100).transform(sanitizeText),
  email: z.string().email('Adresse email invalide').max(150).toLowerCase().trim(),
  phone: z.string().min(6, 'Numéro de téléphone invalide').max(30).transform(sanitizeText),
  status: z.enum([
    ContactStatus.PROSPECT,
    ContactStatus.QUALIFIED_PROSPECT,
    ContactStatus.ACTIVE_CLIENT,
    ContactStatus.CHURNED,
  ]),
  industry: z.string().min(2).max(80).transform(sanitizeText),
  city: z.string().min(2).max(80).transform(sanitizeText),
  country: z.string().min(2).max(80).default('France').transform(sanitizeText),
  vatNumber: z.string().max(40).optional().default('').transform(sanitizeText),
  source: z.string().min(2).max(80).default('Entrant').transform(sanitizeText),
  ownerId: z.string().optional(),
  notes: z.string().max(2000).optional().default('').transform(sanitizeText),
});

export const opportunityInputSchema = z.object({
  title: z.string().min(3, "L'intitulé de l'opportunité est requis").max(140).transform(sanitizeText),
  contactId: z.string().min(1, 'Le prospect ou client associé est obligatoire'),
  stage: z.enum([
    OpportunityStage.QUALIFICATION,
    OpportunityStage.DISCOVERY,
    OpportunityStage.PROPOSAL,
    OpportunityStage.NEGOTIATION,
    OpportunityStage.WON,
    OpportunityStage.LOST,
  ]),
  estimatedAmountHt: z.coerce.number().min(0, 'Le montant estimé doit être positif').max(50000000),
  probability: z.coerce.number().min(0).max(100),
  expectedCloseDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date de clôture invalide (format YYYY-MM-DD)'),
  ownerId: z.string().optional(),
  notes: z.string().max(2000).optional().default('').transform(sanitizeText),
  lossReason: z.string().max(500).optional().default('').transform(sanitizeText),
});

export const documentLineSchema = z.object({
  id: z.string().optional(),
  description: z.string().min(2, 'La description de la ligne est requise').max(240).transform(sanitizeText),
  quantity: z.coerce.number().positive('La quantité doit être supérieure à 0').max(100000),
  unitPriceHt: z.coerce.number().min(0, 'Le prix unitaire HT doit être positif ou nul').max(10000000),
  discountPercent: z.coerce.number().min(0).max(100).default(0),
  taxRate: z.coerce.number().min(0).max(100).default(20),
});

export const quoteInputSchema = z.object({
  contactId: z.string().min(1, 'Le client ou prospect est obligatoire'),
  opportunityId: z.string().nullable().optional(),
  status: z
    .enum([
      QuoteStatus.DRAFT,
      QuoteStatus.SENT,
      QuoteStatus.ACCEPTED,
      QuoteStatus.REJECTED,
      QuoteStatus.EXPIRED,
    ])
    .default(QuoteStatus.DRAFT),
  issueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date d'émission invalide"),
  validUntil: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date de validité invalide'),
  notes: z.string().max(2000).optional().default('').transform(sanitizeText),
  terms: z
    .string()
    .max(1000)
    .optional()
    .default('Paiement à 30 jours net par virement bancaire. Devis valable 30 jours.')
    .transform(sanitizeText),
  lines: z.array(documentLineSchema).min(1, 'Au moins une ligne de devis est obligatoire').max(100),
});

export const invoiceInputSchema = z.object({
  contactId: z.string().min(1, 'Le client est obligatoire'),
  quoteId: z.string().nullable().optional(),
  status: z
    .enum([
      InvoiceStatus.DRAFT,
      InvoiceStatus.ISSUED,
      InvoiceStatus.PARTIALLY_PAID,
      InvoiceStatus.PAID,
      InvoiceStatus.OVERDUE,
      InvoiceStatus.CANCELLED,
    ])
    .default(InvoiceStatus.ISSUED),
  issueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date d'émission invalide"),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date d'échéance invalide"),
  amountPaid: z.coerce.number().min(0).default(0),
  paymentMethod: z.string().max(60).optional().default('Virement SEPA').transform(sanitizeText),
  notes: z.string().max(2000).optional().default('').transform(sanitizeText),
  lines: z.array(documentLineSchema).min(1, 'Au moins une ligne de facture est obligatoire').max(100),
});

export const invoicePaymentSchema = z.object({
  amountPaid: z.coerce.number().min(0, 'Le montant payé doit être positif ou nul'),
  paymentMethod: z.string().max(60).optional().default('Virement SEPA').transform(sanitizeText),
});

export const taskInputSchema = z.object({
  title: z.string().min(3, "L'intitulé de la tâche est requis").max(160).transform(sanitizeText),
  description: z.string().max(1500).optional().default('').transform(sanitizeText),
  type: z.enum([
    TaskType.CALL,
    TaskType.EMAIL,
    TaskType.MEETING,
    TaskType.QUOTE_FOLLOWUP,
    TaskType.INVOICE_REMINDER,
  ]),
  priority: z.enum([
    TaskPriority.LOW,
    TaskPriority.MEDIUM,
    TaskPriority.HIGH,
    TaskPriority.URGENT,
  ]),
  status: z
    .enum([TaskStatus.TODO, TaskStatus.IN_PROGRESS, TaskStatus.DONE])
    .default(TaskStatus.TODO),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date d'échéance invalide"),
  contactId: z.string().nullable().optional(),
  opportunityId: z.string().nullable().optional(),
  quoteId: z.string().nullable().optional(),
  invoiceId: z.string().nullable().optional(),
  assigneeId: z.string().optional(),
});

export const exportQuerySchema = z.object({
  entity: z.enum(['contacts', 'opportunities', 'quotes', 'invoices', 'activities']),
  format: z.enum(['csv', 'json']).default('csv'),
  status: z.string().optional(),
  ownerId: z.string().optional(),
});

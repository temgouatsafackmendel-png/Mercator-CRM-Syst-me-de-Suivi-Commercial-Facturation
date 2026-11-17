/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Modèles de données stricts et contrats partagés Client / Serveur
 */

export enum Role {
  ADMIN = 'ADMIN',
  MANAGER = 'MANAGER',
  SALES = 'SALES',
}

export enum ContactStatus {
  PROSPECT = 'PROSPECT',
  QUALIFIED_PROSPECT = 'QUALIFIED_PROSPECT',
  ACTIVE_CLIENT = 'ACTIVE_CLIENT',
  CHURNED = 'CHURNED',
}

export enum OpportunityStage {
  QUALIFICATION = 'QUALIFICATION',
  DISCOVERY = 'DISCOVERY',
  PROPOSAL = 'PROPOSAL',
  NEGOTIATION = 'NEGOTIATION',
  WON = 'WON',
  LOST = 'LOST',
}

export enum QuoteStatus {
  DRAFT = 'DRAFT',
  SENT = 'SENT',
  ACCEPTED = 'ACCEPTED',
  REJECTED = 'REJECTED',
  EXPIRED = 'EXPIRED',
}

export enum InvoiceStatus {
  DRAFT = 'DRAFT',
  ISSUED = 'ISSUED',
  PARTIALLY_PAID = 'PARTIALLY_PAID',
  PAID = 'PAID',
  OVERDUE = 'OVERDUE',
  CANCELLED = 'CANCELLED',
}

export enum TaskStatus {
  TODO = 'TODO',
  IN_PROGRESS = 'IN_PROGRESS',
  DONE = 'DONE',
}

export enum TaskPriority {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
  URGENT = 'URGENT',
}

export enum TaskType {
  CALL = 'CALL',
  EMAIL = 'EMAIL',
  MEETING = 'MEETING',
  QUOTE_FOLLOWUP = 'QUOTE_FOLLOWUP',
  INVOICE_REMINDER = 'INVOICE_REMINDER',
}

export interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
  title: string;
  active: boolean;
}

export interface Contact {
  id: string;
  companyName: string;
  contactName: string;
  email: string;
  phone: string;
  status: ContactStatus;
  industry: string;
  city: string;
  country: string;
  vatNumber: string;
  source: string;
  ownerId: string;
  ownerName?: string;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

export interface Opportunity {
  id: string;
  title: string;
  contactId: string;
  companyName?: string;
  contactName?: string;
  stage: OpportunityStage;
  estimatedAmountHt: number;
  probability: number;
  weightedAmountHt: number; // Calculé serveur : estimatedAmountHt * (probability / 100)
  expectedCloseDate: string;
  ownerId: string;
  ownerName?: string;
  notes: string;
  lossReason?: string;
  createdAt: string;
  updatedAt: string;
}

export interface DocumentLineItem {
  id?: string;
  description: string;
  quantity: number;
  unitPriceHt: number;
  discountPercent: number;
  taxRate: number;
  // Champs calculés exclusivement par le serveur :
  lineSubtotalHt?: number;
  lineDiscountHt?: number;
  lineNetHt?: number;
  lineTaxAmount?: number;
  lineTotalTtc?: number;
}

export interface CalculatedDocumentTotals {
  lines: Required<DocumentLineItem>[];
  subtotalHt: number;
  totalDiscountHt: number;
  netHt: number;
  totalTaxAmount: number;
  totalTtc: number;
  taxBreakdown: Record<string, { baseHt: number; taxAmount: number }>;
}

export interface Quote {
  id: string;
  reference: string;
  contactId: string;
  companyName?: string;
  contactName?: string;
  opportunityId?: string | null;
  opportunityTitle?: string | null;
  status: QuoteStatus;
  issueDate: string;
  validUntil: string;
  subtotalHt: number;
  totalDiscountHt: number;
  netHt: number;
  totalTaxAmount: number;
  totalTtc: number;
  notes: string;
  terms: string;
  ownerId: string;
  ownerName?: string;
  convertedInvoiceId?: string | null;
  lines: Required<DocumentLineItem>[];
  createdAt: string;
  updatedAt: string;
}

export interface Invoice {
  id: string;
  reference: string;
  quoteId?: string | null;
  quoteReference?: string | null;
  contactId: string;
  companyName?: string;
  contactName?: string;
  status: InvoiceStatus;
  issueDate: string;
  dueDate: string;
  paidAt?: string | null;
  subtotalHt: number;
  totalDiscountHt: number;
  netHt: number;
  totalTaxAmount: number;
  totalTtc: number;
  amountPaid: number;
  balanceDue: number; // Calculé serveur : totalTtc - amountPaid
  isOverdue: boolean; // Calculé serveur
  paymentMethod?: string;
  notes: string;
  ownerId: string;
  ownerName?: string;
  lines: Required<DocumentLineItem>[];
  createdAt: string;
  updatedAt: string;
}

export interface FollowUpTask {
  id: string;
  title: string;
  description: string;
  type: TaskType;
  priority: TaskPriority;
  status: TaskStatus;
  dueDate: string;
  completedAt?: string | null;
  isOverdue?: boolean; // Calculé serveur
  contactId?: string | null;
  companyName?: string | null;
  opportunityId?: string | null;
  opportunityTitle?: string | null;
  quoteId?: string | null;
  invoiceId?: string | null;
  assigneeId: string;
  assigneeName?: string;
  createdById: string;
  createdAt: string;
  updatedAt: string;
}

export interface ActivityLog {
  id: string;
  entityType: 'CONTACT' | 'OPPORTUNITY' | 'QUOTE' | 'INVOICE' | 'TASK' | 'EXPORT' | 'AUTH';
  entityId: string;
  entityLabel: string;
  action: string;
  summary: string;
  detailsJson: string;
  actorId: string;
  actorName: string;
  actorRole: Role;
  createdAt: string;
}

export interface DashboardSummary {
  kpis: {
    prospectsCount: number;
    qualifiedProspectsCount: number;
    activeClientsCount: number;
    conversionRatePercent: number;
    openPipelineHt: number;
    weightedPipelineHt: number;
    wonOpportunitiesHt: number;
    quotesAcceptedRatePercent: number;
    invoicedTotalHt: number;
    invoicedTotalTtc: number;
    collectedTotalTtc: number;
    outstandingBalanceTtc: number;
    overdueInvoicesTtc: number;
    overdueInvoicesCount: number;
    pendingTasksCount: number;
    overdueTasksCount: number;
  };
  pipelineByStage: Array<{
    stage: OpportunityStage;
    label: string;
    count: number;
    totalHt: number;
    weightedHt: number;
  }>;
  revenueByMonth: Array<{
    month: string;
    invoicedHt: number;
    collectedTtc: number;
    quotesHt: number;
  }>;
  urgentTasks: FollowUpTask[];
  recentActivities: ActivityLog[];
}

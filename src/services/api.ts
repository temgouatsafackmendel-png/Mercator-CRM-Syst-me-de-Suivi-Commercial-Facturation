/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Client HTTP typé pour communiquer avec l'API Express (/api/*)
 * Transmet systématiquement l'identifiant du profil actif (`x-actor-id`) pour le contrôle RBAC et l'audit.
 */

import {
  ActivityLog,
  CalculatedDocumentTotals,
  Contact,
  DashboardSummary,
  DocumentLineItem,
  FollowUpTask,
  Invoice,
  Opportunity,
  OpportunityStage,
  Quote,
  QuoteStatus,
  TaskStatus,
  User,
} from '../types/domain.ts';

let currentActorId = 'usr-admin';

export function setApiActorId(actorId: string): void {
  currentActorId = actorId;
}

export function getApiActorId(): string {
  return currentActorId;
}

async function requestJson<T>(url: string, options: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'x-actor-id': currentActorId,
    ...(options.headers as Record<string, string> | undefined),
  };

  const response = await fetch(url, {
    ...options,
    headers,
  });

  if (!response.ok) {
    let errorMessage = `Erreur HTTP ${response.status}`;
    try {
      const errBody = await response.json();
      if (errBody.error) {
        errorMessage = errBody.details?.length
          ? `${errBody.error} (${errBody.details.join(', ')})`
          : errBody.error;
      }
    } catch {
      // ignore JSON parse error
    }
    throw new Error(errorMessage);
  }

  return response.json() as Promise<T>;
}

export const api = {
  getUsers(): Promise<{ currentUser: User; users: User[] }> {
    return requestJson('/api/users');
  },

  getDashboard(scope: 'all' | 'mine' = 'all'): Promise<DashboardSummary> {
    return requestJson(`/api/dashboard?scope=${scope}`);
  },

  getContacts(params?: { status?: string; search?: string; ownerId?: string }): Promise<Contact[]> {
    const query = new URLSearchParams();
    if (params?.status) query.set('status', params.status);
    if (params?.search) query.set('search', params.search);
    if (params?.ownerId) query.set('ownerId', params.ownerId);
    return requestJson(`/api/contacts?${query.toString()}`);
  },

  createContact(payload: Partial<Contact>): Promise<Contact> {
    return requestJson('/api/contacts', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  updateContact(id: string, payload: Partial<Contact>): Promise<Contact> {
    return requestJson(`/api/contacts/${id}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
  },

  deleteContact(id: string): Promise<{ deleted: boolean; id: string }> {
    return requestJson(`/api/contacts/${id}`, {
      method: 'DELETE',
    });
  },

  getOpportunities(params?: { stage?: string; contactId?: string }): Promise<Opportunity[]> {
    const query = new URLSearchParams();
    if (params?.stage) query.set('stage', params.stage);
    if (params?.contactId) query.set('contactId', params.contactId);
    return requestJson(`/api/opportunities?${query.toString()}`);
  },

  createOpportunity(payload: Partial<Opportunity>): Promise<Opportunity> {
    return requestJson('/api/opportunities', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  updateOpportunityStage(
    id: string,
    payload: { stage: OpportunityStage; probability?: number; lossReason?: string }
  ): Promise<Opportunity> {
    return requestJson(`/api/opportunities/${id}/stage`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });
  },

  getQuotes(): Promise<Quote[]> {
    return requestJson('/api/quotes');
  },

  previewDocumentTotals(lines: DocumentLineItem[]): Promise<CalculatedDocumentTotals> {
    return requestJson('/api/calculations/preview', {
      method: 'POST',
      body: JSON.stringify({ lines }),
    });
  },

  createQuote(payload: {
    contactId: string;
    opportunityId?: string | null;
    status: QuoteStatus;
    issueDate: string;
    validUntil: string;
    notes: string;
    terms: string;
    lines: DocumentLineItem[];
  }): Promise<Quote> {
    return requestJson('/api/quotes', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  updateQuoteStatus(id: string, status: QuoteStatus): Promise<Quote> {
    return requestJson(`/api/quotes/${id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    });
  },

  convertQuoteToInvoice(id: string): Promise<Invoice> {
    return requestJson(`/api/quotes/${id}/convert-to-invoice`, {
      method: 'POST',
    });
  },

  getInvoices(): Promise<Invoice[]> {
    return requestJson('/api/invoices');
  },

  createInvoice(payload: {
    contactId: string;
    quoteId?: string | null;
    issueDate: string;
    dueDate: string;
    amountPaid?: number;
    paymentMethod?: string;
    notes: string;
    lines: DocumentLineItem[];
  }): Promise<Invoice> {
    return requestJson('/api/invoices', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  recordInvoicePayment(
    id: string,
    payload: { amountPaid: number; paymentMethod: string }
  ): Promise<Invoice> {
    return requestJson(`/api/invoices/${id}/payments`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  getTasks(): Promise<FollowUpTask[]> {
    return requestJson('/api/tasks');
  },

  createTask(payload: Partial<FollowUpTask>): Promise<FollowUpTask> {
    return requestJson('/api/tasks', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  updateTaskStatus(id: string, status: TaskStatus): Promise<{ id: string; status: TaskStatus }> {
    return requestJson(`/api/tasks/${id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    });
  },

  getActivities(entityType?: string): Promise<ActivityLog[]> {
    const q = entityType && entityType !== 'ALL' ? `?entityType=${entityType}` : '';
    return requestJson(`/api/activities${q}`);
  },

  async downloadExport(
    entity: 'contacts' | 'opportunities' | 'quotes' | 'invoices' | 'activities',
    format: 'csv' | 'json'
  ): Promise<{ filename: string; content: string; mimeType: string }> {
    const response = await fetch(`/api/export?entity=${entity}&format=${format}`, {
      headers: {
        'x-actor-id': currentActorId,
      },
    });

    if (!response.ok) {
      let errorMessage = `Erreur HTTP ${response.status}`;
      try {
        const errBody = await response.json();
        if (errBody.error) errorMessage = errBody.error;
      } catch {
        // ignore
      }
      throw new Error(errorMessage);
    }

    const content = await response.text();
    const disposition = response.headers.get('Content-Disposition') || '';
    const match = disposition.match(/filename="([^"]+)"/);
    const filename = match ? match[1] : `mercator-export-${entity}.${format}`;
    const mimeType =
      format === 'json' ? 'application/json;charset=utf-8' : 'text/csv;charset=utf-8';

    return { filename, content, mimeType };
  },
};

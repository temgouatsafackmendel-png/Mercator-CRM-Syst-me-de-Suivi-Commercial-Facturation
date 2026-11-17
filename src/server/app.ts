/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Application Express Full-Stack (Routeurs API REST + Contrôles RBAC + Calculs Serveur + Audit)
 */

import crypto from 'crypto';
import express, { Request, Response } from 'express';
import { getDb } from './db.ts';
import {
  AuthenticatedRequest,
  authContextMiddleware,
  canAccessRecord,
  createRateLimiter,
  requireRoles,
  securityHeadersMiddleware,
} from './middleware/security.ts';
import { recordActivity } from './services/auditService.ts';
import {
  calculateDocumentTotals,
  calculateInvoiceBalance,
  calculateWeightedOpportunityAmount,
  roundCurrency,
} from './services/calculations.ts';
import { canExportEntity, generateCsvContent } from './services/exportService.ts';
import {
  contactInputSchema,
  exportQuerySchema,
  invoiceInputSchema,
  invoicePaymentSchema,
  opportunityInputSchema,
  quoteInputSchema,
  taskInputSchema,
} from './validators.ts';
import {
  Contact,
  ContactStatus,
  DashboardSummary,
  DocumentLineItem,
  FollowUpTask,
  Invoice,
  InvoiceStatus,
  Opportunity,
  OpportunityStage,
  Quote,
  QuoteStatus,
  Role,
  TaskStatus,
} from '../types/domain.ts';

const STAGE_LABELS: Record<OpportunityStage, string> = {
  [OpportunityStage.QUALIFICATION]: '1. Qualification',
  [OpportunityStage.DISCOVERY]: '2. Découverte',
  [OpportunityStage.PROPOSAL]: '3. Proposition',
  [OpportunityStage.NEGOTIATION]: '4. Négociation',
  [OpportunityStage.WON]: '5. Gagné',
  [OpportunityStage.LOST]: '6. Perdu',
};

export function createApiApp(): express.Express {
  const app = express();

  app.use(securityHeadersMiddleware);
  app.use(express.json({ limit: '250kb' }));

  // Endpoint de santé technique (sans données sensibles)
  app.get('/api/health', (_req: Request, res: Response) => {
    res.json({
      status: 'ok',
      service: 'mercator-crm-api',
      timestamp: new Date().toISOString(),
    });
  });

  // Tous les endpoints /api/* suivants passent par le rate limiter et le contexte d'authentification
  app.use('/api', createRateLimiter('general'), authContextMiddleware);

  // ---------------------------------------------------------------------------
  // 1. UTILISATEURS & SESSION / RÔLES
  // ---------------------------------------------------------------------------
  app.get('/api/users', (req: AuthenticatedRequest, res: Response) => {
    try {
      const db = getDb();
      const rows = db
        .prepare('SELECT id, name, email, role, title, active FROM users WHERE active = 1 ORDER BY name ASC')
        .all() as Array<{ id: string; name: string; email: string; role: Role; title: string; active: number }>;

      res.json({
        currentUser: req.actor,
        users: rows.map((u) => ({
          ...u,
          active: Boolean(u.active),
        })),
      });
    } catch (error) {
      console.error('Erreur GET /api/users:', error);
      res.status(500).json({ error: 'Impossible de charger les profils utilisateurs.' });
    }
  });

  // ---------------------------------------------------------------------------
  // 2. DASHBOARD EXÉCUTIF (Agrégations calculées côté serveur)
  // ---------------------------------------------------------------------------
  app.get('/api/dashboard', (req: AuthenticatedRequest, res: Response) => {
    try {
      const db = getDb();
      const actor = req.actor!;
      const todayIso = new Date().toISOString().slice(0, 10);

      // Filtrage optionnel par propriétaire (ou automatique si souhaité)
      const ownerFilter = req.query.scope === 'mine' ? actor.id : null;

      const contacts = db
        .prepare(
          ownerFilter
            ? 'SELECT status FROM contacts WHERE owner_id = ?'
            : 'SELECT status FROM contacts'
        )
        .all(...(ownerFilter ? [ownerFilter] : [])) as Array<{ status: ContactStatus }>;

      const prospectsCount = contacts.filter(
        (c) => c.status === ContactStatus.PROSPECT || c.status === ContactStatus.QUALIFIED_PROSPECT
      ).length;
      const qualifiedProspectsCount = contacts.filter(
        (c) => c.status === ContactStatus.QUALIFIED_PROSPECT
      ).length;
      const activeClientsCount = contacts.filter(
        (c) => c.status === ContactStatus.ACTIVE_CLIENT
      ).length;
      const totalCommercialContacts = prospectsCount + activeClientsCount;
      const conversionRatePercent =
        totalCommercialContacts > 0
          ? roundCurrency((activeClientsCount / totalCommercialContacts) * 100)
          : 0;

      const opportunities = db
        .prepare(
          ownerFilter
            ? 'SELECT stage, estimated_amount_ht as estimatedAmountHt, weighted_amount_ht as weightedAmountHt FROM opportunities WHERE owner_id = ?'
            : 'SELECT stage, estimated_amount_ht as estimatedAmountHt, weighted_amount_ht as weightedAmountHt FROM opportunities'
        )
        .all(...(ownerFilter ? [ownerFilter] : [])) as Array<{
        stage: OpportunityStage;
        estimatedAmountHt: number;
        weightedAmountHt: number;
      }>;

      const openStages = [
        OpportunityStage.QUALIFICATION,
        OpportunityStage.DISCOVERY,
        OpportunityStage.PROPOSAL,
        OpportunityStage.NEGOTIATION,
      ];

      const openPipelineHt = roundCurrency(
        opportunities
          .filter((o) => openStages.includes(o.stage))
          .reduce((acc, o) => acc + o.estimatedAmountHt, 0)
      );
      const weightedPipelineHt = roundCurrency(
        opportunities
          .filter((o) => openStages.includes(o.stage))
          .reduce((acc, o) => acc + o.weightedAmountHt, 0)
      );
      const wonOpportunitiesHt = roundCurrency(
        opportunities
          .filter((o) => o.stage === OpportunityStage.WON)
          .reduce((acc, o) => acc + o.estimatedAmountHt, 0)
      );

      const quotes = db
        .prepare(
          ownerFilter
            ? 'SELECT status, net_ht as netHt, issue_date as issueDate FROM quotes WHERE owner_id = ?'
            : 'SELECT status, net_ht as netHt, issue_date as issueDate FROM quotes'
        )
        .all(...(ownerFilter ? [ownerFilter] : [])) as Array<{
        status: QuoteStatus;
        netHt: number;
        issueDate: string;
      }>;

      const decidedQuotes = quotes.filter(
        (q) => q.status !== QuoteStatus.DRAFT
      );
      const acceptedQuotes = quotes.filter((q) => q.status === QuoteStatus.ACCEPTED);
      const quotesAcceptedRatePercent =
        decidedQuotes.length > 0
          ? roundCurrency((acceptedQuotes.length / decidedQuotes.length) * 100)
          : 0;

      const invoices = db
        .prepare(
          ownerFilter
            ? 'SELECT status, net_ht as netHt, total_ttc as totalTtc, amount_paid as amountPaid, balance_due as balanceDue, due_date as dueDate, issue_date as issueDate FROM invoices WHERE owner_id = ? AND status != ?'
            : 'SELECT status, net_ht as netHt, total_ttc as totalTtc, amount_paid as amountPaid, balance_due as balanceDue, due_date as dueDate, issue_date as issueDate FROM invoices WHERE status != ?'
        )
        .all(...(ownerFilter ? [ownerFilter, InvoiceStatus.CANCELLED] : [InvoiceStatus.CANCELLED])) as Array<{
        status: InvoiceStatus;
        netHt: number;
        totalTtc: number;
        amountPaid: number;
        balanceDue: number;
        dueDate: string;
        issueDate: string;
      }>;

      const activeInvoices = invoices.filter((i) => i.status !== InvoiceStatus.DRAFT);
      const invoicedTotalHt = roundCurrency(
        activeInvoices.reduce((acc, i) => acc + i.netHt, 0)
      );
      const invoicedTotalTtc = roundCurrency(
        activeInvoices.reduce((acc, i) => acc + i.totalTtc, 0)
      );
      const collectedTotalTtc = roundCurrency(
        activeInvoices.reduce((acc, i) => acc + i.amountPaid, 0)
      );
      const outstandingBalanceTtc = roundCurrency(
        activeInvoices.reduce((acc, i) => acc + i.balanceDue, 0)
      );

      const overdueInvoices = activeInvoices.filter(
        (i) => i.balanceDue > 0 && (i.status === InvoiceStatus.OVERDUE || i.dueDate < todayIso)
      );
      const overdueInvoicesTtc = roundCurrency(
        overdueInvoices.reduce((acc, i) => acc + i.balanceDue, 0)
      );

      const allStages: OpportunityStage[] = [
        OpportunityStage.QUALIFICATION,
        OpportunityStage.DISCOVERY,
        OpportunityStage.PROPOSAL,
        OpportunityStage.NEGOTIATION,
        OpportunityStage.WON,
        OpportunityStage.LOST,
      ];

      const pipelineByStage = allStages.map((stage) => {
        const items = opportunities.filter((o) => o.stage === stage);
        return {
          stage,
          label: STAGE_LABELS[stage],
          count: items.length,
          totalHt: roundCurrency(items.reduce((acc, o) => acc + o.estimatedAmountHt, 0)),
          weightedHt: roundCurrency(items.reduce((acc, o) => acc + o.weightedAmountHt, 0)),
        };
      });

      // Agrégation mensuelle sur les 4 derniers mois
      const months = ['2026-08', '2026-09', '2026-10', '2026-11'];
      const monthNames: Record<string, string> = {
        '2026-08': 'Août 2026',
        '2026-09': 'Sept. 2026',
        '2026-10': 'Oct. 2026',
        '2026-11': 'Nov. 2026',
      };

      const revenueByMonth = months.map((m) => {
        const monthInvoices = activeInvoices.filter((i) => i.issueDate.startsWith(m));
        const monthQuotes = quotes.filter((q) => q.issueDate.startsWith(m));
        return {
          month: monthNames[m] || m,
          invoicedHt: roundCurrency(monthInvoices.reduce((acc, i) => acc + i.netHt, 0)),
          collectedTtc: roundCurrency(monthInvoices.reduce((acc, i) => acc + i.amountPaid, 0)),
          quotesHt: roundCurrency(monthQuotes.reduce((acc, q) => acc + q.netHt, 0)),
        };
      });

      const taskRows = db
        .prepare(`
          SELECT
            t.id, t.title, t.description, t.type, t.priority, t.status,
            t.due_date as dueDate, t.completed_at as completedAt,
            t.contact_id as contactId, c.company_name as companyName,
            t.opportunity_id as opportunityId, o.title as opportunityTitle,
            t.quote_id as quoteId, t.invoice_id as invoiceId,
            t.assignee_id as assigneeId, u.name as assigneeName,
            t.created_by_id as createdById, t.created_at as createdAt, t.updated_at as updatedAt
          FROM follow_up_tasks t
          LEFT JOIN contacts c ON c.id = t.contact_id
          LEFT JOIN opportunities o ON o.id = t.opportunity_id
          LEFT JOIN users u ON u.id = t.assignee_id
          WHERE t.status != 'DONE'
          ORDER BY t.due_date ASC
        `)
        .all() as FollowUpTask[];

      const enrichedTasks = taskRows.map((t) => ({
        ...t,
        isOverdue: t.dueDate < todayIso,
      }));

      const pendingTasksCount = enrichedTasks.length;
      const overdueTasksCount = enrichedTasks.filter((t) => t.isOverdue).length;

      const recentActivities = db
        .prepare(`
          SELECT
            id, entity_type as entityType, entity_id as entityId,
            entity_label as entityLabel, action, summary,
            details_json as detailsJson, actor_id as actorId,
            actor_name as actorName, actor_role as actorRole,
            created_at as createdAt
          FROM activity_logs
          ORDER BY created_at DESC
          LIMIT 12
        `)
        .all() as DashboardSummary['recentActivities'];

      const summary: DashboardSummary = {
        kpis: {
          prospectsCount,
          qualifiedProspectsCount,
          activeClientsCount,
          conversionRatePercent,
          openPipelineHt,
          weightedPipelineHt,
          wonOpportunitiesHt,
          quotesAcceptedRatePercent,
          invoicedTotalHt,
          invoicedTotalTtc,
          collectedTotalTtc,
          outstandingBalanceTtc,
          overdueInvoicesTtc,
          overdueInvoicesCount: overdueInvoices.length,
          pendingTasksCount,
          overdueTasksCount,
        },
        pipelineByStage,
        revenueByMonth,
        urgentTasks: enrichedTasks.slice(0, 6),
        recentActivities,
      };

      res.json(summary);
    } catch (error) {
      console.error('Erreur GET /api/dashboard:', error);
      res.status(500).json({ error: 'Erreur lors du calcul des indicateurs du tableau de bord.' });
    }
  });

  // ---------------------------------------------------------------------------
  // 3. PROSPECTS & CLIENTS (CONTACTS)
  // ---------------------------------------------------------------------------
  app.get('/api/contacts', (req: AuthenticatedRequest, res: Response) => {
    try {
      const db = getDb();
      const { status, search, ownerId } = req.query;

      let sql = `
        SELECT
          c.id, c.company_name as companyName, c.contact_name as contactName,
          c.email, c.phone, c.status, c.industry, c.city, c.country,
          c.vat_number as vatNumber, c.source, c.owner_id as ownerId,
          u.name as ownerName, c.notes, c.created_at as createdAt, c.updated_at as updatedAt
        FROM contacts c
        LEFT JOIN users u ON u.id = c.owner_id
        WHERE 1=1
      `;
      const params: unknown[] = [];

      if (status && typeof status === 'string' && status !== 'ALL') {
        sql += ' AND c.status = ?';
        params.push(status);
      }
      if (ownerId && typeof ownerId === 'string' && ownerId !== 'ALL') {
        sql += ' AND c.owner_id = ?';
        params.push(ownerId);
      }
      if (search && typeof search === 'string' && search.trim() !== '') {
        const pattern = `%${search.trim()}%`;
        sql += ' AND (c.company_name LIKE ? OR c.contact_name LIKE ? OR c.email LIKE ? OR c.city LIKE ?)';
        params.push(pattern, pattern, pattern, pattern);
      }

      sql += ' ORDER BY c.updated_at DESC';

      const contacts = db.prepare(sql).all(...params) as Contact[];
      res.json(contacts);
    } catch (error) {
      console.error('Erreur GET /api/contacts:', error);
      res.status(500).json({ error: 'Impossible de récupérer la liste des prospects et clients.' });
    }
  });

  app.post('/api/contacts', (req: AuthenticatedRequest, res: Response) => {
    try {
      const parsed = contactInputSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({
          error: 'Données de fiche contact invalides.',
          details: parsed.error.issues.map((i) => i.message),
        });
        return;
      }

      const actor = req.actor!;
      const data = parsed.data;
      const db = getDb();
      const id = `cnt-${crypto.randomUUID().slice(0, 8)}`;
      const now = new Date().toISOString();
      const ownerId = data.ownerId || actor.id;

      db.prepare(`
        INSERT INTO contacts (
          id, company_name, contact_name, email, phone, status, industry,
          city, country, vat_number, source, owner_id, notes, created_at, updated_at
        ) VALUES (
          @id, @companyName, @contactName, @email, @phone, @status, @industry,
          @city, @country, @vatNumber, @source, @ownerId, @notes, @createdAt, @updatedAt
        )
      `).run({
        id,
        ...data,
        ownerId,
        createdAt: now,
        updatedAt: now,
      });

      recordActivity({
        actor,
        entityType: 'CONTACT',
        entityId: id,
        entityLabel: `${data.companyName} (${data.contactName})`,
        action: 'CONTACT_CREATED',
        summary: `Nouvelle fiche créée : ${data.companyName} avec le statut ${data.status}`,
        details: { status: data.status, city: data.city, industry: data.industry },
      });

      const created = db
        .prepare(`
          SELECT
            c.id, c.company_name as companyName, c.contact_name as contactName,
            c.email, c.phone, c.status, c.industry, c.city, c.country,
            c.vat_number as vatNumber, c.source, c.owner_id as ownerId,
            u.name as ownerName, c.notes, c.created_at as createdAt, c.updated_at as updatedAt
          FROM contacts c
          LEFT JOIN users u ON u.id = c.owner_id
          WHERE c.id = ?
        `)
        .get(id) as Contact;

      res.status(201).json(created);
    } catch (error) {
      console.error('Erreur POST /api/contacts:', error);
      res.status(500).json({ error: 'Erreur lors de la création de la fiche prospect/client.' });
    }
  });

  app.put('/api/contacts/:id', (req: AuthenticatedRequest, res: Response) => {
    try {
      const db = getDb();
      const actor = req.actor!;
      const contactId = req.params.id;

      const existing = db
        .prepare('SELECT id, company_name as companyName, status, owner_id as ownerId FROM contacts WHERE id = ?')
        .get(contactId) as { id: string; companyName: string; status: ContactStatus; ownerId: string } | undefined;

      if (!existing) {
        res.status(404).json({ error: 'Fiche prospect/client introuvable.' });
        return;
      }

      if (!canAccessRecord(actor, existing.ownerId, 'write')) {
        res.status(403).json({
          error: 'Accès refusé : un commercial ne peut modifier que les fiches dont il est responsable.',
          code: 'FORBIDDEN_OWNER',
        });
        return;
      }

      const parsed = contactInputSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({
          error: 'Données de mise à jour invalides.',
          details: parsed.error.issues.map((i) => i.message),
        });
        return;
      }

      const data = parsed.data;
      const now = new Date().toISOString();
      const ownerId =
        actor.role === Role.SALES ? existing.ownerId : data.ownerId || existing.ownerId;

      db.prepare(`
        UPDATE contacts SET
          company_name = @companyName,
          contact_name = @contactName,
          email = @email,
          phone = @phone,
          status = @status,
          industry = @industry,
          city = @city,
          country = @country,
          vat_number = @vatNumber,
          source = @source,
          owner_id = @ownerId,
          notes = @notes,
          updated_at = @updatedAt
        WHERE id = @id
      `).run({
        id: contactId,
        ...data,
        ownerId,
        updatedAt: now,
      });

      const statusChanged = existing.status !== data.status;
      recordActivity({
        actor,
        entityType: 'CONTACT',
        entityId: contactId,
        entityLabel: `${data.companyName} (${data.contactName})`,
        action: statusChanged ? 'CONTACT_STATUS_CHANGED' : 'CONTACT_UPDATED',
        summary: statusChanged
          ? `Statut de ${data.companyName} modifié : ${existing.status} → ${data.status}`
          : `Fiche ${data.companyName} mise à jour`,
        details: { previousStatus: existing.status, newStatus: data.status },
      });

      const updated = db
        .prepare(`
          SELECT
            c.id, c.company_name as companyName, c.contact_name as contactName,
            c.email, c.phone, c.status, c.industry, c.city, c.country,
            c.vat_number as vatNumber, c.source, c.owner_id as ownerId,
            u.name as ownerName, c.notes, c.created_at as createdAt, c.updated_at as updatedAt
          FROM contacts c
          LEFT JOIN users u ON u.id = c.owner_id
          WHERE c.id = ?
        `)
        .get(contactId) as Contact;

      res.json(updated);
    } catch (error) {
      console.error('Erreur PUT /api/contacts/:id:', error);
      res.status(500).json({ error: 'Erreur lors de la mise à jour du contact.' });
    }
  });

  app.delete('/api/contacts/:id', requireRoles(Role.ADMIN), (req: AuthenticatedRequest, res: Response) => {
    try {
      const db = getDb();
      const actor = req.actor!;
      const contactId = req.params.id;

      const existing = db
        .prepare('SELECT id, company_name as companyName FROM contacts WHERE id = ?')
        .get(contactId) as { id: string; companyName: string } | undefined;

      if (!existing) {
        res.status(404).json({ error: 'Fiche introuvable.' });
        return;
      }

      const linkedDocs = db
        .prepare('SELECT COUNT(*) as cnt FROM invoices WHERE contact_id = ?')
        .get(contactId) as { cnt: number };

      if (linkedDocs.cnt > 0) {
        res.status(409).json({
          error: 'Impossible de supprimer un client ayant des factures comptables rattachées. Passez son statut en CHURNED (Inactif).',
        });
        return;
      }

      db.prepare('DELETE FROM contacts WHERE id = ?').run(contactId);

      recordActivity({
        actor,
        entityType: 'CONTACT',
        entityId: contactId,
        entityLabel: existing.companyName,
        action: 'CONTACT_DELETED',
        summary: `Suppression définitive de la fiche ${existing.companyName}`,
      });

      res.json({ deleted: true, id: contactId });
    } catch (error) {
      console.error('Erreur DELETE /api/contacts/:id:', error);
      res.status(500).json({ error: 'Impossible de supprimer ce contact (documents liés existants).' });
    }
  });

  // ---------------------------------------------------------------------------
  // 4. OPPORTUNITÉS & PIPELINE COMMERCIAL
  // ---------------------------------------------------------------------------
  app.get('/api/opportunities', (req: AuthenticatedRequest, res: Response) => {
    try {
      const db = getDb();
      const { stage, contactId } = req.query;

      let sql = `
        SELECT
          o.id, o.title, o.contact_id as contactId,
          c.company_name as companyName, c.contact_name as contactName,
          o.stage, o.estimated_amount_ht as estimatedAmountHt,
          o.probability, o.weighted_amount_ht as weightedAmountHt,
          o.expected_close_date as expectedCloseDate,
          o.owner_id as ownerId, u.name as ownerName,
          o.notes, o.loss_reason as lossReason,
          o.created_at as createdAt, o.updated_at as updatedAt
        FROM opportunities o
        LEFT JOIN contacts c ON c.id = o.contact_id
        LEFT JOIN users u ON u.id = o.owner_id
        WHERE 1=1
      `;
      const params: unknown[] = [];

      if (stage && typeof stage === 'string' && stage !== 'ALL') {
        sql += ' AND o.stage = ?';
        params.push(stage);
      }
      if (contactId && typeof contactId === 'string') {
        sql += ' AND o.contact_id = ?';
        params.push(contactId);
      }

      sql += ' ORDER BY o.expected_close_date ASC';

      const rows = db.prepare(sql).all(...params) as Opportunity[];
      res.json(rows);
    } catch (error) {
      console.error('Erreur GET /api/opportunities:', error);
      res.status(500).json({ error: 'Impossible de charger les opportunités du pipeline.' });
    }
  });

  app.post('/api/opportunities', (req: AuthenticatedRequest, res: Response) => {
    try {
      const parsed = opportunityInputSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({
          error: "Données d'opportunité invalides.",
          details: parsed.error.issues.map((i) => i.message),
        });
        return;
      }

      const actor = req.actor!;
      const data = parsed.data;
      const db = getDb();

      // Calcul strict côté serveur du montant pondéré
      const calc = calculateWeightedOpportunityAmount(
        data.estimatedAmountHt,
        data.probability,
        data.stage
      );

      const id = `opp-${crypto.randomUUID().slice(0, 8)}`;
      const now = new Date().toISOString();
      const ownerId = data.ownerId || actor.id;

      db.prepare(`
        INSERT INTO opportunities (
          id, title, contact_id, stage, estimated_amount_ht, probability,
          weighted_amount_ht, expected_close_date, owner_id, notes, loss_reason, created_at, updated_at
        ) VALUES (
          @id, @title, @contactId, @stage, @estimatedAmountHt, @probability,
          @weightedAmountHt, @expectedCloseDate, @ownerId, @notes, @lossReason, @createdAt, @updatedAt
        )
      `).run({
        id,
        title: data.title,
        contactId: data.contactId,
        stage: data.stage,
        estimatedAmountHt: roundCurrency(data.estimatedAmountHt),
        probability: calc.probability,
        weightedAmountHt: calc.weightedAmountHt,
        expectedCloseDate: data.expectedCloseDate,
        ownerId,
        notes: data.notes,
        lossReason: data.lossReason,
        createdAt: now,
        updatedAt: now,
      });

      // Si l'opportunité est gagnée d'emblée, promouvoir le prospect en client actif
      if (data.stage === OpportunityStage.WON) {
        db.prepare('UPDATE contacts SET status = ?, updated_at = ? WHERE id = ?').run(
          ContactStatus.ACTIVE_CLIENT,
          now,
          data.contactId
        );
      }

      recordActivity({
        actor,
        entityType: 'OPPORTUNITY',
        entityId: id,
        entityLabel: data.title,
        action: 'OPPORTUNITY_CREATED',
        summary: `Opportunité créée : ${data.title} (${roundCurrency(data.estimatedAmountHt).toLocaleString('fr-FR')} € HT — Pondéré : ${calc.weightedAmountHt.toLocaleString('fr-FR')} € HT)`,
        details: {
          stage: data.stage,
          estimatedAmountHt: data.estimatedAmountHt,
          probability: calc.probability,
          weightedAmountHt: calc.weightedAmountHt,
        },
      });

      const created = db
        .prepare(`
          SELECT
            o.id, o.title, o.contact_id as contactId,
            c.company_name as companyName, c.contact_name as contactName,
            o.stage, o.estimated_amount_ht as estimatedAmountHt,
            o.probability, o.weighted_amount_ht as weightedAmountHt,
            o.expected_close_date as expectedCloseDate,
            o.owner_id as ownerId, u.name as ownerName,
            o.notes, o.loss_reason as lossReason,
            o.created_at as createdAt, o.updated_at as updatedAt
          FROM opportunities o
          LEFT JOIN contacts c ON c.id = o.contact_id
          LEFT JOIN users u ON u.id = o.owner_id
          WHERE o.id = ?
        `)
        .get(id) as Opportunity;

      res.status(201).json(created);
    } catch (error) {
      console.error('Erreur POST /api/opportunities:', error);
      res.status(500).json({ error: "Erreur lors de la création de l'opportunité." });
    }
  });

  app.patch('/api/opportunities/:id/stage', (req: AuthenticatedRequest, res: Response) => {
    try {
      const db = getDb();
      const actor = req.actor!;
      const oppId = req.params.id;
      const { stage, probability, lossReason } = req.body as {
        stage: OpportunityStage;
        probability?: number;
        lossReason?: string;
      };

      const existing = db
        .prepare(`
          SELECT id, title, contact_id as contactId, stage, estimated_amount_ht as estimatedAmountHt,
                 probability, owner_id as ownerId
          FROM opportunities WHERE id = ?
        `)
        .get(oppId) as
        | {
            id: string;
            title: string;
            contactId: string;
            stage: OpportunityStage;
            estimatedAmountHt: number;
            probability: number;
            ownerId: string;
          }
        | undefined;

      if (!existing) {
        res.status(404).json({ error: 'Opportunité introuvable.' });
        return;
      }

      if (!canAccessRecord(actor, existing.ownerId, 'write')) {
        res.status(403).json({
          error: 'Accès refusé : vous ne pouvez déplacer que les opportunités de votre portefeuille.',
          code: 'FORBIDDEN_OWNER',
        });
        return;
      }

      const defaultProbByStage: Record<OpportunityStage, number> = {
        [OpportunityStage.QUALIFICATION]: 20,
        [OpportunityStage.DISCOVERY]: 40,
        [OpportunityStage.PROPOSAL]: 60,
        [OpportunityStage.NEGOTIATION]: 80,
        [OpportunityStage.WON]: 100,
        [OpportunityStage.LOST]: 0,
      };

      const targetProb =
        typeof probability === 'number' ? probability : defaultProbByStage[stage] ?? existing.probability;

      const calc = calculateWeightedOpportunityAmount(existing.estimatedAmountHt, targetProb, stage);
      const now = new Date().toISOString();

      db.prepare(`
        UPDATE opportunities SET
          stage = @stage,
          probability = @probability,
          weighted_amount_ht = @weightedAmountHt,
          loss_reason = COALESCE(@lossReason, loss_reason),
          updated_at = @updatedAt
        WHERE id = @id
      `).run({
        id: oppId,
        stage,
        probability: calc.probability,
        weightedAmountHt: calc.weightedAmountHt,
        lossReason: lossReason ?? null,
        updatedAt: now,
      });

      if (stage === OpportunityStage.WON) {
        db.prepare('UPDATE contacts SET status = ?, updated_at = ? WHERE id = ?').run(
          ContactStatus.ACTIVE_CLIENT,
          now,
          existing.contactId
        );
      }

      recordActivity({
        actor,
        entityType: 'OPPORTUNITY',
        entityId: oppId,
        entityLabel: existing.title,
        action: 'STAGE_CHANGED',
        summary: `Étape pipeline modifiée : ${existing.stage} → ${stage} (Pondéré : ${calc.weightedAmountHt.toLocaleString('fr-FR')} € HT)`,
        details: {
          previousStage: existing.stage,
          newStage: stage,
          probability: calc.probability,
          weightedAmountHt: calc.weightedAmountHt,
        },
      });

      const updated = db
        .prepare(`
          SELECT
            o.id, o.title, o.contact_id as contactId,
            c.company_name as companyName, c.contact_name as contactName,
            o.stage, o.estimated_amount_ht as estimatedAmountHt,
            o.probability, o.weighted_amount_ht as weightedAmountHt,
            o.expected_close_date as expectedCloseDate,
            o.owner_id as ownerId, u.name as ownerName,
            o.notes, o.loss_reason as lossReason,
            o.created_at as createdAt, o.updated_at as updatedAt
          FROM opportunities o
          LEFT JOIN contacts c ON c.id = o.contact_id
          LEFT JOIN users u ON u.id = o.owner_id
          WHERE o.id = ?
        `)
        .get(oppId) as Opportunity;

      res.json(updated);
    } catch (error) {
      console.error('Erreur PATCH /api/opportunities/:id/stage:', error);
      res.status(500).json({ error: "Erreur lors du changement d'étape du pipeline." });
    }
  });

  // ---------------------------------------------------------------------------
  // 5. DEVIS (QUOTES) — Totaux intégralement calculés côté serveur
  // ---------------------------------------------------------------------------
  function fetchQuotesWithLines(quoteId?: string): Quote[] {
    const db = getDb();
    let sql = `
      SELECT
        q.id, q.reference, q.contact_id as contactId,
        c.company_name as companyName, c.contact_name as contactName,
        q.opportunity_id as opportunityId, o.title as opportunityTitle,
        q.status, q.issue_date as issueDate, q.valid_until as validUntil,
        q.subtotal_ht as subtotalHt, q.total_discount_ht as totalDiscountHt,
        q.net_ht as netHt, q.total_tax_amount as totalTaxAmount, q.total_ttc as totalTtc,
        q.notes, q.terms, q.owner_id as ownerId, u.name as ownerName,
        q.converted_invoice_id as convertedInvoiceId,
        q.created_at as createdAt, q.updated_at as updatedAt
      FROM quotes q
      LEFT JOIN contacts c ON c.id = q.contact_id
      LEFT JOIN opportunities o ON o.id = q.opportunity_id
      LEFT JOIN users u ON u.id = q.owner_id
    `;
    const params: unknown[] = [];
    if (quoteId) {
      sql += ' WHERE q.id = ?';
      params.push(quoteId);
    }
    sql += ' ORDER BY q.issue_date DESC, q.created_at DESC';

    const quoteRows = db.prepare(sql).all(...params) as Array<Omit<Quote, 'lines'>>;
    const lineStmt = db.prepare(`
      SELECT
        id, description, quantity, unit_price_ht as unitPriceHt,
        discount_percent as discountPercent, tax_rate as taxRate,
        line_subtotal_ht as lineSubtotalHt, line_discount_ht as lineDiscountHt,
        line_net_ht as lineNetHt, line_tax_amount as lineTaxAmount,
        line_total_ttc as lineTotalTtc
      FROM quote_lines
      WHERE quote_id = ?
      ORDER BY position ASC
    `);

    return quoteRows.map((q) => ({
      ...q,
      lines: lineStmt.all(q.id) as Required<DocumentLineItem>[],
    }));
  }

  app.get('/api/quotes', (_req: AuthenticatedRequest, res: Response) => {
    try {
      res.json(fetchQuotesWithLines());
    } catch (error) {
      console.error('Erreur GET /api/quotes:', error);
      res.status(500).json({ error: 'Impossible de charger les devis.' });
    }
  });

  // Simulation de calcul serveur en direct pour l'éditeur de devis/facture
  app.post('/api/calculations/preview', (req: AuthenticatedRequest, res: Response) => {
    try {
      const { lines } = req.body as { lines: DocumentLineItem[] };
      const totals = calculateDocumentTotals(lines);
      res.json(totals);
    } catch (error: any) {
      res.status(400).json({ error: error.message || 'Lignes de calcul invalides.' });
    }
  });

  app.post('/api/quotes', (req: AuthenticatedRequest, res: Response) => {
    try {
      const parsed = quoteInputSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({
          error: 'Données du devis invalides.',
          details: parsed.error.issues.map((i) => i.message),
        });
        return;
      }

      const actor = req.actor!;
      const data = parsed.data;
      const db = getDb();

      // Calcul strict côté serveur (les montants éventuellement transmis par le client sont ignorés)
      const calc = calculateDocumentTotals(data.lines);

      const countRow = db.prepare('SELECT COUNT(*) as cnt FROM quotes').get() as { cnt: number };
      const nextNum = String(countRow.cnt + 1).padStart(3, '0');
      const reference = `DEV-2026-${nextNum}`;
      const id = `quo-${crypto.randomUUID().slice(0, 8)}`;
      const now = new Date().toISOString();

      const tx = db.transaction(() => {
        db.prepare(`
          INSERT INTO quotes (
            id, reference, contact_id, opportunity_id, status, issue_date, valid_until,
            subtotal_ht, total_discount_ht, net_ht, total_tax_amount, total_ttc,
            notes, terms, owner_id, converted_invoice_id, created_at, updated_at
          ) VALUES (
            @id, @reference, @contactId, @opportunityId, @status, @issueDate, @validUntil,
            @subtotalHt, @totalDiscountHt, @netHt, @totalTaxAmount, @totalTtc,
            @notes, @terms, @ownerId, NULL, @createdAt, @updatedAt
          )
        `).run({
          id,
          reference,
          contactId: data.contactId,
          opportunityId: data.opportunityId || null,
          status: data.status,
          issueDate: data.issueDate,
          validUntil: data.validUntil,
          subtotalHt: calc.subtotalHt,
          totalDiscountHt: calc.totalDiscountHt,
          netHt: calc.netHt,
          totalTaxAmount: calc.totalTaxAmount,
          totalTtc: calc.totalTtc,
          notes: data.notes,
          terms: data.terms,
          ownerId: actor.id,
          createdAt: now,
          updatedAt: now,
        });

        const insertLine = db.prepare(`
          INSERT INTO quote_lines (
            id, quote_id, position, description, quantity, unit_price_ht,
            discount_percent, tax_rate, line_subtotal_ht, line_discount_ht,
            line_net_ht, line_tax_amount, line_total_ttc
          ) VALUES (
            @id, @quoteId, @position, @description, @quantity, @unitPriceHt,
            @discountPercent, @taxRate, @lineSubtotalHt, @lineDiscountHt,
            @lineNetHt, @lineTaxAmount, @lineTotalTtc
          )
        `);

        calc.lines.forEach((line, index) => {
          insertLine.run({
            ...line,
            id: `ql-${crypto.randomUUID().slice(0, 8)}`,
            quoteId: id,
            position: index + 1,
          });
        });
      });

      tx();

      const created = fetchQuotesWithLines(id)[0];

      recordActivity({
        actor,
        entityType: 'QUOTE',
        entityId: id,
        entityLabel: `${reference} — ${created.companyName || ''}`,
        action: 'QUOTE_CREATED',
        summary: `Devis ${reference} émis pour ${calc.netHt.toLocaleString('fr-FR')} € HT (${calc.totalTtc.toLocaleString('fr-FR')} € TTC)`,
        details: {
          reference,
          subtotalHt: calc.subtotalHt,
          totalDiscountHt: calc.totalDiscountHt,
          netHt: calc.netHt,
          totalTaxAmount: calc.totalTaxAmount,
          totalTtc: calc.totalTtc,
        },
      });

      res.status(201).json(created);
    } catch (error: any) {
      console.error('Erreur POST /api/quotes:', error);
      res.status(400).json({ error: error.message || 'Erreur lors de la création du devis.' });
    }
  });

  app.patch('/api/quotes/:id/status', (req: AuthenticatedRequest, res: Response) => {
    try {
      const db = getDb();
      const actor = req.actor!;
      const quoteId = req.params.id;
      const { status } = req.body as { status: QuoteStatus };

      const existing = fetchQuotesWithLines(quoteId)[0];
      if (!existing) {
        res.status(404).json({ error: 'Devis introuvable.' });
        return;
      }

      if (!canAccessRecord(actor, existing.ownerId, 'write')) {
        res.status(403).json({
          error: 'Accès refusé : vous ne pouvez modifier que vos propres devis.',
          code: 'FORBIDDEN_OWNER',
        });
        return;
      }

      const now = new Date().toISOString();
      db.prepare('UPDATE quotes SET status = ?, updated_at = ? WHERE id = ?').run(status, now, quoteId);

      recordActivity({
        actor,
        entityType: 'QUOTE',
        entityId: quoteId,
        entityLabel: `${existing.reference} — ${existing.companyName || ''}`,
        action: 'QUOTE_STATUS_CHANGED',
        summary: `Statut du devis ${existing.reference} changé : ${existing.status} → ${status}`,
        details: { previousStatus: existing.status, newStatus: status },
      });

      res.json(fetchQuotesWithLines(quoteId)[0]);
    } catch (error) {
      console.error('Erreur PATCH /api/quotes/:id/status:', error);
      res.status(500).json({ error: 'Impossible de mettre à jour le statut du devis.' });
    }
  });

  // Conversion en 1 clic d'un devis en facture avec recalcul serveur et audit
  app.post('/api/quotes/:id/convert-to-invoice', (req: AuthenticatedRequest, res: Response) => {
    try {
      const db = getDb();
      const actor = req.actor!;
      const quoteId = req.params.id;

      const quote = fetchQuotesWithLines(quoteId)[0];
      if (!quote) {
        res.status(404).json({ error: 'Devis introuvable.' });
        return;
      }

      if (!canAccessRecord(actor, quote.ownerId, 'write')) {
        res.status(403).json({
          error: 'Accès refusé : vous ne pouvez convertir que les devis de votre portefeuille ou équipe.',
          code: 'FORBIDDEN_OWNER',
        });
        return;
      }

      if (quote.convertedInvoiceId) {
        res.status(409).json({
          error: `Ce devis a déjà été converti en facture (${quote.convertedInvoiceId}).`,
        });
        return;
      }

      // Recalcul serveur intégral à partir des lignes du devis
      const calc = calculateDocumentTotals(quote.lines);
      const countRow = db.prepare('SELECT COUNT(*) as cnt FROM invoices').get() as { cnt: number };
      const nextNum = String(countRow.cnt + 1).padStart(3, '0');
      const invoiceRef = `FAC-2026-${nextNum}`;
      const invoiceId = `inv-${crypto.randomUUID().slice(0, 8)}`;
      const now = new Date().toISOString();
      const issueDate = now.slice(0, 10);
      const dueDateObj = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
      const dueDate = dueDateObj.toISOString().slice(0, 10);

      const tx = db.transaction(() => {
        db.prepare(`
          INSERT INTO invoices (
            id, reference, quote_id, contact_id, status, issue_date, due_date, paid_at,
            subtotal_ht, total_discount_ht, net_ht, total_tax_amount, total_ttc,
            amount_paid, balance_due, payment_method, notes, owner_id, created_at, updated_at
          ) VALUES (
            @id, @reference, @quoteId, @contactId, @status, @issueDate, @dueDate, NULL,
            @subtotalHt, @totalDiscountHt, @netHt, @totalTaxAmount, @totalTtc,
            0, @balanceDue, 'Virement SEPA', @notes, @ownerId, @createdAt, @updatedAt
          )
        `).run({
          id: invoiceId,
          reference: invoiceRef,
          quoteId: quote.id,
          contactId: quote.contactId,
          status: InvoiceStatus.ISSUED,
          issueDate,
          dueDate,
          subtotalHt: calc.subtotalHt,
          totalDiscountHt: calc.totalDiscountHt,
          netHt: calc.netHt,
          totalTaxAmount: calc.totalTaxAmount,
          totalTtc: calc.totalTtc,
          balanceDue: calc.totalTtc,
          notes: `Facture générée à partir du devis ${quote.reference}.`,
          ownerId: quote.ownerId,
          createdAt: now,
          updatedAt: now,
        });

        const insertInvLine = db.prepare(`
          INSERT INTO invoice_lines (
            id, invoice_id, position, description, quantity, unit_price_ht,
            discount_percent, tax_rate, line_subtotal_ht, line_discount_ht,
            line_net_ht, line_tax_amount, line_total_ttc
          ) VALUES (
            @id, @invoiceId, @position, @description, @quantity, @unitPriceHt,
            @discountPercent, @taxRate, @lineSubtotalHt, @lineDiscountHt,
            @lineNetHt, @lineTaxAmount, @lineTotalTtc
          )
        `);

        calc.lines.forEach((line, idx) => {
          insertInvLine.run({
            ...line,
            id: `il-${crypto.randomUUID().slice(0, 8)}`,
            invoiceId,
            position: idx + 1,
          });
        });

        db.prepare(
          'UPDATE quotes SET status = ?, converted_invoice_id = ?, updated_at = ? WHERE id = ?'
        ).run(QuoteStatus.ACCEPTED, invoiceId, now, quote.id);

        db.prepare('UPDATE contacts SET status = ?, updated_at = ? WHERE id = ?').run(
          ContactStatus.ACTIVE_CLIENT,
          now,
          quote.contactId
        );

        if (quote.opportunityId) {
          db.prepare(
            'UPDATE opportunities SET stage = ?, probability = 100, weighted_amount_ht = estimated_amount_ht, updated_at = ? WHERE id = ?'
          ).run(OpportunityStage.WON, now, quote.opportunityId);
        }
      });

      tx();

      recordActivity({
        actor,
        entityType: 'QUOTE',
        entityId: quote.id,
        entityLabel: `${quote.reference} → ${invoiceRef}`,
        action: 'QUOTE_CONVERTED_TO_INVOICE',
        summary: `Devis ${quote.reference} accepté et converti en facture ${invoiceRef} (${calc.totalTtc.toLocaleString('fr-FR')} € TTC)`,
        details: {
          quoteId: quote.id,
          quoteReference: quote.reference,
          invoiceId,
          invoiceReference: invoiceRef,
          totalTtc: calc.totalTtc,
        },
      });

      res.status(201).json(fetchInvoicesWithLines(invoiceId)[0]);
    } catch (error) {
      console.error('Erreur POST /api/quotes/:id/convert-to-invoice:', error);
      res.status(500).json({ error: 'Erreur lors de la conversion du devis en facture.' });
    }
  });

  // ---------------------------------------------------------------------------
  // 6. FACTURES (INVOICES) — Calcul serveur des soldes, encaissements et retards
  // ---------------------------------------------------------------------------
  function fetchInvoicesWithLines(invoiceId?: string): Invoice[] {
    const db = getDb();
    const todayIso = new Date().toISOString().slice(0, 10);

    let sql = `
      SELECT
        i.id, i.reference, i.quote_id as quoteId, q.reference as quoteReference,
        i.contact_id as contactId, c.company_name as companyName, c.contact_name as contactName,
        i.status, i.issue_date as issueDate, i.due_date as dueDate, i.paid_at as paidAt,
        i.subtotal_ht as subtotalHt, i.total_discount_ht as totalDiscountHt,
        i.net_ht as netHt, i.total_tax_amount as totalTaxAmount, i.total_ttc as totalTtc,
        i.amount_paid as amountPaid, i.balance_due as balanceDue,
        i.payment_method as paymentMethod, i.notes,
        i.owner_id as ownerId, u.name as ownerName,
        i.created_at as createdAt, i.updated_at as updatedAt
      FROM invoices i
      LEFT JOIN contacts c ON c.id = i.contact_id
      LEFT JOIN quotes q ON q.id = i.quote_id
      LEFT JOIN users u ON u.id = i.owner_id
    `;
    const params: unknown[] = [];
    if (invoiceId) {
      sql += ' WHERE i.id = ?';
      params.push(invoiceId);
    }
    sql += ' ORDER BY i.issue_date DESC, i.created_at DESC';

    const invRows = db.prepare(sql).all(...params) as Array<Omit<Invoice, 'lines' | 'isOverdue'>>;
    const lineStmt = db.prepare(`
      SELECT
        id, description, quantity, unit_price_ht as unitPriceHt,
        discount_percent as discountPercent, tax_rate as taxRate,
        line_subtotal_ht as lineSubtotalHt, line_discount_ht as lineDiscountHt,
        line_net_ht as lineNetHt, line_tax_amount as lineTaxAmount,
        line_total_ttc as lineTotalTtc
      FROM invoice_lines
      WHERE invoice_id = ?
      ORDER BY position ASC
    `);

    return invRows.map((inv) => {
      const bal = calculateInvoiceBalance(inv.totalTtc, inv.amountPaid, inv.dueDate, inv.status, todayIso);
      return {
        ...inv,
        status: bal.computedStatus as InvoiceStatus,
        amountPaid: bal.amountPaid,
        balanceDue: bal.balanceDue,
        isOverdue: bal.isOverdue,
        lines: lineStmt.all(inv.id) as Required<DocumentLineItem>[],
      };
    });
  }

  app.get('/api/invoices', (_req: AuthenticatedRequest, res: Response) => {
    try {
      res.json(fetchInvoicesWithLines());
    } catch (error) {
      console.error('Erreur GET /api/invoices:', error);
      res.status(500).json({ error: 'Impossible de charger les factures.' });
    }
  });

  app.post('/api/invoices', (req: AuthenticatedRequest, res: Response) => {
    try {
      const parsed = invoiceInputSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({
          error: 'Données de facturation invalides.',
          details: parsed.error.issues.map((i) => i.message),
        });
        return;
      }

      const actor = req.actor!;
      const data = parsed.data;
      const db = getDb();

      // Calcul serveur strict des lignes et du solde
      const calc = calculateDocumentTotals(data.lines);
      const bal = calculateInvoiceBalance(
        calc.totalTtc,
        data.amountPaid,
        data.dueDate,
        data.status
      );

      const countRow = db.prepare('SELECT COUNT(*) as cnt FROM invoices').get() as { cnt: number };
      const nextNum = String(countRow.cnt + 1).padStart(3, '0');
      const reference = `FAC-2026-${nextNum}`;
      const id = `inv-${crypto.randomUUID().slice(0, 8)}`;
      const now = new Date().toISOString();

      const tx = db.transaction(() => {
        db.prepare(`
          INSERT INTO invoices (
            id, reference, quote_id, contact_id, status, issue_date, due_date, paid_at,
            subtotal_ht, total_discount_ht, net_ht, total_tax_amount, total_ttc,
            amount_paid, balance_due, payment_method, notes, owner_id, created_at, updated_at
          ) VALUES (
            @id, @reference, @quoteId, @contactId, @status, @issueDate, @dueDate, @paidAt,
            @subtotalHt, @totalDiscountHt, @netHt, @totalTaxAmount, @totalTtc,
            @amountPaid, @balanceDue, @paymentMethod, @notes, @ownerId, @createdAt, @updatedAt
          )
        `).run({
          id,
          reference,
          quoteId: data.quoteId || null,
          contactId: data.contactId,
          status: bal.computedStatus,
          issueDate: data.issueDate,
          dueDate: data.dueDate,
          paidAt: bal.computedStatus === 'PAID' ? now : null,
          subtotalHt: calc.subtotalHt,
          totalDiscountHt: calc.totalDiscountHt,
          netHt: calc.netHt,
          totalTaxAmount: calc.totalTaxAmount,
          totalTtc: calc.totalTtc,
          amountPaid: bal.amountPaid,
          balanceDue: bal.balanceDue,
          paymentMethod: data.paymentMethod,
          notes: data.notes,
          ownerId: actor.id,
          createdAt: now,
          updatedAt: now,
        });

        const insertLine = db.prepare(`
          INSERT INTO invoice_lines (
            id, invoice_id, position, description, quantity, unit_price_ht,
            discount_percent, tax_rate, line_subtotal_ht, line_discount_ht,
            line_net_ht, line_tax_amount, line_total_ttc
          ) VALUES (
            @id, @invoiceId, @position, @description, @quantity, @unitPriceHt,
            @discountPercent, @taxRate, @lineSubtotalHt, @lineDiscountHt,
            @lineNetHt, @lineTaxAmount, @lineTotalTtc
          )
        `);

        calc.lines.forEach((line, index) => {
          insertLine.run({
            ...line,
            id: `il-${crypto.randomUUID().slice(0, 8)}`,
            invoiceId: id,
            position: index + 1,
          });
        });
      });

      tx();

      const created = fetchInvoicesWithLines(id)[0];

      recordActivity({
        actor,
        entityType: 'INVOICE',
        entityId: id,
        entityLabel: `${reference} — ${created.companyName || ''}`,
        action: 'INVOICE_CREATED',
        summary: `Facture ${reference} émise pour ${calc.totalTtc.toLocaleString('fr-FR')} € TTC (Solde : ${bal.balanceDue.toLocaleString('fr-FR')} € TTC)`,
        details: {
          reference,
          netHt: calc.netHt,
          totalTtc: calc.totalTtc,
          balanceDue: bal.balanceDue,
        },
      });

      res.status(201).json(created);
    } catch (error: any) {
      console.error('Erreur POST /api/invoices:', error);
      res.status(400).json({ error: error.message || 'Erreur lors de la création de la facture.' });
    }
  });

  // Enregistrement d'un règlement partiel ou total (Réservé ADMIN et MANAGER ou propriétaire du dossier)
  app.post('/api/invoices/:id/payments', (req: AuthenticatedRequest, res: Response) => {
    try {
      const db = getDb();
      const actor = req.actor!;
      const invoiceId = req.params.id;

      const existing = fetchInvoicesWithLines(invoiceId)[0];
      if (!existing) {
        res.status(404).json({ error: 'Facture introuvable.' });
        return;
      }

      if (!canAccessRecord(actor, existing.ownerId, 'write')) {
        res.status(403).json({
          error: "Accès refusé : vous n'êtes pas autorisé à modifier les règlements de cette facture.",
          code: 'FORBIDDEN_OWNER',
        });
        return;
      }

      const parsed = invoicePaymentSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({
          error: 'Montant de paiement invalide.',
          details: parsed.error.issues.map((i) => i.message),
        });
        return;
      }

      const bal = calculateInvoiceBalance(
        existing.totalTtc,
        parsed.data.amountPaid,
        existing.dueDate,
        InvoiceStatus.ISSUED
      );

      const now = new Date().toISOString();
      db.prepare(`
        UPDATE invoices SET
          amount_paid = @amountPaid,
          balance_due = @balanceDue,
          status = @status,
          paid_at = @paidAt,
          payment_method = @paymentMethod,
          updated_at = @updatedAt
        WHERE id = @id
      `).run({
        id: invoiceId,
        amountPaid: bal.amountPaid,
        balanceDue: bal.balanceDue,
        status: bal.computedStatus,
        paidAt: bal.computedStatus === 'PAID' ? now : existing.paidAt || null,
        paymentMethod: parsed.data.paymentMethod,
        updatedAt: now,
      });

      recordActivity({
        actor,
        entityType: 'INVOICE',
        entityId: invoiceId,
        entityLabel: `${existing.reference} — ${existing.companyName || ''}`,
        action: bal.computedStatus === 'PAID' ? 'INVOICE_PAID_FULL' : 'INVOICE_PAYMENT_RECORDED',
        summary: `Règlement enregistré sur ${existing.reference} : cumul encaissé ${bal.amountPaid.toLocaleString('fr-FR')} € TTC (Reste à payer : ${bal.balanceDue.toLocaleString('fr-FR')} € TTC)`,
        details: {
          previousPaid: existing.amountPaid,
          newPaid: bal.amountPaid,
          balanceDue: bal.balanceDue,
          status: bal.computedStatus,
        },
      });

      res.json(fetchInvoicesWithLines(invoiceId)[0]);
    } catch (error) {
      console.error('Erreur POST /api/invoices/:id/payments:', error);
      res.status(500).json({ error: "Erreur lors de l'enregistrement du paiement." });
    }
  });

  // ---------------------------------------------------------------------------
  // 7. TÂCHES DE RELANCE (FOLLOW-UP TASKS)
  // ---------------------------------------------------------------------------
  app.get('/api/tasks', (_req: AuthenticatedRequest, res: Response) => {
    try {
      const db = getDb();
      const todayIso = new Date().toISOString().slice(0, 10);

      const rows = db
        .prepare(`
          SELECT
            t.id, t.title, t.description, t.type, t.priority, t.status,
            t.due_date as dueDate, t.completed_at as completedAt,
            t.contact_id as contactId, c.company_name as companyName,
            t.opportunity_id as opportunityId, o.title as opportunityTitle,
            t.quote_id as quoteId, t.invoice_id as invoiceId,
            t.assignee_id as assigneeId, u.name as assigneeName,
            t.created_by_id as createdById, t.created_at as createdAt, t.updated_at as updatedAt
          FROM follow_up_tasks t
          LEFT JOIN contacts c ON c.id = t.contact_id
          LEFT JOIN opportunities o ON o.id = t.opportunity_id
          LEFT JOIN users u ON u.id = t.assignee_id
          ORDER BY
            CASE WHEN t.status = 'DONE' THEN 1 ELSE 0 END ASC,
            t.due_date ASC
        `)
        .all() as FollowUpTask[];

      res.json(
        rows.map((t) => ({
          ...t,
          isOverdue: t.status !== TaskStatus.DONE && t.dueDate < todayIso,
        }))
      );
    } catch (error) {
      console.error('Erreur GET /api/tasks:', error);
      res.status(500).json({ error: 'Impossible de charger les tâches de relance.' });
    }
  });

  app.post('/api/tasks', (req: AuthenticatedRequest, res: Response) => {
    try {
      const parsed = taskInputSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({
          error: 'Données de tâche de relance invalides.',
          details: parsed.error.issues.map((i) => i.message),
        });
        return;
      }

      const actor = req.actor!;
      const data = parsed.data;
      const db = getDb();
      const id = `tsk-${crypto.randomUUID().slice(0, 8)}`;
      const now = new Date().toISOString();
      const assigneeId = data.assigneeId || actor.id;

      db.prepare(`
        INSERT INTO follow_up_tasks (
          id, title, description, type, priority, status, due_date, completed_at,
          contact_id, opportunity_id, quote_id, invoice_id, assignee_id, created_by_id, created_at, updated_at
        ) VALUES (
          @id, @title, @description, @type, @priority, @status, @dueDate, @completedAt,
          @contactId, @opportunityId, @quoteId, @invoiceId, @assigneeId, @createdById, @createdAt, @updatedAt
        )
      `).run({
        id,
        title: data.title,
        description: data.description,
        type: data.type,
        priority: data.priority,
        status: data.status,
        dueDate: data.dueDate,
        completedAt: data.status === TaskStatus.DONE ? now : null,
        contactId: data.contactId || null,
        opportunityId: data.opportunityId || null,
        quoteId: data.quoteId || null,
        invoiceId: data.invoiceId || null,
        assigneeId,
        createdById: actor.id,
        createdAt: now,
        updatedAt: now,
      });

      recordActivity({
        actor,
        entityType: 'TASK',
        entityId: id,
        entityLabel: data.title,
        action: 'TASK_CREATED',
        summary: `Tâche de relance planifiée pour le ${data.dueDate} : ${data.title}`,
        details: { type: data.type, priority: data.priority, dueDate: data.dueDate },
      });

      const created = db
        .prepare(`
          SELECT
            t.id, t.title, t.description, t.type, t.priority, t.status,
            t.due_date as dueDate, t.completed_at as completedAt,
            t.contact_id as contactId, c.company_name as companyName,
            t.opportunity_id as opportunityId, o.title as opportunityTitle,
            t.quote_id as quoteId, t.invoice_id as invoiceId,
            t.assignee_id as assigneeId, u.name as assigneeName,
            t.created_by_id as createdById, t.created_at as createdAt, t.updated_at as updatedAt
          FROM follow_up_tasks t
          LEFT JOIN contacts c ON c.id = t.contact_id
          LEFT JOIN opportunities o ON o.id = t.opportunity_id
          LEFT JOIN users u ON u.id = t.assignee_id
          WHERE t.id = ?
        `)
        .get(id) as FollowUpTask;

      res.status(201).json(created);
    } catch (error) {
      console.error('Erreur POST /api/tasks:', error);
      res.status(500).json({ error: 'Erreur lors de la création de la tâche de relance.' });
    }
  });

  app.patch('/api/tasks/:id/status', (req: AuthenticatedRequest, res: Response) => {
    try {
      const db = getDb();
      const actor = req.actor!;
      const taskId = req.params.id;
      const { status } = req.body as { status: TaskStatus };

      const existing = db
        .prepare('SELECT id, title, status, assignee_id as assigneeId FROM follow_up_tasks WHERE id = ?')
        .get(taskId) as { id: string; title: string; status: TaskStatus; assigneeId: string } | undefined;

      if (!existing) {
        res.status(404).json({ error: 'Tâche introuvable.' });
        return;
      }

      if (!canAccessRecord(actor, existing.assigneeId, 'write')) {
        res.status(403).json({
          error: 'Accès refusé : vous ne pouvez clôturer que vos propres tâches de relance.',
          code: 'FORBIDDEN_OWNER',
        });
        return;
      }

      const now = new Date().toISOString();
      db.prepare(`
        UPDATE follow_up_tasks
        SET status = ?, completed_at = ?, updated_at = ?
        WHERE id = ?
      `).run(status, status === TaskStatus.DONE ? now : null, now, taskId);

      recordActivity({
        actor,
        entityType: 'TASK',
        entityId: taskId,
        entityLabel: existing.title,
        action: status === TaskStatus.DONE ? 'TASK_COMPLETED' : 'TASK_STATUS_CHANGED',
        summary:
          status === TaskStatus.DONE
            ? `Relance effectuée et clôturée : ${existing.title}`
            : `Statut de la tâche "${existing.title}" passé à ${status}`,
      });

      res.json({ id: taskId, status, updatedAt: now });
    } catch (error) {
      console.error('Erreur PATCH /api/tasks/:id/status:', error);
      res.status(500).json({ error: 'Erreur lors de la mise à jour de la tâche.' });
    }
  });

  // ---------------------------------------------------------------------------
  // 8. HISTORIQUE D'ACTIVITÉ & JOURNAL D'AUDIT
  // ---------------------------------------------------------------------------
  app.get('/api/activities', (req: AuthenticatedRequest, res: Response) => {
    try {
      const db = getDb();
      const { entityType } = req.query;

      let sql = `
        SELECT
          id, entity_type as entityType, entity_id as entityId,
          entity_label as entityLabel, action, summary,
          details_json as detailsJson, actor_id as actorId,
          actor_name as actorName, actor_role as actorRole,
          created_at as createdAt
        FROM activity_logs
      `;
      const params: unknown[] = [];

      if (entityType && typeof entityType === 'string' && entityType !== 'ALL') {
        sql += ' WHERE entity_type = ?';
        params.push(entityType);
      }

      sql += ' ORDER BY created_at DESC LIMIT 100';

      const logs = db.prepare(sql).all(...params);
      res.json(logs);
    } catch (error) {
      console.error('Erreur GET /api/activities:', error);
      res.status(500).json({ error: "Impossible de charger l'historique d'activité." });
    }
  });

  // ---------------------------------------------------------------------------
  // 9. EXPORTS CONTRÔLÉS (CSV & JSON avec RBAC, anti-injection CSV et Audit)
  // ---------------------------------------------------------------------------
  app.get('/api/export', createRateLimiter('export'), (req: AuthenticatedRequest, res: Response) => {
    try {
      const parsed = exportQuerySchema.safeParse(req.query);
      if (!parsed.success) {
        res.status(400).json({
          error: "Paramètres d'export invalides.",
          details: parsed.error.issues.map((i) => i.message),
        });
        return;
      }

      const actor = req.actor!;
      const { entity, format } = parsed.data;
      const perm = canExportEntity(actor, entity);

      if (!perm.allowed) {
        recordActivity({
          actor,
          entityType: 'EXPORT',
          entityId: `exp-denied-${Date.now()}`,
          entityLabel: `Export refusé (${entity})`,
          action: 'EXPORT_DENIED',
          summary: `Tentative d'export non autorisée sur "${entity}" par ${actor.name} (${actor.role})`,
          details: { entity, format, reason: perm.reason },
        });
        res.status(403).json({
          error: perm.reason,
          code: 'FORBIDDEN_EXPORT',
        });
        return;
      }

      const db = getDb();
      let rows: Array<Record<string, unknown>> = [];
      let headers: Array<{ key: string; label: string }> = [];

      if (entity === 'contacts') {
        const sql = perm.restrictToOwnerId
          ? `SELECT c.id, c.company_name as companyName, c.contact_name as contactName, c.email, c.phone, c.status, c.industry, c.city, c.vat_number as vatNumber, u.name as ownerName, c.created_at as createdAt FROM contacts c LEFT JOIN users u ON u.id = c.owner_id WHERE c.owner_id = ? ORDER BY c.company_name ASC LIMIT 1000`
          : `SELECT c.id, c.company_name as companyName, c.contact_name as contactName, c.email, c.phone, c.status, c.industry, c.city, c.vat_number as vatNumber, u.name as ownerName, c.created_at as createdAt FROM contacts c LEFT JOIN users u ON u.id = c.owner_id ORDER BY c.company_name ASC LIMIT 1000`;
        rows = db.prepare(sql).all(...(perm.restrictToOwnerId ? [perm.restrictToOwnerId] : [])) as Array<Record<string, unknown>>;
        headers = [
          { key: 'id', label: 'ID' },
          { key: 'companyName', label: 'Société' },
          { key: 'contactName', label: 'Contact Principal' },
          { key: 'email', label: 'Email' },
          { key: 'phone', label: 'Téléphone' },
          { key: 'status', label: 'Statut' },
          { key: 'industry', label: 'Secteur' },
          { key: 'city', label: 'Ville' },
          { key: 'vatNumber', label: 'N° TVA' },
          { key: 'ownerName', label: 'Responsable' },
          { key: 'createdAt', label: 'Date Création' },
        ];
      } else if (entity === 'opportunities') {
        const sql = perm.restrictToOwnerId
          ? `SELECT o.id, o.title, c.company_name as companyName, o.stage, o.estimated_amount_ht as estimatedAmountHt, o.probability, o.weighted_amount_ht as weightedAmountHt, o.expected_close_date as expectedCloseDate, u.name as ownerName FROM opportunities o LEFT JOIN contacts c ON c.id = o.contact_id LEFT JOIN users u ON u.id = o.owner_id WHERE o.owner_id = ? ORDER BY o.expected_close_date ASC LIMIT 1000`
          : `SELECT o.id, o.title, c.company_name as companyName, o.stage, o.estimated_amount_ht as estimatedAmountHt, o.probability, o.weighted_amount_ht as weightedAmountHt, o.expected_close_date as expectedCloseDate, u.name as ownerName FROM opportunities o LEFT JOIN contacts c ON c.id = o.contact_id LEFT JOIN users u ON u.id = o.owner_id ORDER BY o.expected_close_date ASC LIMIT 1000`;
        rows = db.prepare(sql).all(...(perm.restrictToOwnerId ? [perm.restrictToOwnerId] : [])) as Array<Record<string, unknown>>;
        headers = [
          { key: 'id', label: 'ID' },
          { key: 'title', label: 'Intitulé Opportunité' },
          { key: 'companyName', label: 'Société' },
          { key: 'stage', label: 'Étape Pipeline' },
          { key: 'estimatedAmountHt', label: 'Montant Estimé HT (€)' },
          { key: 'probability', label: 'Probabilité (%)' },
          { key: 'weightedAmountHt', label: 'Montant Pondéré HT (€)' },
          { key: 'expectedCloseDate', label: 'Clôture Prévue' },
          { key: 'ownerName', label: 'Responsable' },
        ];
      } else if (entity === 'quotes') {
        const allQuotes = fetchQuotesWithLines();
        const filtered = perm.restrictToOwnerId
          ? allQuotes.filter((q) => q.ownerId === perm.restrictToOwnerId)
          : allQuotes;
        rows = filtered.map((q) => ({
          reference: q.reference,
          companyName: q.companyName,
          status: q.status,
          issueDate: q.issueDate,
          validUntil: q.validUntil,
          subtotalHt: q.subtotalHt,
          totalDiscountHt: q.totalDiscountHt,
          netHt: q.netHt,
          totalTaxAmount: q.totalTaxAmount,
          totalTtc: q.totalTtc,
          ownerName: q.ownerName,
        }));
        headers = [
          { key: 'reference', label: 'Référence Devis' },
          { key: 'companyName', label: 'Client / Prospect' },
          { key: 'status', label: 'Statut' },
          { key: 'issueDate', label: 'Date Émission' },
          { key: 'validUntil', label: 'Valide Jusqu’au' },
          { key: 'subtotalHt', label: 'Sous-total Brut HT (€)' },
          { key: 'totalDiscountHt', label: 'Remise HT (€)' },
          { key: 'netHt', label: 'Total Net HT (€)' },
          { key: 'totalTaxAmount', label: 'Montant TVA (€)' },
          { key: 'totalTtc', label: 'Total TTC (€)' },
          { key: 'ownerName', label: 'Commercial' },
        ];
      } else if (entity === 'invoices') {
        const allInvoices = fetchInvoicesWithLines();
        const filtered = perm.restrictToOwnerId
          ? allInvoices.filter((i) => i.ownerId === perm.restrictToOwnerId)
          : allInvoices;
        rows = filtered.map((i) => ({
          reference: i.reference,
          companyName: i.companyName,
          status: i.status,
          issueDate: i.issueDate,
          dueDate: i.dueDate,
          netHt: i.netHt,
          totalTaxAmount: i.totalTaxAmount,
          totalTtc: i.totalTtc,
          amountPaid: i.amountPaid,
          balanceDue: i.balanceDue,
          ownerName: i.ownerName,
        }));
        headers = [
          { key: 'reference', label: 'Référence Facture' },
          { key: 'companyName', label: 'Client' },
          { key: 'status', label: 'Statut' },
          { key: 'issueDate', label: 'Date Émission' },
          { key: 'dueDate', label: 'Date Échéance' },
          { key: 'netHt', label: 'Total Net HT (€)' },
          { key: 'totalTaxAmount', label: 'TVA (€)' },
          { key: 'totalTtc', label: 'Total TTC (€)' },
          { key: 'amountPaid', label: 'Montant Encaissé TTC (€)' },
          { key: 'balanceDue', label: 'Reste à Payer TTC (€)' },
          { key: 'ownerName', label: 'Responsable' },
        ];
      } else if (entity === 'activities') {
        rows = db
          .prepare(`
            SELECT
              created_at as createdAt, actor_name as actorName, actor_role as actorRole,
              entity_type as entityType, entity_label as entityLabel, action, summary
            FROM activity_logs
            ORDER BY created_at DESC
            LIMIT 1000
          `)
          .all() as Array<Record<string, unknown>>;
        headers = [
          { key: 'createdAt', label: 'Horodatage ISO' },
          { key: 'actorName', label: 'Utilisateur' },
          { key: 'actorRole', label: 'Rôle' },
          { key: 'entityType', label: 'Module' },
          { key: 'entityLabel', label: 'Objet' },
          { key: 'action', label: 'Code Action' },
          { key: 'summary', label: 'Description' },
        ];
      }

      // Enregistrement systématique dans le journal d'audit de chaque export réalisé
      recordActivity({
        actor,
        entityType: 'EXPORT',
        entityId: `exp-${entity}-${Date.now()}`,
        entityLabel: `Export ${entity.toUpperCase()} (${format.toUpperCase()})`,
        action: 'DATA_EXPORTED',
        summary: `Export ${format.toUpperCase()} de ${rows.length} enregistrement(s) [${entity}] généré par ${actor.name} (${actor.role})`,
        details: {
          entity,
          format,
          rowCount: rows.length,
          restrictedToOwner: perm.restrictToOwnerId || 'ALL',
        },
      });

      const dateSlug = new Date().toISOString().slice(0, 10);
      if (format === 'json') {
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.setHeader(
          'Content-Disposition',
          `attachment; filename="mercator-export-${entity}-${dateSlug}.json"`
        );
        res.send(
          JSON.stringify(
            {
              metadata: {
                exportedAt: new Date().toISOString(),
                exportedBy: { id: actor.id, name: actor.name, role: actor.role },
                entity,
                scope: perm.restrictToOwnerId ? 'OWNED_ONLY' : 'GLOBAL',
                count: rows.length,
              },
              data: rows,
            },
            null,
            2
          )
        );
        return;
      }

      const csv = generateCsvContent(headers, rows);
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="mercator-export-${entity}-${dateSlug}.csv"`
      );
      res.send(csv);
    } catch (error) {
      console.error('Erreur GET /api/export:', error);
      res.status(500).json({ error: "Erreur lors de la génération de l'export contrôlé." });
    }
  });

  return app;
}

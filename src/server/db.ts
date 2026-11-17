/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Couche de persistance relationnelle SQLite (better-sqlite3)
 * - Schéma normalisé avec clés étrangères, index et contraintes CHECK
 * - Migrations automatiques idempotentes au démarrage
 * - Données synthétiques réalistes pour PME française (zéro donnée personnelle réelle)
 */

import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
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
import {
  calculateDocumentTotals,
  calculateInvoiceBalance,
  calculateWeightedOpportunityAmount,
} from './services/calculations.ts';

let dbInstance: Database.Database | null = null;

export function getDb(customPath?: string): Database.Database {
  if (dbInstance && !customPath) {
    return dbInstance;
  }

  const resolvedPath =
    customPath ||
    (process.env.NODE_ENV === 'test'
      ? ':memory:'
      : process.env.DB_PATH || path.resolve(process.cwd(), 'data', 'mercator.sqlite'));

  if (resolvedPath !== ':memory:') {
    const dir = path.dirname(resolvedPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  const db = new Database(resolvedPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  runMigrations(db);
  seedIfEmpty(db);

  if (!customPath) {
    dbInstance = db;
  }
  return db;
}

export function resetDbForTests(): Database.Database {
  if (dbInstance) {
    try {
      dbInstance.close();
    } catch {
      // ignore close errors
    }
  }
  dbInstance = getDb(':memory:');
  return dbInstance;
}

export function runMigrations(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      role TEXT NOT NULL CHECK(role IN ('ADMIN', 'MANAGER', 'SALES')),
      title TEXT NOT NULL,
      active INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS contacts (
      id TEXT PRIMARY KEY,
      company_name TEXT NOT NULL,
      contact_name TEXT NOT NULL,
      email TEXT NOT NULL,
      phone TEXT NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('PROSPECT', 'QUALIFIED_PROSPECT', 'ACTIVE_CLIENT', 'CHURNED')),
      industry TEXT NOT NULL,
      city TEXT NOT NULL,
      country TEXT NOT NULL DEFAULT 'France',
      vat_number TEXT NOT NULL DEFAULT '',
      source TEXT NOT NULL DEFAULT 'Entrant',
      owner_id TEXT NOT NULL REFERENCES users(id),
      notes TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_contacts_status ON contacts(status);
    CREATE INDEX IF NOT EXISTS idx_contacts_owner ON contacts(owner_id);

    CREATE TABLE IF NOT EXISTS opportunities (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      contact_id TEXT NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
      stage TEXT NOT NULL CHECK(stage IN ('QUALIFICATION', 'DISCOVERY', 'PROPOSAL', 'NEGOTIATION', 'WON', 'LOST')),
      estimated_amount_ht REAL NOT NULL DEFAULT 0,
      probability INTEGER NOT NULL DEFAULT 20,
      weighted_amount_ht REAL NOT NULL DEFAULT 0,
      expected_close_date TEXT NOT NULL,
      owner_id TEXT NOT NULL REFERENCES users(id),
      notes TEXT NOT NULL DEFAULT '',
      loss_reason TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_opportunities_stage ON opportunities(stage);
    CREATE INDEX IF NOT EXISTS idx_opportunities_contact ON opportunities(contact_id);

    CREATE TABLE IF NOT EXISTS quotes (
      id TEXT PRIMARY KEY,
      reference TEXT NOT NULL UNIQUE,
      contact_id TEXT NOT NULL REFERENCES contacts(id) ON DELETE RESTRICT,
      opportunity_id TEXT REFERENCES opportunities(id) ON DELETE SET NULL,
      status TEXT NOT NULL CHECK(status IN ('DRAFT', 'SENT', 'ACCEPTED', 'REJECTED', 'EXPIRED')),
      issue_date TEXT NOT NULL,
      valid_until TEXT NOT NULL,
      subtotal_ht REAL NOT NULL DEFAULT 0,
      total_discount_ht REAL NOT NULL DEFAULT 0,
      net_ht REAL NOT NULL DEFAULT 0,
      total_tax_amount REAL NOT NULL DEFAULT 0,
      total_ttc REAL NOT NULL DEFAULT 0,
      notes TEXT NOT NULL DEFAULT '',
      terms TEXT NOT NULL DEFAULT '',
      owner_id TEXT NOT NULL REFERENCES users(id),
      converted_invoice_id TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS quote_lines (
      id TEXT PRIMARY KEY,
      quote_id TEXT NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
      position INTEGER NOT NULL DEFAULT 0,
      description TEXT NOT NULL,
      quantity REAL NOT NULL,
      unit_price_ht REAL NOT NULL,
      discount_percent REAL NOT NULL DEFAULT 0,
      tax_rate REAL NOT NULL DEFAULT 20,
      line_subtotal_ht REAL NOT NULL,
      line_discount_ht REAL NOT NULL,
      line_net_ht REAL NOT NULL,
      line_tax_amount REAL NOT NULL,
      line_total_ttc REAL NOT NULL
    );

    CREATE TABLE IF NOT EXISTS invoices (
      id TEXT PRIMARY KEY,
      reference TEXT NOT NULL UNIQUE,
      quote_id TEXT REFERENCES quotes(id) ON DELETE SET NULL,
      contact_id TEXT NOT NULL REFERENCES contacts(id) ON DELETE RESTRICT,
      status TEXT NOT NULL CHECK(status IN ('DRAFT', 'ISSUED', 'PARTIALLY_PAID', 'PAID', 'OVERDUE', 'CANCELLED')),
      issue_date TEXT NOT NULL,
      due_date TEXT NOT NULL,
      paid_at TEXT,
      subtotal_ht REAL NOT NULL DEFAULT 0,
      total_discount_ht REAL NOT NULL DEFAULT 0,
      net_ht REAL NOT NULL DEFAULT 0,
      total_tax_amount REAL NOT NULL DEFAULT 0,
      total_ttc REAL NOT NULL DEFAULT 0,
      amount_paid REAL NOT NULL DEFAULT 0,
      balance_due REAL NOT NULL DEFAULT 0,
      payment_method TEXT NOT NULL DEFAULT 'Virement SEPA',
      notes TEXT NOT NULL DEFAULT '',
      owner_id TEXT NOT NULL REFERENCES users(id),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS invoice_lines (
      id TEXT PRIMARY KEY,
      invoice_id TEXT NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
      position INTEGER NOT NULL DEFAULT 0,
      description TEXT NOT NULL,
      quantity REAL NOT NULL,
      unit_price_ht REAL NOT NULL,
      discount_percent REAL NOT NULL DEFAULT 0,
      tax_rate REAL NOT NULL DEFAULT 20,
      line_subtotal_ht REAL NOT NULL,
      line_discount_ht REAL NOT NULL,
      line_net_ht REAL NOT NULL,
      line_tax_amount REAL NOT NULL,
      line_total_ttc REAL NOT NULL
    );

    CREATE TABLE IF NOT EXISTS follow_up_tasks (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      type TEXT NOT NULL CHECK(type IN ('CALL', 'EMAIL', 'MEETING', 'QUOTE_FOLLOWUP', 'INVOICE_REMINDER')),
      priority TEXT NOT NULL CHECK(priority IN ('LOW', 'MEDIUM', 'HIGH', 'URGENT')),
      status TEXT NOT NULL CHECK(status IN ('TODO', 'IN_PROGRESS', 'DONE')),
      due_date TEXT NOT NULL,
      completed_at TEXT,
      contact_id TEXT REFERENCES contacts(id) ON DELETE CASCADE,
      opportunity_id TEXT REFERENCES opportunities(id) ON DELETE SET NULL,
      quote_id TEXT REFERENCES quotes(id) ON DELETE SET NULL,
      invoice_id TEXT REFERENCES invoices(id) ON DELETE SET NULL,
      assignee_id TEXT NOT NULL REFERENCES users(id),
      created_by_id TEXT NOT NULL REFERENCES users(id),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS activity_logs (
      id TEXT PRIMARY KEY,
      entity_type TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      entity_label TEXT NOT NULL,
      action TEXT NOT NULL,
      summary TEXT NOT NULL,
      details_json TEXT NOT NULL DEFAULT '{}',
      actor_id TEXT NOT NULL REFERENCES users(id),
      actor_name TEXT NOT NULL,
      actor_role TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_activity_created ON activity_logs(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_activity_entity ON activity_logs(entity_type, entity_id);
  `);
}

export function seedIfEmpty(db: Database.Database): void {
  const countRow = db.prepare('SELECT COUNT(*) as cnt FROM users').get() as { cnt: number };
  if (countRow.cnt > 0) {
    return;
  }

  const now = '2026-11-16T09:00:00.000Z';

  const insertUser = db.prepare(`
    INSERT INTO users (id, name, email, role, title, active)
    VALUES (@id, @name, @email, @role, @title, 1)
  `);

  const users = [
    {
      id: 'usr-admin',
      name: 'Claire Vance',
      email: 'claire.vance@mercator-demo.fr',
      role: Role.ADMIN,
      title: 'Directrice Générale & Administratrice',
    },
    {
      id: 'usr-manager',
      name: 'Marc Delacroix',
      email: 'marc.delacroix@mercator-demo.fr',
      role: Role.MANAGER,
      title: 'Directeur Commercial',
    },
    {
      id: 'usr-sales-1',
      name: 'Lucas Moreau',
      email: 'lucas.moreau@mercator-demo.fr',
      role: Role.SALES,
      title: 'Chargé de Comptes Grands Projets',
    },
    {
      id: 'usr-sales-2',
      name: 'Sofia Benali',
      email: 'sofia.benali@mercator-demo.fr',
      role: Role.SALES,
      title: 'Ingénieure Commerciale PME',
    },
  ];

  const insertContact = db.prepare(`
    INSERT INTO contacts (
      id, company_name, contact_name, email, phone, status, industry,
      city, country, vat_number, source, owner_id, notes, created_at, updated_at
    ) VALUES (
      @id, @companyName, @contactName, @email, @phone, @status, @industry,
      @city, @country, @vatNumber, @source, @ownerId, @notes, @createdAt, @updatedAt
    )
  `);

  const contacts = [
    {
      id: 'cnt-1',
      companyName: 'Atelier Lumière & Architecture SAS',
      contactName: 'Hélène Rochefort',
      email: 'h.rochefort@atelier-lumiere-example.fr',
      phone: '+33 4 72 10 45 80',
      status: ContactStatus.ACTIVE_CLIENT,
      industry: 'Architecture & Ingénierie',
      city: 'Lyon',
      country: 'France',
      vatNumber: 'FR42819203411',
      source: 'Recommandation partenaire',
      ownerId: 'usr-sales-1',
      notes: 'Client historique depuis 2025. Contrat cadre annuel pour équipements bureaux et licences.',
      createdAt: '2026-09-10T10:15:00.000Z',
      updatedAt: '2026-11-10T14:30:00.000Z',
    },
    {
      id: 'cnt-2',
      companyName: 'BioVallee Logistique Froide',
      contactName: 'Antoine Garnier',
      email: 'a.garnier@biovallee-logistique-example.fr',
      phone: '+33 4 75 88 12 90',
      status: ContactStatus.ACTIVE_CLIENT,
      industry: 'Transport & Chaîne du froid',
      city: 'Valence',
      country: 'France',
      vatNumber: 'FR89502918374',
      source: 'Salon professionnel Pollutec',
      ownerId: 'usr-sales-1',
      notes: 'Équipe de 45 chauffeurs. Déploiement télémétrie en 2 phases.',
      createdAt: '2026-09-18T08:40:00.000Z',
      updatedAt: '2026-11-12T16:20:00.000Z',
    },
    {
      id: 'cnt-3',
      companyName: 'Menuiserie Contemporaine du Nord',
      contactName: 'Thierry Vasseur',
      email: 't.vasseur@mcn-bois-example.fr',
      phone: '+33 3 20 54 31 09',
      status: ContactStatus.QUALIFIED_PROSPECT,
      industry: 'Industrie & Menuiserie',
      city: 'Lille',
      country: 'France',
      vatNumber: 'FR19443829102',
      source: 'Demande site web',
      ownerId: 'usr-sales-2',
      notes: 'Besoin validé pour refonte ERP atelier et suivi de chantier. Budget confirmé pour T4.',
      createdAt: '2026-10-04T11:00:00.000Z',
      updatedAt: '2026-11-14T09:10:00.000Z',
    },
    {
      id: 'cnt-4',
      companyName: 'Clinique Vétérinaire des Cèdres',
      contactName: 'Dr. Camille Deschamps',
      email: 'c.deschamps@vet-cedres-example.fr',
      phone: '+33 2 40 71 22 65',
      status: ContactStatus.ACTIVE_CLIENT,
      industry: 'Santé animale',
      city: 'Nantes',
      country: 'France',
      vatNumber: 'FR63771920485',
      source: 'Campagne LinkedIn',
      ownerId: 'usr-sales-2',
      notes: '3 sites en Loire-Atlantique. Facturation centralisée mensuelle.',
      createdAt: '2026-10-12T15:20:00.000Z',
      updatedAt: '2026-11-15T11:45:00.000Z',
    },
    {
      id: 'cnt-5',
      companyName: 'Torréfaction Maritime Bordelaise',
      contactName: 'Julien Lemaire',
      email: 'j.lemaire@torrefaction-maritime-example.fr',
      phone: '+33 5 56 44 89 12',
      status: ContactStatus.PROSPECT,
      industry: 'Agroalimentaire & Distribution B2B',
      city: 'Bordeaux',
      country: 'France',
      vatNumber: 'FR55891029384',
      source: 'Prospection directe',
      ownerId: 'usr-sales-1',
      notes: 'Premier échange téléphonique positif. Souhaite une démonstration début décembre.',
      createdAt: '2026-11-02T14:00:00.000Z',
      updatedAt: '2026-11-14T17:00:00.000Z',
    },
    {
      id: 'cnt-6',
      companyName: 'Optique & Précision Horlogère Franc-Comtoise',
      contactName: 'Élodie Marchand',
      email: 'e.marchand@oph-precision-example.fr',
      phone: '+33 3 81 60 18 44',
      status: ContactStatus.QUALIFIED_PROSPECT,
      industry: 'Microtechnique & Luxe',
      city: 'Besançon',
      country: 'France',
      vatNumber: 'FR77391028475',
      source: 'Salon Micronora',
      ownerId: 'usr-sales-2',
      notes: 'Cahier des charges reçu. En attente de validation technique du devis.',
      createdAt: '2026-10-22T09:30:00.000Z',
      updatedAt: '2026-11-15T16:10:00.000Z',
    },
  ];

  const insertOpportunity = db.prepare(`
    INSERT INTO opportunities (
      id, title, contact_id, stage, estimated_amount_ht, probability,
      weighted_amount_ht, expected_close_date, owner_id, notes, loss_reason, created_at, updated_at
    ) VALUES (
      @id, @title, @contactId, @stage, @estimatedAmountHt, @probability,
      @weightedAmountHt, @expectedCloseDate, @ownerId, @notes, @lossReason, @createdAt, @updatedAt
    )
  `);

  const opportunities = [
    {
      id: 'opp-1',
      title: 'Déploiement Suite Collaborative & Postes CAO (18 licences)',
      contactId: 'cnt-1',
      stage: OpportunityStage.WON,
      estimatedAmountHt: 24600,
      probability: 100,
      expectedCloseDate: '2026-10-28',
      ownerId: 'usr-sales-1',
      notes: 'Signé et facturé avec acompte puis solde réglé.',
      lossReason: '',
      createdAt: '2026-09-15T10:00:00.000Z',
      updatedAt: '2026-10-28T17:30:00.000Z',
    },
    {
      id: 'opp-2',
      title: 'Équipement Capteurs Chaîne du Froid — Flotte Rhône-Alpes',
      contactId: 'cnt-2',
      stage: OpportunityStage.WON,
      estimatedAmountHt: 18500,
      probability: 100,
      expectedCloseDate: '2026-11-05',
      ownerId: 'usr-sales-1',
      notes: 'Commande validée. Facture émise, premier acompte encaissé.',
      lossReason: '',
      createdAt: '2026-09-25T11:30:00.000Z',
      updatedAt: '2026-11-05T15:00:00.000Z',
    },
    {
      id: 'opp-3',
      title: 'Informatisation Atelier & Terminaux Durcis MCN',
      contactId: 'cnt-3',
      stage: OpportunityStage.NEGOTIATION,
      estimatedAmountHt: 32400,
      probability: 75,
      expectedCloseDate: '2026-11-28',
      ownerId: 'usr-sales-2',
      notes: 'Devis DEV-2026-003 envoyé. Négociation sur le calendrier de formation sur site.',
      lossReason: '',
      createdAt: '2026-10-10T09:00:00.000Z',
      updatedAt: '2026-11-14T14:20:00.000Z',
    },
    {
      id: 'opp-4',
      title: 'Portail Prise de RDV & Passerelle Facturation Multi-Sites',
      contactId: 'cnt-4',
      stage: OpportunityStage.PROPOSAL,
      estimatedAmountHt: 14200,
      probability: 60,
      expectedCloseDate: '2026-12-05',
      ownerId: 'usr-sales-2',
      notes: 'Proposition financière présentée au comité des associés.',
      lossReason: '',
      createdAt: '2026-10-18T14:00:00.000Z',
      updatedAt: '2026-11-15T10:00:00.000Z',
    },
    {
      id: 'opp-5',
      title: 'Traçabilité Lots & Module Contrôle Qualité Optique',
      contactId: 'cnt-6',
      stage: OpportunityStage.DISCOVERY,
      estimatedAmountHt: 28000,
      probability: 40,
      expectedCloseDate: '2026-12-18',
      ownerId: 'usr-sales-2',
      notes: 'Atelier de cadrage technique planifié avec le responsable qualité.',
      lossReason: '',
      createdAt: '2026-10-29T16:00:00.000Z',
      updatedAt: '2026-11-15T16:30:00.000Z',
    },
    {
      id: 'opp-6',
      title: 'Solution CRM & Gestion Commandes Cafés Grands Comptes',
      contactId: 'cnt-5',
      stage: OpportunityStage.QUALIFICATION,
      estimatedAmountHt: 9800,
      probability: 25,
      expectedCloseDate: '2027-01-15',
      ownerId: 'usr-sales-1',
      notes: 'Qualification du périmètre fonctionnel et du nombre de commerciaux itinérants.',
      lossReason: '',
      createdAt: '2026-11-04T10:30:00.000Z',
      updatedAt: '2026-11-14T17:15:00.000Z',
    },
  ];

  const insertQuote = db.prepare(`
    INSERT INTO quotes (
      id, reference, contact_id, opportunity_id, status, issue_date, valid_until,
      subtotal_ht, total_discount_ht, net_ht, total_tax_amount, total_ttc,
      notes, terms, owner_id, converted_invoice_id, created_at, updated_at
    ) VALUES (
      @id, @reference, @contactId, @opportunityId, @status, @issueDate, @validUntil,
      @subtotalHt, @totalDiscountHt, @netHt, @totalTaxAmount, @totalTtc,
      @notes, @terms, @ownerId, @convertedInvoiceId, @createdAt, @updatedAt
    )
  `);

  const insertQuoteLine = db.prepare(`
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

  const insertInvoice = db.prepare(`
    INSERT INTO invoices (
      id, reference, quote_id, contact_id, status, issue_date, due_date, paid_at,
      subtotal_ht, total_discount_ht, net_ht, total_tax_amount, total_ttc,
      amount_paid, balance_due, payment_method, notes, owner_id, created_at, updated_at
    ) VALUES (
      @id, @reference, @quoteId, @contactId, @status, @issueDate, @dueDate, @paidAt,
      @subtotalHt, @totalDiscountHt, @netHt, @totalTaxAmount, @totalTtc,
      @amountPaid, @balanceDue, @paymentMethod, @notes, @ownerId, @createdAt, @updatedAt
    )
  `);

  const insertInvoiceLine = db.prepare(`
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

  const insertTask = db.prepare(`
    INSERT INTO follow_up_tasks (
      id, title, description, type, priority, status, due_date, completed_at,
      contact_id, opportunity_id, quote_id, invoice_id, assignee_id, created_by_id, created_at, updated_at
    ) VALUES (
      @id, @title, @description, @type, @priority, @status, @dueDate, @completedAt,
      @contactId, @opportunityId, @quoteId, @invoiceId, @assigneeId, @createdById, @createdAt, @updatedAt
    )
  `);

  const insertActivity = db.prepare(`
    INSERT INTO activity_logs (
      id, entity_type, entity_id, entity_label, action, summary,
      details_json, actor_id, actor_name, actor_role, created_at
    ) VALUES (
      @id, @entityType, @entityId, @entityLabel, @action, @summary,
      @detailsJson, @actorId, @actorName, @actorRole, @createdAt
    )
  `);

  const seedTransaction = db.transaction(() => {
    for (const u of users) {
      insertUser.run(u);
    }
    for (const c of contacts) {
      insertContact.run(c);
    }
    for (const o of opportunities) {
      const calc = calculateWeightedOpportunityAmount(o.estimatedAmountHt, o.probability, o.stage);
      insertOpportunity.run({
        ...o,
        probability: calc.probability,
        weightedAmountHt: calc.weightedAmountHt,
      });
    }

    // Devis 1 : Atelier Lumière (Accepté et converti en facture FAC-2026-001)
    const q1Calc = calculateDocumentTotals([
      {
        id: 'ql-101',
        description: 'Licences Annuelles Suite Collaborative & Passerelle BIM (18 postes)',
        quantity: 18,
        unitPriceHt: 1100,
        discountPercent: 5,
        taxRate: 20,
      },
      {
        id: 'ql-102',
        description: 'Prestation de migration serveur, paramétrage sécurité et formation équipes',
        quantity: 5,
        unitPriceHt: 1158,
        discountPercent: 0,
        taxRate: 20,
      },
    ]);

    insertQuote.run({
      id: 'quo-1',
      reference: 'DEV-2026-001',
      contactId: 'cnt-1',
      opportunityId: 'opp-1',
      status: QuoteStatus.ACCEPTED,
      issueDate: '2026-10-12',
      validUntil: '2026-11-12',
      subtotalHt: q1Calc.subtotalHt,
      totalDiscountHt: q1Calc.totalDiscountHt,
      netHt: q1Calc.netHt,
      totalTaxAmount: q1Calc.totalTaxAmount,
      totalTtc: q1Calc.totalTtc,
      notes: 'Déploiement planifié sur deux vendredis après-midi sans coupure de production.',
      terms: 'Acompte de 40% à la commande, solde à 30 jours fin de mois.',
      ownerId: 'usr-sales-1',
      convertedInvoiceId: 'inv-1',
      createdAt: '2026-10-12T10:00:00.000Z',
      updatedAt: '2026-10-28T16:00:00.000Z',
    });

    q1Calc.lines.forEach((line, idx) => {
      insertQuoteLine.run({
        ...line,
        quoteId: 'quo-1',
        position: idx + 1,
      });
    });

    // Devis 2 : BioVallee Logistique (Accepté et converti en facture FAC-2026-002)
    const q2Calc = calculateDocumentTotals([
      {
        id: 'ql-201',
        description: 'Boîtiers télémétriques multi-sondes certifiés EN-12830',
        quantity: 30,
        unitPriceHt: 480,
        discountPercent: 0,
        taxRate: 20,
      },
      {
        id: 'ql-202',
        description: 'Abonnement plateforme supervision alertes SMS/Email (12 mois)',
        quantity: 1,
        unitPriceHt: 4100,
        discountPercent: 0,
        taxRate: 20,
      },
    ]);

    insertQuote.run({
      id: 'quo-2',
      reference: 'DEV-2026-002',
      contactId: 'cnt-2',
      opportunityId: 'opp-2',
      status: QuoteStatus.ACCEPTED,
      issueDate: '2026-10-25',
      validUntil: '2026-11-25',
      subtotalHt: q2Calc.subtotalHt,
      totalDiscountHt: q2Calc.totalDiscountHt,
      netHt: q2Calc.netHt,
      totalTaxAmount: q2Calc.totalTaxAmount,
      totalTtc: q2Calc.totalTtc,
      notes: 'Installation sur dépôt de Valence incluse.',
      terms: 'Paiement à 30 jours net par virement SEPA.',
      ownerId: 'usr-sales-1',
      convertedInvoiceId: 'inv-2',
      createdAt: '2026-10-25T14:20:00.000Z',
      updatedAt: '2026-11-05T11:15:00.000Z',
    });

    q2Calc.lines.forEach((line, idx) => {
      insertQuoteLine.run({
        ...line,
        quoteId: 'quo-2',
        position: idx + 1,
      });
    });

    // Devis 3 : Menuiserie Contemporaine du Nord (Envoyé, en attente de signature)
    const q3Calc = calculateDocumentTotals([
      {
        id: 'ql-301',
        description: 'Terminaux atelier durcis IP65 + lecteurs codes-barres sans fil',
        quantity: 12,
        unitPriceHt: 1450,
        discountPercent: 5,
        taxRate: 20,
      },
      {
        id: 'ql-302',
        description: 'Module ERP Planification & Ordonnancement Production Bois',
        quantity: 1,
        unitPriceHt: 12000,
        discountPercent: 0,
        taxRate: 20,
      },
      {
        id: 'ql-303',
        description: 'Formation opérateurs et chefs d’équipe sur site (Lille)',
        quantity: 4,
        unitPriceHt: 967.5,
        discountPercent: 0,
        taxRate: 20,
      },
    ]);

    insertQuote.run({
      id: 'quo-3',
      reference: 'DEV-2026-003',
      contactId: 'cnt-3',
      opportunityId: 'opp-3',
      status: QuoteStatus.SENT,
      issueDate: '2026-11-08',
      validUntil: '2026-12-08',
      subtotalHt: q3Calc.subtotalHt,
      totalDiscountHt: q3Calc.totalDiscountHt,
      netHt: q3Calc.netHt,
      totalTaxAmount: q3Calc.totalTaxAmount,
      totalTtc: q3Calc.totalTtc,
      notes: 'Remise commerciale de 5% appliquée sur le matériel matériel durci.',
      terms: '30% à la signature, 70% à la mise en service.',
      ownerId: 'usr-sales-2',
      convertedInvoiceId: null,
      createdAt: '2026-11-08T09:45:00.000Z',
      updatedAt: '2026-11-08T09:45:00.000Z',
    });

    q3Calc.lines.forEach((line, idx) => {
      insertQuoteLine.run({
        ...line,
        quoteId: 'quo-3',
        position: idx + 1,
      });
    });

    // Devis 4 : Clinique Vétérinaire des Cèdres (Envoyé)
    const q4Calc = calculateDocumentTotals([
      {
        id: 'ql-401',
        description: 'Portail Patient & Synchronisation Agenda Multi-Cliniques',
        quantity: 3,
        unitPriceHt: 3600,
        discountPercent: 0,
        taxRate: 20,
      },
      {
        id: 'ql-402',
        description: 'Reprise d’historique dossiers clients et paramétrage relances SMS',
        quantity: 2,
        unitPriceHt: 1700,
        discountPercent: 0,
        taxRate: 20,
      },
    ]);

    insertQuote.run({
      id: 'quo-4',
      reference: 'DEV-2026-004',
      contactId: 'cnt-4',
      opportunityId: 'opp-4',
      status: QuoteStatus.SENT,
      issueDate: '2026-11-12',
      validUntil: '2026-12-12',
      subtotalHt: q4Calc.subtotalHt,
      totalDiscountHt: q4Calc.totalDiscountHt,
      netHt: q4Calc.netHt,
      totalTaxAmount: q4Calc.totalTaxAmount,
      totalTtc: q4Calc.totalTtc,
      notes: 'Inclut la connectivité pour les sites de Nantes Centre, Orvault et Rezé.',
      terms: 'Paiement à 30 jours.',
      ownerId: 'usr-sales-2',
      convertedInvoiceId: null,
      createdAt: '2026-11-12T15:00:00.000Z',
      updatedAt: '2026-11-12T15:00:00.000Z',
    });

    q4Calc.lines.forEach((line, idx) => {
      insertQuoteLine.run({
        ...line,
        quoteId: 'quo-4',
        position: idx + 1,
      });
    });

    // Facture 1 : Atelier Lumière (Payée intégralement)
    const inv1Bal = calculateInvoiceBalance(q1Calc.totalTtc, q1Calc.totalTtc, '2026-11-10', InvoiceStatus.PAID, now);
    insertInvoice.run({
      id: 'inv-1',
      reference: 'FAC-2026-001',
      quoteId: 'quo-1',
      contactId: 'cnt-1',
      status: inv1Bal.computedStatus,
      issueDate: '2026-10-28',
      dueDate: '2026-11-10',
      paidAt: '2026-11-09T11:20:00.000Z',
      subtotalHt: q1Calc.subtotalHt,
      totalDiscountHt: q1Calc.totalDiscountHt,
      netHt: q1Calc.netHt,
      totalTaxAmount: q1Calc.totalTaxAmount,
      totalTtc: q1Calc.totalTtc,
      amountPaid: inv1Bal.amountPaid,
      balanceDue: inv1Bal.balanceDue,
      paymentMethod: 'Virement SEPA',
      notes: 'Facture acquittée par virement bancaire réf. VIR-LYON-8821.',
      ownerId: 'usr-sales-1',
      createdAt: '2026-10-28T16:15:00.000Z',
      updatedAt: '2026-11-09T11:20:00.000Z',
    });

    q1Calc.lines.forEach((line, idx) => {
      insertInvoiceLine.run({
        ...line,
        id: `il-10${idx + 1}`,
        invoiceId: 'inv-1',
        position: idx + 1,
      });
    });

    // Facture 2 : BioVallee Logistique (Partiellement payée, échéance future)
    const inv2Bal = calculateInvoiceBalance(q2Calc.totalTtc, 11100, '2026-12-05', InvoiceStatus.PARTIALLY_PAID, now);
    insertInvoice.run({
      id: 'inv-2',
      reference: 'FAC-2026-002',
      quoteId: 'quo-2',
      contactId: 'cnt-2',
      status: inv2Bal.computedStatus,
      issueDate: '2026-11-05',
      dueDate: '2026-12-05',
      paidAt: null,
      subtotalHt: q2Calc.subtotalHt,
      totalDiscountHt: q2Calc.totalDiscountHt,
      netHt: q2Calc.netHt,
      totalTaxAmount: q2Calc.totalTaxAmount,
      totalTtc: q2Calc.totalTtc,
      amountPaid: inv2Bal.amountPaid,
      balanceDue: inv2Bal.balanceDue,
      paymentMethod: 'Virement SEPA',
      notes: 'Acompte de 50% (11 100,00 € TTC) reçu le 07/11/2026. Solde à échéance du 05/12/2026.',
      ownerId: 'usr-sales-1',
      createdAt: '2026-11-05T14:00:00.000Z',
      updatedAt: '2026-11-07T09:30:00.000Z',
    });

    q2Calc.lines.forEach((line, idx) => {
      insertInvoiceLine.run({
        ...line,
        id: `il-20${idx + 1}`,
        invoiceId: 'inv-2',
        position: idx + 1,
      });
    });

    // Facture 3 : Clinique Vétérinaire des Cèdres (En retard de paiement — OVERDUE)
    const inv3Calc = calculateDocumentTotals([
      {
        id: 'il-301',
        description: 'Audit d’infrastructure réseau et sécurité RGPD des 3 cliniques',
        quantity: 3,
        unitPriceHt: 1650,
        discountPercent: 0,
        taxRate: 20,
      },
    ]);
    const inv3Bal = calculateInvoiceBalance(inv3Calc.totalTtc, 0, '2026-11-05', InvoiceStatus.OVERDUE, now);
    insertInvoice.run({
      id: 'inv-3',
      reference: 'FAC-2026-003',
      quoteId: null,
      contactId: 'cnt-4',
      status: inv3Bal.computedStatus,
      issueDate: '2026-10-05',
      dueDate: '2026-11-05',
      paidAt: null,
      subtotalHt: inv3Calc.subtotalHt,
      totalDiscountHt: inv3Calc.totalDiscountHt,
      netHt: inv3Calc.netHt,
      totalTaxAmount: inv3Calc.totalTaxAmount,
      totalTtc: inv3Calc.totalTtc,
      amountPaid: inv3Bal.amountPaid,
      balanceDue: inv3Bal.balanceDue,
      paymentMethod: 'Virement SEPA',
      notes: 'Échéance dépassée de 11 jours. Relance comptable programmée.',
      ownerId: 'usr-sales-2',
      createdAt: '2026-10-05T11:00:00.000Z',
      updatedAt: '2026-11-06T08:00:00.000Z',
    });

    inv3Calc.lines.forEach((line, idx) => {
      insertInvoiceLine.run({
        ...line,
        id: `il-30${idx + 1}`,
        invoiceId: 'inv-3',
        position: idx + 1,
      });
    });

    // Tâches de relance commerciales et comptables
    const tasks = [
      {
        id: 'tsk-1',
        title: 'Relancer Dr. Deschamps pour règlement facture échue FAC-2026-003',
        description: 'Échéance dépassée depuis le 05/11 (5 940,00 € TTC). Vérifier si le RIB a bien été validé par leur cabinet comptable.',
        type: TaskType.INVOICE_REMINDER,
        priority: TaskPriority.URGENT,
        status: TaskStatus.TODO,
        dueDate: '2026-11-14',
        completedAt: null,
        contactId: 'cnt-4',
        opportunityId: null,
        quoteId: null,
        invoiceId: 'inv-3',
        assigneeId: 'usr-sales-2',
        createdById: 'usr-manager',
        createdAt: '2026-11-10T09:00:00.000Z',
        updatedAt: '2026-11-10T09:00:00.000Z',
      },
      {
        id: 'tsk-2',
        title: 'Point téléphonique closing Devis DEV-2026-003 avec Thierry Vasseur',
        description: 'Valider le planning de déploiement des 12 terminaux atelier à Lille avant fin novembre.',
        type: TaskType.QUOTE_FOLLOWUP,
        priority: TaskPriority.HIGH,
        status: TaskStatus.IN_PROGRESS,
        dueDate: '2026-11-17',
        completedAt: null,
        contactId: 'cnt-3',
        opportunityId: 'opp-3',
        quoteId: 'quo-3',
        invoiceId: null,
        assigneeId: 'usr-sales-2',
        createdById: 'usr-sales-2',
        createdAt: '2026-11-12T10:30:00.000Z',
        updatedAt: '2026-11-15T14:00:00.000Z',
      },
      {
        id: 'tsk-3',
        title: 'Préparer la démonstration CRM pour Torréfaction Maritime Bordelaise',
        description: 'Focus sur la prise de commande mobile et la gestion des grilles tarifaires CHR.',
        type: TaskType.MEETING,
        priority: TaskPriority.MEDIUM,
        status: TaskStatus.TODO,
        dueDate: '2026-11-20',
        completedAt: null,
        contactId: 'cnt-5',
        opportunityId: 'opp-6',
        quoteId: null,
        invoiceId: null,
        assigneeId: 'usr-sales-1',
        createdById: 'usr-sales-1',
        createdAt: '2026-11-14T17:20:00.000Z',
        updatedAt: '2026-11-14T17:20:00.000Z',
      },
      {
        id: 'tsk-4',
        title: 'Envoyer le compte-rendu d’atelier technique à Élodie Marchand (OPH)',
        description: 'Inclure l’architecture de traçabilité des lots optiques et chiffrage préliminaire.',
        type: TaskType.EMAIL,
        priority: TaskPriority.HIGH,
        status: TaskStatus.TODO,
        dueDate: '2026-11-18',
        completedAt: null,
        contactId: 'cnt-6',
        opportunityId: 'opp-5',
        quoteId: null,
        invoiceId: null,
        assigneeId: 'usr-sales-2',
        createdById: 'usr-manager',
        createdAt: '2026-11-15T16:40:00.000Z',
        updatedAt: '2026-11-15T16:40:00.000Z',
      },
    ];

    for (const t of tasks) {
      insertTask.run(t);
    }

    // Historique d'activité et journal d'audit initial
    const activities = [
      {
        id: 'act-1',
        entityType: 'QUOTE',
        entityId: 'quo-1',
        entityLabel: 'DEV-2026-001 — Atelier Lumière & Architecture SAS',
        action: 'QUOTE_CONVERTED_TO_INVOICE',
        summary: 'Devis DEV-2026-001 accepté et converti en facture FAC-2026-001 (29 520,00 € TTC)',
        detailsJson: JSON.stringify({ quoteRef: 'DEV-2026-001', invoiceRef: 'FAC-2026-001', totalTtc: 29520 }),
        actorId: 'usr-sales-1',
        actorName: 'Lucas Moreau',
        actorRole: Role.SALES,
        createdAt: '2026-10-28T16:15:00.000Z',
      },
      {
        id: 'act-2',
        entityType: 'INVOICE',
        entityId: 'inv-2',
        entityLabel: 'FAC-2026-002 — BioVallee Logistique Froide',
        action: 'INVOICE_PAYMENT_RECORDED',
        summary: 'Encaissement partiel enregistré sur FAC-2026-002 : 11 100,00 € TTC (Solde restant : 11 100,00 € TTC)',
        detailsJson: JSON.stringify({ amountPaid: 11100, balanceDue: 11100, method: 'Virement SEPA' }),
        actorId: 'usr-manager',
        actorName: 'Marc Delacroix',
        actorRole: Role.MANAGER,
        createdAt: '2026-11-07T09:30:00.000Z',
      },
      {
        id: 'act-3',
        entityType: 'INVOICE',
        entityId: 'inv-1',
        entityLabel: 'FAC-2026-001 — Atelier Lumière & Architecture SAS',
        action: 'INVOICE_PAID_FULL',
        summary: 'Règlement intégral enregistré sur FAC-2026-001 : 29 520,00 € TTC',
        detailsJson: JSON.stringify({ amountPaid: 29520, balanceDue: 0, method: 'Virement SEPA' }),
        actorId: 'usr-admin',
        actorName: 'Claire Vance',
        actorRole: Role.ADMIN,
        createdAt: '2026-11-09T11:20:00.000Z',
      },
      {
        id: 'act-4',
        entityType: 'QUOTE',
        entityId: 'quo-4',
        entityLabel: 'DEV-2026-004 — Clinique Vétérinaire des Cèdres',
        action: 'QUOTE_SENT',
        summary: 'Création et envoi du devis DEV-2026-004 pour 14 200,00 € HT (17 040,00 € TTC)',
        detailsJson: JSON.stringify({ netHt: 14200, totalTtc: 17040 }),
        actorId: 'usr-sales-2',
        actorName: 'Sofia Benali',
        actorRole: Role.SALES,
        createdAt: '2026-11-12T15:00:00.000Z',
      },
      {
        id: 'act-5',
        entityType: 'OPPORTUNITY',
        entityId: 'opp-3',
        entityLabel: 'Informatisation Atelier & Terminaux Durcis MCN',
        action: 'STAGE_CHANGED',
        summary: 'Opportunité passée en étape Négociation (Probabilité : 75%, Pondéré : 24 300,00 € HT)',
        detailsJson: JSON.stringify({ stage: 'NEGOTIATION', probability: 75, weightedHt: 24300 }),
        actorId: 'usr-sales-2',
        actorName: 'Sofia Benali',
        actorRole: Role.SALES,
        createdAt: '2026-11-14T14:20:00.000Z',
      },
    ];

    for (const a of activities) {
      insertActivity.run(a);
    }
  });

  seedTransaction();
}

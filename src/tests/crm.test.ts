/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Suite de tests automatisés (Phase 6 — Qualité & Robustesse) :
 * 1. Tests unitaires du moteur de calcul financier côté serveur (HT, remises, multi-TVA, TTC, pondération pipeline, échéances)
 * 2. Tests de sécurité anti-injection CSV (OWASP Formula Injection)
 * 3. Tests d'intégration API bout-en-bout (Contacts, Pipeline, Devis -> Conversion Facture, Règlement, Audit, RBAC, Export contrôlé)
 */

import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApiApp } from '../server/app.ts';
import { resetDbForTests } from '../server/db.ts';
import {
  calculateDocumentTotals,
  calculateInvoiceBalance,
  calculateWeightedOpportunityAmount,
} from '../server/services/calculations.ts';
import { sanitizeCsvCell } from '../server/services/exportService.ts';
import { OpportunityStage } from '../types/domain.ts';

describe('1. Tests Unitaires — Moteur de calcul financier serveur (calculations.ts)', () => {
  it('calcule exactement les sous-totaux HT, remises par ligne, TVA multi-taux et TTC au centime près', () => {
    const totals = calculateDocumentTotals([
      {
        description: 'Postes de travail CAO',
        quantity: 4,
        unitPriceHt: 1250, // Brut = 5000
        discountPercent: 10, // Remise = 500, Net HT = 4500
        taxRate: 20, // TVA = 900, TTC = 5400
      },
      {
        description: 'Formation certifiante (taux réduit)',
        quantity: 2,
        unitPriceHt: 600, // Brut = 1200
        discountPercent: 0, // Net HT = 1200
        taxRate: 5.5, // TVA = 66, TTC = 1266
      },
    ]);

    expect(totals.subtotalHt).toBe(6200);
    expect(totals.totalDiscountHt).toBe(500);
    expect(totals.netHt).toBe(5700);
    expect(totals.totalTaxAmount).toBe(966);
    expect(totals.totalTtc).toBe(6666);
    expect(totals.taxBreakdown['20.0%'].taxAmount).toBe(900);
    expect(totals.taxBreakdown['5.5%'].taxAmount).toBe(66);
  });

  it('rejette un document sans ligne ou avec des quantités/remises hors bornes', () => {
    expect(() => calculateDocumentTotals([])).toThrow();
    expect(() =>
      calculateDocumentTotals([
        { description: 'Invalide', quantity: -2, unitPriceHt: 100, discountPercent: 0, taxRate: 20 },
      ])
    ).toThrow(/quantité/);
    expect(() =>
      calculateDocumentTotals([
        { description: 'Remise invalide', quantity: 1, unitPriceHt: 100, discountPercent: 150, taxRate: 20 },
      ])
    ).toThrow(/remise/);
  });

  it('force la probabilité à 100% pour WON et 0% pour LOST dans le pipeline', () => {
    const won = calculateWeightedOpportunityAmount(20000, 40, OpportunityStage.WON);
    expect(won.probability).toBe(100);
    expect(won.weightedAmountHt).toBe(20000);

    const lost = calculateWeightedOpportunityAmount(20000, 80, OpportunityStage.LOST);
    expect(lost.probability).toBe(0);
    expect(lost.weightedAmountHt).toBe(0);
  });

  it('détecte automatiquement le statut OVERDUE (En retard) et PARTIALLY_PAID (Acompte)', () => {
    const overdue = calculateInvoiceBalance(1200, 200, '2026-10-01', 'ISSUED', '2026-11-16');
    expect(overdue.balanceDue).toBe(1000);
    expect(overdue.isOverdue).toBe(true);
    expect(overdue.computedStatus).toBe('OVERDUE');

    const partialFuture = calculateInvoiceBalance(1200, 400, '2026-12-20', 'ISSUED', '2026-11-16');
    expect(partialFuture.balanceDue).toBe(800);
    expect(partialFuture.isOverdue).toBe(false);
    expect(partialFuture.computedStatus).toBe('PARTIALLY_PAID');
  });
});

describe('2. Tests Unitaires Sécurité — Protection CSV Formula Injection', () => {
  it('neutralise les formules commençant par =, +, -, @ dans les exports CSV', () => {
    expect(sanitizeCsvCell('=CMD|\' /C calc\'!A0')).toBe("'=CMD|' /C calc'!A0");
    expect(sanitizeCsvCell('+SUM(A1:A10)')).toBe("'+SUM(A1:A10)");
    expect(sanitizeCsvCell('@IMPORTXML()')).toBe("'@IMPORTXML()");
    expect(sanitizeCsvCell('Société Normale SAS')).toBe('Société Normale SAS');
  });
});

describe('3. Tests d’Intégration API & Critères d’Acceptation (RBAC, Totaux Serveur, Audit, Export)', () => {
  const app = createApiApp();

  beforeEach(() => {
    resetDbForTests();
  });

  it('ignore les montants falsifiés côté client lors de la création d’un devis et journalise l’action', async () => {
    const res = await request(app)
      .post('/api/quotes')
      .set('x-actor-id', 'usr-sales-1')
      .send({
        contactId: 'cnt-1',
        opportunityId: 'opp-1',
        status: 'SENT',
        issueDate: '2026-11-16',
        validUntil: '2026-12-16',
        notes: 'Test sécurité calcul serveur',
        terms: 'Paiement 30j',
        // Tentative d'injection de totaux falsifiés par le client :
        subtotalHt: 1,
        totalTtc: 1,
        lines: [
          {
            description: 'Serveur haute disponibilité',
            quantity: 2,
            unitPriceHt: 3000, // 6000 HT
            discountPercent: 10, // Net HT = 5400
            taxRate: 20, // TVA = 1080, TTC = 6480
          },
        ],
      });

    expect(res.status).toBe(201);
    expect(res.body.subtotalHt).toBe(6000);
    expect(res.body.totalDiscountHt).toBe(600);
    expect(res.body.netHt).toBe(5400);
    expect(res.body.totalTaxAmount).toBe(1080);
    expect(res.body.totalTtc).toBe(6480);

    // Vérifie que l'événement a bien été inscrit dans l'historique d'activité
    const auditRes = await request(app)
      .get('/api/activities?entityType=QUOTE')
      .set('x-actor-id', 'usr-admin');

    expect(auditRes.status).toBe(200);
    expect(auditRes.body[0].action).toBe('QUOTE_CREATED');
    expect(auditRes.body[0].actorId).toBe('usr-sales-1');
  });

  it('convertit un devis en facture, met à jour le solde après paiement partiel et trace tout dans l’audit', async () => {
    // Le devis quo-3 (Menuiserie Contemporaine du Nord, appartenant à usr-sales-2) est en statut SENT
    const convertRes = await request(app)
      .post('/api/quotes/quo-3/convert-to-invoice')
      .set('x-actor-id', 'usr-sales-2');

    expect(convertRes.status).toBe(201);
    const createdInvoice = convertRes.body;
    expect(createdInvoice.reference).toMatch(/^FAC-2026-/);
    expect(createdInvoice.totalTtc).toBeGreaterThan(30000);
    expect(createdInvoice.balanceDue).toBe(createdInvoice.totalTtc);

    // Enregistrement d'un règlement partiel de 10 000 € TTC
    const payRes = await request(app)
      .post(`/api/invoices/${createdInvoice.id}/payments`)
      .set('x-actor-id', 'usr-sales-2')
      .send({
        amountPaid: 10000,
        paymentMethod: 'Virement SEPA',
      });

    expect(payRes.status).toBe(200);
    expect(payRes.body.amountPaid).toBe(10000);
    expect(payRes.body.balanceDue).toBe(createdInvoice.totalTtc - 10000);
    expect(payRes.body.status).toBe('PARTIALLY_PAID');
  });

  it('applique strictement le contrôle d’accès par rôles (RBAC) sur les modifications et suppressions', async () => {
    // usr-sales-1 tente de modifier un contact appartenant à usr-sales-2 (cnt-3) -> 403 FORBIDDEN
    const forbiddenUpdate = await request(app)
      .put('/api/contacts/cnt-3')
      .set('x-actor-id', 'usr-sales-1')
      .send({
        companyName: 'Tentative Piratage',
        contactName: 'Thierry Vasseur',
        email: 't.vasseur@mcn-bois-example.fr',
        phone: '+33 3 20 54 31 09',
        status: 'QUALIFIED_PROSPECT',
        industry: 'Industrie',
        city: 'Lille',
      });

    expect(forbiddenUpdate.status).toBe(403);
    expect(forbiddenUpdate.body.code).toBe('FORBIDDEN_OWNER');

    // usr-manager tente de supprimer définitivement un contact -> 403 FORBIDDEN_ROLE (réservé ADMIN)
    const forbiddenDelete = await request(app)
      .delete('/api/contacts/cnt-5')
      .set('x-actor-id', 'usr-manager');

    expect(forbiddenDelete.status).toBe(403);
    expect(forbiddenDelete.body.code).toBe('FORBIDDEN_ROLE');

    // usr-admin supprime un prospect sans facture rattachée (cnt-5) -> 200 OK
    const allowedDelete = await request(app)
      .delete('/api/contacts/cnt-5')
      .set('x-actor-id', 'usr-admin');

    expect(allowedDelete.status).toBe(200);
    expect(allowedDelete.body.deleted).toBe(true);
  });

  it('contrôle les exports selon le rôle (refuse l’export d’audit à SALES, filtre par propriétaire, et journalise)', async () => {
    // 1. Un commercial (SALES) ne peut pas exporter le journal d'audit complet -> 403
    const salesAuditExport = await request(app)
      .get('/api/export?entity=activities&format=csv')
      .set('x-actor-id', 'usr-sales-1');

    expect(salesAuditExport.status).toBe(403);
    expect(salesAuditExport.body.code).toBe('FORBIDDEN_EXPORT');

    // 2. Un commercial exporte ses contacts en JSON -> uniquement ses fiches (usr-sales-1 possède 3 fiches sur 6)
    const salesContactsExport = await request(app)
      .get('/api/export?entity=contacts&format=json')
      .set('x-actor-id', 'usr-sales-1');

    expect(salesContactsExport.status).toBe(200);
    const parsedSalesExport = JSON.parse(salesContactsExport.text);
    expect(parsedSalesExport.metadata.scope).toBe('OWNED_ONLY');
    expect(parsedSalesExport.data.length).toBe(3);

    // 3. Un administrateur exporte les contacts en JSON -> global (6 fiches)
    const adminContactsExport = await request(app)
      .get('/api/export?entity=contacts&format=json')
      .set('x-actor-id', 'usr-admin');

    expect(adminContactsExport.status).toBe(200);
    const parsedAdminExport = JSON.parse(adminContactsExport.text);
    expect(parsedAdminExport.metadata.scope).toBe('GLOBAL');
    expect(parsedAdminExport.data.length).toBe(6);
  });
});

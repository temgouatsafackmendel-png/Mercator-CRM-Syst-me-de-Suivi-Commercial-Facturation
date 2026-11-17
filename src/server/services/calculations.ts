/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Moteur de calcul financier et commercial côté serveur (Server-Authoritative Pricing & Totals)
 * - Aucune confiance accordée aux montants calculés par le client
 * - Calcul au centime près (arrondi bancaire/commercial à 2 décimales)
 * - Support multi-taux de TVA, remises par ligne, acomptes et pondération pipeline
 */

import { CalculatedDocumentTotals, DocumentLineItem, OpportunityStage } from '../../types/domain.ts';

export function roundCurrency(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function calculateWeightedOpportunityAmount(
  estimatedAmountHt: number,
  probability: number,
  stage?: OpportunityStage
): { probability: number; weightedAmountHt: number } {
  const sanitizedAmount = Math.max(0, roundCurrency(estimatedAmountHt));
  let effectiveProbability = Math.min(100, Math.max(0, Math.round(probability)));

  if (stage === OpportunityStage.WON) {
    effectiveProbability = 100;
  } else if (stage === OpportunityStage.LOST) {
    effectiveProbability = 0;
  }

  const weightedAmountHt = roundCurrency(sanitizedAmount * (effectiveProbability / 100));
  return {
    probability: effectiveProbability,
    weightedAmountHt,
  };
}

export function calculateDocumentTotals(rawLines: DocumentLineItem[]): CalculatedDocumentTotals {
  if (!Array.isArray(rawLines) || rawLines.length === 0) {
    throw new Error('Un document commercial (devis ou facture) doit contenir au moins une ligne valide.');
  }

  let subtotalHt = 0;
  let totalDiscountHt = 0;
  let netHt = 0;
  let totalTaxAmount = 0;
  const taxBreakdown: Record<string, { baseHt: number; taxAmount: number }> = {};

  const computedLines: Required<DocumentLineItem>[] = rawLines.map((line, index) => {
    const quantity = Number(line.quantity);
    const unitPriceHt = Number(line.unitPriceHt);
    const discountPercent = Number(line.discountPercent ?? 0);
    const taxRate = Number(line.taxRate ?? 20);

    if (!Number.isFinite(quantity) || quantity <= 0 || quantity > 1000000) {
      throw new Error(`Ligne ${index + 1} : la quantité doit être comprise entre 0.01 et 1 000 000.`);
    }
    if (!Number.isFinite(unitPriceHt) || unitPriceHt < 0 || unitPriceHt > 100000000) {
      throw new Error(`Ligne ${index + 1} : le prix unitaire HT doit être positif ou nul.`);
    }
    if (!Number.isFinite(discountPercent) || discountPercent < 0 || discountPercent > 100) {
      throw new Error(`Ligne ${index + 1} : la remise doit être comprise entre 0% et 100%.`);
    }
    if (!Number.isFinite(taxRate) || taxRate < 0 || taxRate > 100) {
      throw new Error(`Ligne ${index + 1} : le taux de TVA doit être compris entre 0% et 100%.`);
    }

    const lineSubtotalHt = roundCurrency(quantity * unitPriceHt);
    const lineDiscountHt = roundCurrency(lineSubtotalHt * (discountPercent / 100));
    const lineNetHt = roundCurrency(lineSubtotalHt - lineDiscountHt);
    const lineTaxAmount = roundCurrency(lineNetHt * (taxRate / 100));
    const lineTotalTtc = roundCurrency(lineNetHt + lineTaxAmount);

    subtotalHt = roundCurrency(subtotalHt + lineSubtotalHt);
    totalDiscountHt = roundCurrency(totalDiscountHt + lineDiscountHt);
    netHt = roundCurrency(netHt + lineNetHt);
    totalTaxAmount = roundCurrency(totalTaxAmount + lineTaxAmount);

    const rateKey = `${taxRate.toFixed(1)}%`;
    if (!taxBreakdown[rateKey]) {
      taxBreakdown[rateKey] = { baseHt: 0, taxAmount: 0 };
    }
    taxBreakdown[rateKey].baseHt = roundCurrency(taxBreakdown[rateKey].baseHt + lineNetHt);
    taxBreakdown[rateKey].taxAmount = roundCurrency(taxBreakdown[rateKey].taxAmount + lineTaxAmount);

    return {
      id: line.id || `line-${index + 1}`,
      description: String(line.description || '').trim(),
      quantity: roundCurrency(quantity),
      unitPriceHt: roundCurrency(unitPriceHt),
      discountPercent: roundCurrency(discountPercent),
      taxRate: roundCurrency(taxRate),
      lineSubtotalHt,
      lineDiscountHt,
      lineNetHt,
      lineTaxAmount,
      lineTotalTtc,
    };
  });

  const totalTtc = roundCurrency(netHt + totalTaxAmount);

  return {
    lines: computedLines,
    subtotalHt,
    totalDiscountHt,
    netHt,
    totalTaxAmount,
    totalTtc,
    taxBreakdown,
  };
}

export function calculateInvoiceBalance(
  totalTtc: number,
  amountPaid: number,
  dueDate: string,
  currentStatus: string,
  referenceDateIso?: string
): {
  amountPaid: number;
  balanceDue: number;
  isOverdue: boolean;
  computedStatus: 'DRAFT' | 'ISSUED' | 'PARTIALLY_PAID' | 'PAID' | 'OVERDUE' | 'CANCELLED';
} {
  const safeTotalTtc = Math.max(0, roundCurrency(totalTtc));
  const safePaid = Math.min(safeTotalTtc, Math.max(0, roundCurrency(amountPaid)));
  const balanceDue = roundCurrency(safeTotalTtc - safePaid);

  if (currentStatus === 'CANCELLED') {
    return {
      amountPaid: safePaid,
      balanceDue: 0,
      isOverdue: false,
      computedStatus: 'CANCELLED',
    };
  }

  if (currentStatus === 'DRAFT' && safePaid === 0) {
    return {
      amountPaid: 0,
      balanceDue: safeTotalTtc,
      isOverdue: false,
      computedStatus: 'DRAFT',
    };
  }

  const today = (referenceDateIso || new Date().toISOString()).slice(0, 10);
  const dueDay = String(dueDate || '').slice(0, 10);
  const isPastDue = Boolean(dueDay && dueDay < today && balanceDue > 0);

  if (balanceDue === 0 && safeTotalTtc > 0) {
    return {
      amountPaid: safePaid,
      balanceDue: 0,
      isOverdue: false,
      computedStatus: 'PAID',
    };
  }

  if (isPastDue) {
    return {
      amountPaid: safePaid,
      balanceDue,
      isOverdue: true,
      computedStatus: 'OVERDUE',
    };
  }

  if (safePaid > 0 && balanceDue > 0) {
    return {
      amountPaid: safePaid,
      balanceDue,
      isOverdue: false,
      computedStatus: 'PARTIALLY_PAID',
    };
  }

  return {
    amountPaid: safePaid,
    balanceDue,
    isOverdue: false,
    computedStatus: 'ISSUED',
  };
}

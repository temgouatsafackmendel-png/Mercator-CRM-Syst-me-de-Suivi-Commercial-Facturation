/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Vues Devis, Factures, Relances et Audit/Exports restructurées :
 * - QuotesView : Filtres par statut, recherche, aperçu "Feuille Document Commercial A4" professionnel, conversion en facture en 1 clic
 * - InvoicesView : Bandeau de synthèse Trésorerie (Facturé / Encaissé / En retard), barre de progression par facture, saisie de règlement
 * - TasksView : Filtres intelligents (À faire, En retard, Terminées)
 * - ActivitiesAndExportView : Matrice d'export contrôlé et Journal d'Audit avec recherche textuelle
 */

import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  Check,
  Download,
  FileSpreadsheet,
  FileText,
  Plus,
  Printer,
  Receipt,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import { api } from '../services/api.ts';
import {
  ActivityLog,
  CalculatedDocumentTotals,
  Contact,
  DocumentLineItem,
  FollowUpTask,
  Invoice,
  InvoiceStatus,
  Opportunity,
  Quote,
  QuoteStatus,
  Role,
  TaskPriority,
  TaskStatus,
  TaskType,
  User,
} from '../types/domain.ts';
import {
  formatCurrency,
  formatDateFr,
  formatDateTimeFr,
  INVOICE_STATUS_LABELS,
  QUOTE_STATUS_LABELS,
  ROLE_LABELS,
  TASK_PRIORITY_LABELS,
  TASK_STATUS_LABELS,
  TASK_TYPE_LABELS,
} from '../utils/formatters.ts';

// ============================================================================
// 4. DEVIS COMMERCIAUX AVEC APERÇU FEUILLE A4 & CALCULATEUR SERVEUR
// ============================================================================
export function QuotesView({
  quotes,
  contacts,
  opportunities,
  currentUser,
  initialShowBuilder = false,
  onClearInitialBuilder,
  onCreateQuote,
  onUpdateStatus,
  onConvertQuote,
}: {
  quotes: Quote[];
  contacts: Contact[];
  opportunities: Opportunity[];
  currentUser: User;
  initialShowBuilder?: boolean;
  onClearInitialBuilder?: () => void;
  onCreateQuote: (payload: {
    contactId: string;
    opportunityId?: string | null;
    status: QuoteStatus;
    issueDate: string;
    validUntil: string;
    notes: string;
    terms: string;
    lines: DocumentLineItem[];
  }) => Promise<void>;
  onUpdateStatus: (id: string, status: QuoteStatus) => Promise<void>;
  onConvertQuote: (id: string) => Promise<void>;
}) {
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [showBuilder, setShowBuilder] = useState(initialShowBuilder);
  const [selectedQuote, setSelectedQuote] = useState<Quote | null>(quotes[0] || null);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [contactId, setContactId] = useState(contacts[0]?.id || '');
  const [opportunityId, setOpportunityId] = useState<string>('');
  const [status, setStatus] = useState<QuoteStatus>(QuoteStatus.SENT);
  const [issueDate, setIssueDate] = useState('2026-11-16');
  const [validUntil, setValidUntil] = useState('2026-12-16');
  const [notes, setNotes] = useState('');
  const [terms, setTerms] = useState(
    'Paiement à 30 jours net par virement SEPA. Devis valable 30 jours.'
  );
  const [lines, setLines] = useState<DocumentLineItem[]>([
    {
      description: 'Prestation d’intégration et paramétrage sur mesure',
      quantity: 3,
      unitPriceHt: 1250,
      discountPercent: 0,
      taxRate: 20,
    },
  ]);
  const [serverPreview, setServerPreview] = useState<CalculatedDocumentTotals | null>(null);

  useEffect(() => {
    if (!showBuilder) return;
    let active = true;
    api
      .previewDocumentTotals(lines)
      .then((res) => {
        if (active) setServerPreview(res);
      })
      .catch(() => {
        // ignore transient input error
      });
    return () => {
      active = false;
    };
  }, [lines, showBuilder]);

  const filteredQuotes = useMemo(() => {
    return quotes.filter((q) => {
      const matchesStatus = statusFilter === 'ALL' || q.status === statusFilter;
      const s = searchQuery.toLowerCase().trim();
      const matchesSearch =
        !s ||
        q.reference.toLowerCase().includes(s) ||
        (q.companyName || '').toLowerCase().includes(s);
      return matchesStatus && matchesSearch;
    });
  }, [quotes, statusFilter, searchQuery]);

  const updateLine = (idx: number, patch: Partial<DocumentLineItem>) => {
    setLines((prev) => prev.map((l, i) => (i === idx ? { ...l, ...patch } : l)));
  };

  const addLine = () => {
    setLines((prev) => [
      ...prev,
      {
        description: 'Licence logicielle / équipement complémentaire',
        quantity: 1,
        unitPriceHt: 800,
        discountPercent: 0,
        taxRate: 20,
      },
    ]);
  };

  const removeLine = (idx: number) => {
    if (lines.length <= 1) return;
    setLines((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setErrorMsg(null);
    try {
      await onCreateQuote({
        contactId,
        opportunityId: opportunityId || null,
        status,
        issueDate,
        validUntil,
        notes,
        terms,
        lines,
      });
      setShowBuilder(false);
      if (onClearInitialBuilder) onClearInitialBuilder();
    } catch (err: any) {
      setErrorMsg(err.message || 'Erreur lors de la création du devis.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* En-tête */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-slate-200 dark:border-slate-800">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
            Devis Commerciaux & Propositions Chiffrées
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
            Calculateur serveur en temps réel (HT, remises lignes, TVA multi-taux, TTC) et conversion directe en facture
          </p>
        </div>
        <button
          onClick={() => {
            setContactId(contacts[0]?.id || '');
            setShowBuilder(true);
          }}
          className="px-4 py-2 text-xs font-medium text-white bg-slate-900 dark:bg-blue-600 rounded-lg hover:bg-slate-800 transition-colors flex items-center gap-2 whitespace-nowrap shrink-0 self-start sm:self-auto"
        >
          <Plus className="w-4 h-4" /> Émettre un Devis
        </button>
      </div>

      {/* Barre de filtres et recherche */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg overflow-x-auto">
          {[
            { id: 'ALL', label: `Tous (${quotes.length})` },
            {
              id: QuoteStatus.SENT,
              label: `En attente (${quotes.filter((q) => q.status === QuoteStatus.SENT).length})`,
            },
            {
              id: QuoteStatus.ACCEPTED,
              label: `Acceptés (${quotes.filter((q) => q.status === QuoteStatus.ACCEPTED).length})`,
            },
            {
              id: QuoteStatus.DRAFT,
              label: `Brouillons (${quotes.filter((q) => q.status === QuoteStatus.DRAFT).length})`,
            },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setStatusFilter(tab.id)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                statusFilter === tab.id
                  ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 shadow-xs'
                  : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="relative w-full md:w-80">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Rechercher référence (DEV-2026...) ou client..."
            className="w-full pl-9 pr-4 py-2 text-xs bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg"
          />
        </div>
      </div>

      {/* Éditeur de Devis avec Calculateur Serveur */}
      {showBuilder && (
        <form
          onSubmit={handleSubmit}
          className="p-6 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg space-y-6"
        >
          <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
                Éditeur de Proposition Commerciale (Calcul Certifié Serveur)
              </h2>
              <p className="text-xs text-slate-500">
                Les montants HT, remises et taxes sont calculés par `/api/calculations/preview` à chaque saisie.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowBuilder(false)}
              className="text-slate-400 hover:text-slate-600"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {errorMsg && (
            <div className="p-3 bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-800 rounded text-xs text-red-700 dark:text-red-300">
              {errorMsg}
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Client / Prospect *
              </label>
              <select
                required
                value={contactId}
                onChange={(e) => setContactId(e.target.value)}
                className="w-full px-3 py-2 text-xs bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-md"
              >
                {contacts.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.companyName}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Opportunité rattachée
              </label>
              <select
                value={opportunityId}
                onChange={(e) => setOpportunityId(e.target.value)}
                className="w-full px-3 py-2 text-xs bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-md"
              >
                <option value="">— Aucune opportunité —</option>
                {opportunities.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.title}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Date d’émission *
              </label>
              <input
                type="date"
                required
                value={issueDate}
                onChange={(e) => setIssueDate(e.target.value)}
                className="w-full px-3 py-2 text-xs font-mono bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-md"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Valide jusqu’au *
              </label>
              <input
                type="date"
                required
                value={validUntil}
                onChange={(e) => setValidUntil(e.target.value)}
                className="w-full px-3 py-2 text-xs font-mono bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-md"
              />
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                Postes et prestations chiffrés
              </span>
              <button
                type="button"
                onClick={addLine}
                className="px-3 py-1 text-xs font-medium text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-800 rounded hover:bg-blue-50 dark:hover:bg-blue-950/40"
              >
                + Ajouter un poste
              </button>
            </div>

            <div className="border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300">
                    <th className="py-2 px-3">Désignation</th>
                    <th className="py-2 px-3 w-24 text-right">Quantité</th>
                    <th className="py-2 px-3 w-32 text-right">P.U. HT (€)</th>
                    <th className="py-2 px-3 w-24 text-right">Remise %</th>
                    <th className="py-2 px-3 w-24 text-right">TVA %</th>
                    <th className="py-2 px-3 w-32 text-right">Net HT</th>
                    <th className="py-2 px-2 w-10"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                  {lines.map((line, index) => {
                    const previewLine = serverPreview?.lines[index];
                    return (
                      <tr key={index}>
                        <td className="p-2">
                          <input
                            type="text"
                            required
                            value={line.description}
                            onChange={(e) =>
                              updateLine(index, { description: e.target.value })
                            }
                            className="w-full px-2.5 py-1.5 bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded"
                          />
                        </td>
                        <td className="p-2">
                          <input
                            type="number"
                            min="0.01"
                            step="0.01"
                            required
                            value={line.quantity}
                            onChange={(e) =>
                              updateLine(index, { quantity: Number(e.target.value) })
                            }
                            className="w-full px-2 py-1.5 text-right font-mono tabular-nums bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded"
                          />
                        </td>
                        <td className="p-2">
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            required
                            value={line.unitPriceHt}
                            onChange={(e) =>
                              updateLine(index, { unitPriceHt: Number(e.target.value) })
                            }
                            className="w-full px-2 py-1.5 text-right font-mono tabular-nums bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded"
                          />
                        </td>
                        <td className="p-2">
                          <input
                            type="number"
                            min="0"
                            max="100"
                            step="0.5"
                            value={line.discountPercent}
                            onChange={(e) =>
                              updateLine(index, { discountPercent: Number(e.target.value) })
                            }
                            className="w-full px-2 py-1.5 text-right font-mono tabular-nums bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded"
                          />
                        </td>
                        <td className="p-2">
                          <select
                            value={line.taxRate}
                            onChange={(e) =>
                              updateLine(index, { taxRate: Number(e.target.value) })
                            }
                            className="w-full px-2 py-1.5 text-right font-mono bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded"
                          >
                            <option value={20}>20%</option>
                            <option value={10}>10%</option>
                            <option value={5.5}>5,5%</option>
                            <option value={0}>0%</option>
                          </select>
                        </td>
                        <td className="p-2 text-right font-mono tabular-nums font-semibold text-slate-900 dark:text-slate-100">
                          {formatCurrency(previewLine?.lineNetHt ?? 0)}
                        </td>
                        <td className="p-2 text-center">
                          <button
                            type="button"
                            onClick={() => removeLine(index)}
                            disabled={lines.length <= 1}
                            className="text-slate-400 hover:text-red-600 disabled:opacity-30"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {serverPreview && (
            <div className="flex flex-col md:flex-row items-start md:items-end justify-between gap-6 pt-3 border-t border-slate-200 dark:border-slate-800">
              <div className="w-full md:w-1/2 space-y-2">
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                  Conditions de règlement & validité
                </label>
                <input
                  type="text"
                  value={terms}
                  onChange={(e) => setTerms(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-md"
                />
              </div>

              <div className="w-full md:w-80 bg-slate-50 dark:bg-slate-800/50 p-4 rounded-lg space-y-1.5 text-xs font-mono tabular-nums">
                <div className="flex justify-between text-slate-600 dark:text-slate-400">
                  <span>Sous-total Brut HT :</span>
                  <span>{formatCurrency(serverPreview.subtotalHt)}</span>
                </div>
                <div className="flex justify-between text-slate-600 dark:text-slate-400">
                  <span>Remises HT :</span>
                  <span>- {formatCurrency(serverPreview.totalDiscountHt)}</span>
                </div>
                <div className="flex justify-between font-semibold text-slate-900 dark:text-slate-100 pt-1 border-t border-slate-200 dark:border-slate-700">
                  <span>Total Net HT :</span>
                  <span>{formatCurrency(serverPreview.netHt)}</span>
                </div>
                <div className="flex justify-between text-slate-600 dark:text-slate-400">
                  <span>Total TVA :</span>
                  <span>{formatCurrency(serverPreview.totalTaxAmount)}</span>
                </div>
                <div className="flex justify-between text-sm font-bold text-slate-900 dark:text-slate-100 pt-1.5 border-t border-slate-300 dark:border-slate-700">
                  <span>Net à payer TTC :</span>
                  <span>{formatCurrency(serverPreview.totalTtc)}</span>
                </div>
              </div>
            </div>
          )}

          <div className="flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={() => setShowBuilder(false)}
              className="px-4 py-2 text-xs font-medium text-slate-600 dark:text-slate-300"
            >
              Annuler
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-4 py-2 text-xs font-medium text-white bg-slate-900 dark:bg-blue-600 rounded-md"
            >
              {submitting ? 'Validation serveur...' : 'Enregistrer et Émettre le Devis'}
            </button>
          </div>
        </form>
      )}

      {/* Architecture Master-Detail : Liste des Devis (7 col) + Aperçu Document Commercial A4 (5 col) */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
        <div className="xl:col-span-7 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40 text-xs font-semibold text-slate-600 dark:text-slate-300">
                  <th className="py-3 px-4">Référence & Destinataire</th>
                  <th className="py-3 px-4">Statut</th>
                  <th className="py-3 px-4">Validité</th>
                  <th className="py-3 px-4 text-right">Net HT</th>
                  <th className="py-3 px-4 text-right">Total TTC</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800 text-xs">
                {filteredQuotes.map((q) => {
                  const isSelected = selectedQuote?.id === q.id;
                  const canModify =
                    currentUser.role !== Role.SALES || q.ownerId === currentUser.id;
                  return (
                    <tr
                      key={q.id}
                      onClick={() => setSelectedQuote(q)}
                      className={`cursor-pointer transition-colors ${
                        isSelected
                          ? 'bg-blue-50/60 dark:bg-blue-950/30'
                          : 'hover:bg-slate-50/80 dark:hover:bg-slate-800/40'
                      }`}
                    >
                      <td className="py-3.5 px-4">
                        <div className="font-mono font-semibold text-slate-900 dark:text-slate-100">
                          {q.reference}
                        </div>
                        <div className="text-slate-600 dark:text-slate-400">
                          {q.companyName}
                        </div>
                      </td>
                      <td className="py-3.5 px-4">
                        <span
                          className={`font-medium ${
                            q.status === QuoteStatus.ACCEPTED
                              ? 'text-emerald-700 dark:text-emerald-400'
                              : q.status === QuoteStatus.SENT
                              ? 'text-blue-700 dark:text-blue-400'
                              : 'text-slate-600 dark:text-slate-400'
                          }`}
                        >
                          {QUOTE_STATUS_LABELS[q.status]}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 font-mono tabular-nums text-slate-600 dark:text-slate-400">
                        {formatDateFr(q.validUntil)}
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono tabular-nums">
                        {formatCurrency(q.netHt)}
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono tabular-nums font-bold text-slate-900 dark:text-slate-100">
                        {formatCurrency(q.totalTtc)}
                      </td>
                      <td
                        className="py-3.5 px-4 text-right whitespace-nowrap"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {canModify && !q.convertedInvoiceId ? (
                          <button
                            onClick={() => onConvertQuote(q.id)}
                            className="px-2.5 py-1 text-xs font-medium text-white bg-emerald-700 hover:bg-emerald-600 rounded transition-colors"
                          >
                            Convertir en Facture
                          </button>
                        ) : q.convertedInvoiceId ? (
                          <span className="text-emerald-700 dark:text-emerald-400 font-mono text-[11px]">
                            Facturé ✓
                          </span>
                        ) : (
                          <span className="text-slate-400">Aperçu</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Aperçu Feuille Document Commercial (Devis sélectionné) */}
        <div className="xl:col-span-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-6 space-y-6">
          {!selectedQuote ? (
            <div className="py-16 text-center text-xs text-slate-500">
              Cliquez sur un devis pour afficher son aperçu détaillé.
            </div>
          ) : (
            <>
              <div className="flex items-start justify-between border-b border-slate-200 dark:border-slate-800 pb-4">
                <div>
                  <div className="text-xs font-mono text-slate-500">
                    PROPOSITION COMMERCIALE · {QUOTE_STATUS_LABELS[selectedQuote.status]}
                  </div>
                  <h2 className="text-xl font-bold font-mono text-slate-900 dark:text-slate-100 mt-0.5">
                    {selectedQuote.reference}
                  </h2>
                  <div className="text-xs text-slate-600 dark:text-slate-400 mt-1">
                    Destinataire : <strong className="text-slate-900 dark:text-slate-100">{selectedQuote.companyName}</strong>
                  </div>
                </div>
                <div className="text-right text-xs font-mono tabular-nums text-slate-500">
                  <div>Émis le : {formatDateFr(selectedQuote.issueDate)}</div>
                  <div>Valide au : {formatDateFr(selectedQuote.validUntil)}</div>
                </div>
              </div>

              {/* Lignes du devis */}
              <div className="border border-slate-200 dark:border-slate-800 rounded-md overflow-hidden">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-800 text-slate-500">
                      <th className="py-2 px-3">Prestation</th>
                      <th className="py-2 px-2 text-right">Qté</th>
                      <th className="py-2 px-2 text-right">P.U. HT</th>
                      <th className="py-2 px-3 text-right">Net HT</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 dark:divide-slate-800 font-mono tabular-nums">
                    {selectedQuote.lines.map((l) => (
                      <tr key={l.id}>
                        <td className="py-2.5 px-3 font-sans text-slate-900 dark:text-slate-100">
                          <div>{l.description}</div>
                          {l.discountPercent > 0 && (
                            <div className="text-[11px] text-emerald-700 dark:text-emerald-400">
                              Remise appliquée : -{l.discountPercent}%
                            </div>
                          )}
                        </td>
                        <td className="py-2.5 px-2 text-right">{l.quantity}</td>
                        <td className="py-2.5 px-2 text-right">{formatCurrency(l.unitPriceHt)}</td>
                        <td className="py-2.5 px-3 text-right font-semibold">
                          {formatCurrency(l.lineNetHt)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Pied de page financier certifié serveur */}
              <div className="bg-slate-50 dark:bg-slate-800/40 p-4 rounded-lg space-y-1.5 text-xs font-mono tabular-nums">
                <div className="flex justify-between text-slate-500">
                  <span>Sous-total Brut HT :</span>
                  <span>{formatCurrency(selectedQuote.subtotalHt)}</span>
                </div>
                {selectedQuote.totalDiscountHt > 0 && (
                  <div className="flex justify-between text-emerald-700 dark:text-emerald-400">
                    <span>Remise commerciale HT :</span>
                    <span>- {formatCurrency(selectedQuote.totalDiscountHt)}</span>
                  </div>
                )}
                <div className="flex justify-between font-semibold text-slate-900 dark:text-slate-100 pt-1 border-t border-slate-200 dark:border-slate-700">
                  <span>Total Net HT :</span>
                  <span>{formatCurrency(selectedQuote.netHt)}</span>
                </div>
                <div className="flex justify-between text-slate-500">
                  <span>TVA collectée :</span>
                  <span>{formatCurrency(selectedQuote.totalTaxAmount)}</span>
                </div>
                <div className="flex justify-between text-sm font-bold text-slate-900 dark:text-slate-100 pt-1.5 border-t border-slate-300 dark:border-slate-700">
                  <span>Total TTC :</span>
                  <span>{formatCurrency(selectedQuote.totalTtc)}</span>
                </div>
              </div>

              <div className="text-xs text-slate-500 space-y-1">
                <div>
                  <strong>Conditions :</strong> {selectedQuote.terms}
                </div>
                {selectedQuote.notes && (
                  <div>
                    <strong>Notes :</strong> {selectedQuote.notes}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// 5. FACTURIER, SYNTHÈSE TRÉSORERIE & ENCAISSEMENTS
// ============================================================================
export function InvoicesView({
  invoices,
  currentUser,
  onRecordPayment,
}: {
  invoices: Invoice[];
  currentUser: User;
  onRecordPayment: (id: string, amountPaid: number, paymentMethod: string) => Promise<void>;
}) {
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [payingInvoice, setPayingInvoice] = useState<Invoice | null>(null);
  const [amountInput, setAmountInput] = useState<number>(0);
  const [paymentMethod, setPaymentMethod] = useState<string>('Virement SEPA');
  const [submitting, setSubmitting] = useState(false);

  const summaryStats = useMemo(() => {
    const totalTtc = invoices.reduce((acc, i) => acc + i.totalTtc, 0);
    const totalPaid = invoices.reduce((acc, i) => acc + i.amountPaid, 0);
    const totalDue = invoices.reduce((acc, i) => acc + i.balanceDue, 0);
    const totalOverdue = invoices
      .filter((i) => i.isOverdue || i.status === InvoiceStatus.OVERDUE)
      .reduce((acc, i) => acc + i.balanceDue, 0);
    return { totalTtc, totalPaid, totalDue, totalOverdue };
  }, [invoices]);

  const filteredInvoices = useMemo(() => {
    if (statusFilter === 'ALL') return invoices;
    return invoices.filter((i) => i.status === statusFilter);
  }, [invoices, statusFilter]);

  const openPaymentModal = (inv: Invoice) => {
    setPayingInvoice(inv);
    setAmountInput(inv.totalTtc);
    setPaymentMethod(inv.paymentMethod || 'Virement SEPA');
  };

  const handlePaymentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!payingInvoice) return;
    setSubmitting(true);
    try {
      await onRecordPayment(payingInvoice.id, amountInput, paymentMethod);
      setPayingInvoice(null);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-slate-200 dark:border-slate-800">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
            Facturier, Échéances & Suivi des Règlements
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
            Suivi du recouvrement TTC, enregistrement des acomptes et détection serveur des factures échues
          </p>
        </div>
      </div>

      {/* Bandeau Synthèse Trésorerie Facturée */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <div className="p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg">
          <div className="text-xs text-slate-500">Total Facturé TTC</div>
          <div className="mt-1 text-xl font-bold font-mono tabular-nums text-slate-900 dark:text-slate-100">
            {formatCurrency(summaryStats.totalTtc)}
          </div>
        </div>
        <div className="p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg">
          <div className="text-xs text-slate-500">Total Encaissé TTC</div>
          <div className="mt-1 text-xl font-bold font-mono tabular-nums text-emerald-700 dark:text-emerald-400">
            {formatCurrency(summaryStats.totalPaid)}
          </div>
        </div>
        <div className="p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg">
          <div className="text-xs text-slate-500">Reste à Encaisser TTC</div>
          <div className="mt-1 text-xl font-bold font-mono tabular-nums text-slate-900 dark:text-slate-100">
            {formatCurrency(summaryStats.totalDue)}
          </div>
        </div>
        <div className="p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg">
          <div className="text-xs text-slate-500">Dont Impayés Échus (Retard)</div>
          <div className="mt-1 text-xl font-bold font-mono tabular-nums text-red-600 dark:text-red-400">
            {formatCurrency(summaryStats.totalOverdue)}
          </div>
        </div>
      </div>

      {/* Filtres par statut comptable */}
      <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg w-fit">
        {[
          { id: 'ALL', label: `Toutes (${invoices.length})` },
          {
            id: InvoiceStatus.OVERDUE,
            label: `En retard (${invoices.filter((i) => i.status === InvoiceStatus.OVERDUE).length})`,
          },
          {
            id: InvoiceStatus.PARTIALLY_PAID,
            label: `Acomptes reçus (${invoices.filter((i) => i.status === InvoiceStatus.PARTIALLY_PAID).length})`,
          },
          {
            id: InvoiceStatus.PAID,
            label: `Payées (${invoices.filter((i) => i.status === InvoiceStatus.PAID).length})`,
          },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setStatusFilter(tab.id)}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
              statusFilter === tab.id
                ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 shadow-xs'
                : 'text-slate-600 dark:text-slate-400'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {payingInvoice && (
        <form
          onSubmit={handlePaymentSubmit}
          className="p-6 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg space-y-4"
        >
          <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
            <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
              Enregistrer un règlement — {payingInvoice.reference} ({payingInvoice.companyName})
            </h2>
            <button
              type="button"
              onClick={() => setPayingInvoice(null)}
              className="text-slate-400 hover:text-slate-600"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
            <div>
              <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                Total TTC de la facture
              </label>
              <div className="px-3 py-2 font-mono tabular-nums bg-slate-100 dark:bg-slate-800 rounded-md font-bold">
                {formatCurrency(payingInvoice.totalTtc)}
              </div>
            </div>

            <div>
              <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                Montant total encaissé cumulé (€ TTC) *
              </label>
              <input
                type="number"
                min="0"
                max={payingInvoice.totalTtc}
                step="0.01"
                required
                value={amountInput}
                onChange={(e) => setAmountInput(Number(e.target.value))}
                className="w-full px-3 py-2 font-mono tabular-nums bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-md"
              />
            </div>

            <div>
              <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                Mode de règlement
              </label>
              <select
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value)}
                className="w-full px-3 py-2 bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-md"
              >
                <option value="Virement SEPA">Virement SEPA</option>
                <option value="Prélèvement SEPA">Prélèvement SEPA</option>
                <option value="Carte Bancaire Entreprise">Carte Bancaire Entreprise</option>
                <option value="Chèque">Chèque</option>
              </select>
            </div>
          </div>

          <div className="flex items-center justify-between pt-2">
            <div className="text-xs font-mono tabular-nums text-slate-600 dark:text-slate-400">
              Nouveau solde restant dû calculé :{' '}
              <strong className="text-slate-900 dark:text-slate-100">
                {formatCurrency(Math.max(0, payingInvoice.totalTtc - amountInput))}
              </strong>
            </div>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setPayingInvoice(null)}
                className="px-4 py-2 text-xs font-medium text-slate-600"
              >
                Annuler
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="px-4 py-2 text-xs font-medium text-white bg-emerald-700 hover:bg-emerald-600 rounded-md"
              >
                {submitting ? 'Enregistrement...' : 'Valider l’encaissement'}
              </button>
            </div>
          </div>
        </form>
      )}

      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40 text-xs font-semibold text-slate-600 dark:text-slate-300">
                <th className="py-3 px-4">Facture & Client</th>
                <th className="py-3 px-4">Statut Comptable</th>
                <th className="py-3 px-4">Émission / Échéance</th>
                <th className="py-3 px-4 text-right">Total TTC</th>
                <th className="py-3 px-4 w-44">Progression Règlement</th>
                <th className="py-3 px-4 text-right">Reste à Payer</th>
                <th className="py-3 px-4 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800 text-xs">
              {filteredInvoices.map((inv) => {
                const canRecord =
                  currentUser.role !== Role.SALES || inv.ownerId === currentUser.id;
                const paidPercent =
                  inv.totalTtc > 0 ? Math.round((inv.amountPaid / inv.totalTtc) * 100) : 0;
                return (
                  <tr
                    key={inv.id}
                    className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors"
                  >
                    <td className="py-3.5 px-4">
                      <div className="font-mono font-semibold text-slate-900 dark:text-slate-100">
                        {inv.reference}
                      </div>
                      <div className="text-slate-600 dark:text-slate-400">
                        {inv.companyName}
                        {inv.quoteReference ? ` · Devis ${inv.quoteReference}` : ''}
                      </div>
                    </td>
                    <td className="py-3.5 px-4">
                      <span
                        className={`font-medium ${
                          inv.status === InvoiceStatus.PAID
                            ? 'text-emerald-700 dark:text-emerald-400'
                            : inv.status === InvoiceStatus.OVERDUE
                            ? 'text-red-600 dark:text-red-400 font-semibold'
                            : inv.status === InvoiceStatus.PARTIALLY_PAID
                            ? 'text-amber-700 dark:text-amber-400'
                            : 'text-slate-700 dark:text-slate-300'
                        }`}
                      >
                        {INVOICE_STATUS_LABELS[inv.status]}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 font-mono tabular-nums text-slate-600 dark:text-slate-400">
                      <div>Émise : {formatDateFr(inv.issueDate)}</div>
                      <div
                        className={
                          inv.isOverdue ? 'text-red-600 dark:text-red-400 font-semibold' : ''
                        }
                      >
                        Échéance : {formatDateFr(inv.dueDate)}
                      </div>
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono tabular-nums font-bold text-slate-900 dark:text-slate-100">
                      {formatCurrency(inv.totalTtc)}
                    </td>
                    <td className="py-3.5 px-4">
                      <div className="flex items-center justify-between text-[11px] font-mono tabular-nums mb-1">
                        <span className="text-emerald-700 dark:text-emerald-400">
                          {formatCurrency(inv.amountPaid)}
                        </span>
                        <span className="text-slate-500">{paidPercent}%</span>
                      </div>
                      <div className="h-1.5 w-full bg-slate-100 dark:bg-slate-800 rounded overflow-hidden">
                        <div
                          className="h-full bg-emerald-600 dark:bg-emerald-500"
                          style={{ width: `${paidPercent}%` }}
                        />
                      </div>
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono tabular-nums font-semibold">
                      <span
                        className={
                          inv.balanceDue > 0
                            ? 'text-amber-700 dark:text-amber-400'
                            : 'text-slate-400'
                        }
                      >
                        {formatCurrency(inv.balanceDue)}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-right whitespace-nowrap">
                      {inv.balanceDue > 0 && canRecord ? (
                        <button
                          onClick={() => openPaymentModal(inv)}
                          className="px-2.5 py-1 text-xs font-medium text-white bg-slate-900 dark:bg-blue-600 rounded hover:bg-slate-800"
                        >
                          Saisir règlement
                        </button>
                      ) : inv.balanceDue === 0 ? (
                        <span className="text-emerald-700 dark:text-emerald-400 font-medium">
                          Acquittée ✓
                        </span>
                      ) : (
                        <span className="text-slate-400">Lecture seule</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// 6. TÂCHES DE RELANCE COMMERCIALE & RECOUVREMENT
// ============================================================================
export function TasksView({
  tasks,
  contacts,
  currentUser,
  onCreateTask,
  onUpdateTaskStatus,
}: {
  tasks: FollowUpTask[];
  contacts: Contact[];
  currentUser: User;
  onCreateTask: (data: Partial<FollowUpTask>) => Promise<void>;
  onUpdateTaskStatus: (id: string, status: TaskStatus) => Promise<void>;
}) {
  const [filterMode, setFilterMode] = useState<'PENDING' | 'OVERDUE' | 'DONE' | 'ALL'>('PENDING');
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [type, setType] = useState<TaskType>(TaskType.CALL);
  const [priority, setPriority] = useState<TaskPriority>(TaskPriority.HIGH);
  const [dueDate, setDueDate] = useState('2026-11-20');
  const [contactId, setContactId] = useState(contacts[0]?.id || '');

  const filteredTasks = useMemo(() => {
    return tasks.filter((t) => {
      if (filterMode === 'PENDING') return t.status !== TaskStatus.DONE;
      if (filterMode === 'OVERDUE') return Boolean(t.isOverdue && t.status !== TaskStatus.DONE);
      if (filterMode === 'DONE') return t.status === TaskStatus.DONE;
      return true;
    });
  }, [tasks, filterMode]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await onCreateTask({
      title,
      description,
      type,
      priority,
      status: TaskStatus.TODO,
      dueDate,
      contactId: contactId || null,
      assigneeId: currentUser.id,
    });
    setTitle('');
    setDescription('');
    setShowForm(false);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-slate-200 dark:border-slate-800">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
            Agenda des Relances Commerciales & Recouvrement
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
            Organisation des appels de suivi, relances de devis en attente et recouvrement des factures échues
          </p>
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="px-4 py-2 text-xs font-medium text-white bg-slate-900 dark:bg-blue-600 rounded-lg hover:bg-slate-800 flex items-center gap-2 whitespace-nowrap shrink-0 self-start sm:self-auto"
        >
          <Plus className="w-4 h-4" /> Planifier une Relance
        </button>
      </div>

      {/* Filtres rapides des relances */}
      <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg w-fit">
        {[
          {
            id: 'PENDING',
            label: `À traiter (${tasks.filter((t) => t.status !== TaskStatus.DONE).length})`,
          },
          {
            id: 'OVERDUE',
            label: `En retard (${tasks.filter((t) => t.isOverdue && t.status !== TaskStatus.DONE).length})`,
          },
          {
            id: 'DONE',
            label: `Terminées (${tasks.filter((t) => t.status === TaskStatus.DONE).length})`,
          },
          { id: 'ALL', label: `Toutes (${tasks.length})` },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setFilterMode(tab.id as any)}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
              filterMode === tab.id
                ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 shadow-xs'
                : 'text-slate-600 dark:text-slate-400'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {showForm && (
        <form
          onSubmit={handleSubmit}
          className="p-6 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg space-y-4"
        >
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 text-xs">
            <div className="md:col-span-2">
              <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                Objet de la relance *
              </label>
              <input
                type="text"
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Ex: Relancer direction financière pour validation Devis"
                className="w-full px-3 py-2 bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-md"
              />
            </div>

            <div>
              <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                Type d’action
              </label>
              <select
                value={type}
                onChange={(e) => setType(e.target.value as TaskType)}
                className="w-full px-3 py-2 bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-md"
              >
                {Object.entries(TASK_TYPE_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                Priorité & Échéance *
              </label>
              <div className="grid grid-cols-2 gap-2">
                <select
                  value={priority}
                  onChange={(e) => setPriority(e.target.value as TaskPriority)}
                  className="w-full px-2 py-2 bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-md"
                >
                  {Object.entries(TASK_PRIORITY_LABELS).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </select>
                <input
                  type="date"
                  required
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  className="w-full px-2 py-2 font-mono bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-md"
                />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
            <div>
              <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                Compte concerné
              </label>
              <select
                value={contactId}
                onChange={(e) => setContactId(e.target.value)}
                className="w-full px-3 py-2 bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-md"
              >
                <option value="">— Général —</option>
                {contacts.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.companyName}
                  </option>
                ))}
              </select>
            </div>
            <div className="md:col-span-2">
              <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                Consignes détaillées
              </label>
              <input
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Points à aborder lors de l’échange..."
                className="w-full px-3 py-2 bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-md"
              />
            </div>
          </div>

          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="px-4 py-2 text-xs font-medium text-slate-600"
            >
              Annuler
            </button>
            <button
              type="submit"
              className="px-4 py-2 text-xs font-medium text-white bg-slate-900 dark:bg-blue-600 rounded-md"
            >
              Enregistrer la relance
            </button>
          </div>
        </form>
      )}

      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg divide-y divide-slate-200 dark:divide-slate-800">
        {filteredTasks.length === 0 ? (
          <div className="py-12 text-center text-xs text-slate-500">
            Aucune tâche de relance dans cette vue.
          </div>
        ) : (
          filteredTasks.map((t) => {
            const canUpdate =
              currentUser.role !== Role.SALES || t.assigneeId === currentUser.id;
            return (
              <div
                key={t.id}
                className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-slate-50/60 dark:hover:bg-slate-800/30 transition-colors"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span
                      className={`text-sm font-semibold ${
                        t.status === TaskStatus.DONE
                          ? 'line-through text-slate-400'
                          : 'text-slate-900 dark:text-slate-100'
                      }`}
                    >
                      {t.title}
                    </span>
                  </div>
                  {t.description && (
                    <p className="text-xs text-slate-600 dark:text-slate-400">{t.description}</p>
                  )}
                  <div className="text-xs text-slate-500 flex flex-wrap items-center gap-1.5">
                    <span>{TASK_TYPE_LABELS[t.type]}</span>
                    <span aria-hidden="true">·</span>
                    <span
                      className={
                        t.priority === TaskPriority.URGENT
                          ? 'text-red-600 dark:text-red-400 font-medium'
                          : ''
                      }
                    >
                      Priorité {TASK_PRIORITY_LABELS[t.priority]}
                    </span>
                    {t.companyName && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span className="font-medium text-slate-700 dark:text-slate-300">
                          {t.companyName}
                        </span>
                      </>
                    )}
                    <span aria-hidden="true">·</span>
                    <span>Assigné à : {t.assigneeName}</span>
                    <span aria-hidden="true">·</span>
                    <span
                      className={`font-mono tabular-nums ${
                        t.isOverdue
                          ? 'text-red-600 dark:text-red-400 font-semibold'
                          : 'text-slate-600 dark:text-slate-400'
                      }`}
                    >
                      Échéance : {formatDateFr(t.dueDate)}
                      {t.isOverdue ? ' (En retard)' : ''}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {canUpdate ? (
                    <>
                      {t.status !== TaskStatus.DONE && (
                        <button
                          onClick={() => onUpdateTaskStatus(t.id, TaskStatus.DONE)}
                          className="px-3 py-1.5 text-xs font-medium text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800 rounded-md hover:bg-emerald-100 flex items-center gap-1"
                        >
                          <Check className="w-3.5 h-3.5" /> Marquer fait
                        </button>
                      )}
                      <select
                        value={t.status}
                        onChange={(e) => onUpdateTaskStatus(t.id, e.target.value as TaskStatus)}
                        className="px-2.5 py-1.5 text-xs font-medium bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-md"
                      >
                        {Object.entries(TASK_STATUS_LABELS).map(([k, v]) => (
                          <option key={k} value={k}>
                            {v}
                          </option>
                        ))}
                      </select>
                    </>
                  ) : (
                    <span className="text-xs text-slate-400">{TASK_STATUS_LABELS[t.status]}</span>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

// ============================================================================
// 7. HISTORIQUE D'ACTIVITÉ & CENTRE D'EXPORTS CONTRÔLÉS
// ============================================================================
export function ActivitiesAndExportView({
  activities,
  currentUser,
  onRefreshActivities,
}: {
  activities: ActivityLog[];
  currentUser: User;
  onRefreshActivities: (entityType?: string) => Promise<void>;
}) {
  const [entityFilter, setEntityFilter] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [exportStatus, setExportStatus] = useState<string | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);

  const handleFilterChange = async (type: string) => {
    setEntityFilter(type);
    await onRefreshActivities(type);
  };

  const filteredActivities = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return activities;
    return activities.filter(
      (a) =>
        a.summary.toLowerCase().includes(q) ||
        a.actorName.toLowerCase().includes(q) ||
        a.entityLabel.toLowerCase().includes(q) ||
        a.action.toLowerCase().includes(q)
    );
  }, [activities, searchQuery]);

  const triggerExport = async (
    entity: 'contacts' | 'opportunities' | 'quotes' | 'invoices' | 'activities',
    format: 'csv' | 'json'
  ) => {
    setExportError(null);
    setExportStatus(`Préparation de l'export ${entity.toUpperCase()} (${format.toUpperCase()})...`);
    try {
      const { filename, content, mimeType } = await api.downloadExport(entity, format);
      const blob = new Blob([content], { type: mimeType });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      setExportStatus(
        `Export téléchargé : ${filename} (Événement consigné dans la piste d'audit).`
      );
      await onRefreshActivities(entityFilter);
    } catch (err: any) {
      setExportStatus(null);
      setExportError(err.message || "Erreur lors de l'export.");
    }
  };

  return (
    <div className="space-y-8">
      {/* Centre d'Exports Contrôlés */}
      <div className="p-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-4 border-b border-slate-200 dark:border-slate-800">
          <div>
            <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">
              Centre d’Exports Contrôlés (CSV & JSON)
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Protection serveur anti-injection CSV (OWASP Formula Injection), filtrage automatique par périmètre de rôle ({ROLE_LABELS[currentUser.role]}) et traçabilité d’audit obligatoire.
            </p>
          </div>
          <div className="text-xs font-mono text-slate-600 dark:text-slate-400">
            Périmètre d’export :{' '}
            <strong className="text-slate-900 dark:text-slate-100">
              {currentUser.role === Role.SALES ? 'Portefeuille personnel (OWNED_ONLY)' : 'Global Entreprise (GLOBAL)'}
            </strong>
          </div>
        </div>

        {exportStatus && (
          <div className="p-3 bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800 rounded text-xs text-emerald-800 dark:text-emerald-300">
            {exportStatus}
          </div>
        )}
        {exportError && (
          <div className="p-3 bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-800 rounded text-xs text-red-700 dark:text-red-300">
            {exportError}
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          {[
            { id: 'contacts', title: 'Prospects & Clients', desc: 'Coordonnées, TVA, statut' },
            { id: 'opportunities', title: 'Pipeline Opportunités', desc: 'Montants HT & pondérés' },
            { id: 'quotes', title: 'Devis Commerciaux', desc: 'Totaux HT, remises, TTC' },
            { id: 'invoices', title: 'Facturier & Soldes', desc: 'Encaissé TTC & reste dû' },
            {
              id: 'activities',
              title: 'Journal d’Audit',
              desc: 'Réservé Admin / Manager',
            },
          ].map((item) => (
            <div
              key={item.id}
              className="p-4 border border-slate-200 dark:border-slate-800 rounded-lg flex flex-col justify-between space-y-4 bg-slate-50/40 dark:bg-slate-800/20"
            >
              <div>
                <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  {item.title}
                </div>
                <div className="text-xs text-slate-500 mt-0.5">{item.desc}</div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => triggerExport(item.id as any, 'csv')}
                  className="flex-1 px-2.5 py-1.5 text-xs font-medium text-white bg-slate-900 dark:bg-blue-600 rounded hover:bg-slate-800 flex items-center justify-center gap-1"
                >
                  <Download className="w-3.5 h-3.5" /> CSV
                </button>
                <button
                  onClick={() => triggerExport(item.id as any, 'json')}
                  className="px-2.5 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  JSON
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Historique d'activité immuable */}
      <div className="space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100">
              Piste d’Audit & Historique d’Activité Immuable
            </h2>
            <p className="text-xs text-slate-500">
              Traçabilité chronologique complète de chaque création, modification de statut, règlement et export
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg overflow-x-auto">
              {['ALL', 'CONTACT', 'OPPORTUNITY', 'QUOTE', 'INVOICE', 'TASK', 'EXPORT'].map((t) => (
                <button
                  key={t}
                  onClick={() => handleFilterChange(t)}
                  className={`px-2.5 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 ${
                    entityFilter === t
                      ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 shadow-xs'
                      : 'text-slate-600 dark:text-slate-400'
                  }`}
                >
                  {t === 'ALL' ? 'Tous' : t}
                </button>
              ))}
            </div>

            <div className="relative w-full sm:w-64">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Rechercher acteur, action..."
                className="w-full pl-8 pr-3 py-1.5 text-xs bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg"
              />
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40 text-xs font-semibold text-slate-600 dark:text-slate-300">
                <th className="py-3 px-4">Horodatage</th>
                <th className="py-3 px-4">Acteur & Rôle</th>
                <th className="py-3 px-4">Module / Objet</th>
                <th className="py-3 px-4">Description de l’opération</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800 text-xs">
              {filteredActivities.map((a) => (
                <tr key={a.id} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40">
                  <td className="py-3 px-4 font-mono tabular-nums text-slate-500 whitespace-nowrap">
                    {formatDateTimeFr(a.createdAt)}
                  </td>
                  <td className="py-3 px-4 whitespace-nowrap">
                    <span className="font-semibold text-slate-900 dark:text-slate-100">
                      {a.actorName}
                    </span>
                    <span className="text-slate-500"> · {ROLE_LABELS[a.actorRole]}</span>
                  </td>
                  <td className="py-3 px-4">
                    <div className="font-mono text-[11px] text-slate-500">{a.entityType}</div>
                    <div className="font-medium text-slate-800 dark:text-slate-200">
                      {a.entityLabel}
                    </div>
                  </td>
                  <td className="py-3 px-4 text-slate-700 dark:text-slate-300">{a.summary}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

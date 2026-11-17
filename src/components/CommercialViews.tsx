/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Vues Commerciales restructurées (UI/UX Haute Précision) :
 * 1. DashboardView : Pilotage Exécutif, Filtre Périmètre (Global vs Mon Portefeuille), Entonnoir Pipeline, Trésorerie & Actions Rapides
 * 2. ContactsView : Split-View Master-Detail (Table haute densité + Panneau d'inspection Client 360° latéral avec Opportunités, Devis, Factures et Relances liés)
 * 3. PipelineView : Kanban structuré par étape avec progression, filtres par commercial, recherche et actions rapides
 */

import React, { useMemo, useState } from 'react';
import {
  AlertCircle,
  ArrowUpRight,
  Building2,
  Calendar,
  Check,
  ChevronRight,
  Clock,
  FileText,
  Filter,
  Kanban,
  Mail,
  MapPin,
  Phone,
  Plus,
  Receipt,
  Search,
  Trash2,
  TrendingUp,
  UserCheck,
  Users,
  X,
} from 'lucide-react';
import {
  Contact,
  ContactStatus,
  DashboardSummary,
  FollowUpTask,
  Invoice,
  InvoiceStatus,
  Opportunity,
  OpportunityStage,
  Quote,
  QuoteStatus,
  Role,
  TaskPriority,
  TaskStatus,
  User,
} from '../types/domain.ts';
import {
  CONTACT_STATUS_LABELS,
  formatCurrency,
  formatDateFr,
  formatDateTimeFr,
  INVOICE_STATUS_LABELS,
  OPPORTUNITY_STAGE_LABELS,
  QUOTE_STATUS_LABELS,
  ROLE_LABELS,
  TASK_PRIORITY_LABELS,
  TASK_TYPE_LABELS,
} from '../utils/formatters.ts';

// ============================================================================
// 1. TABLEAU DE BORD EXÉCUTIF (DASHBOARD)
// ============================================================================
export function DashboardView({
  summary,
  currentUser,
  dashboardScope,
  onScopeChange,
  onNavigate,
  onCompleteTask,
  onQuickCreateQuote,
  onQuickCreateContact,
}: {
  summary: DashboardSummary | null;
  currentUser: User;
  dashboardScope: 'all' | 'mine';
  onScopeChange: (scope: 'all' | 'mine') => void;
  onNavigate: (tab: string) => void;
  onCompleteTask: (id: string) => Promise<void>;
  onQuickCreateQuote: () => void;
  onQuickCreateContact: () => void;
}) {
  if (!summary) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {[1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="h-32 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 animate-pulse"
            />
          ))}
        </div>
      </div>
    );
  }

  const { kpis, pipelineByStage, revenueByMonth, urgentTasks, recentActivities } = summary;
  const maxStageHt = Math.max(...pipelineByStage.map((s) => s.totalHt), 1);
  const maxMonthRev = Math.max(
    ...revenueByMonth.map((m) => Math.max(m.invoicedHt, m.quotesHt, m.collectedTtc)),
    1
  );

  const collectionRatePercent =
    kpis.invoicedTotalTtc > 0
      ? Math.round((kpis.collectedTotalTtc / kpis.invoicedTotalTtc) * 100)
      : 0;

  return (
    <div className="space-y-8">
      {/* En-tête structuré avec Sélecteur de Périmètre et Actions Directes */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-6 border-b border-slate-200 dark:border-slate-800">
        <div>
          <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
            Vue Synthétique · {currentUser.name} ({ROLE_LABELS[currentUser.role]})
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100 mt-1">
            Pilotage Commercial & Trésorerie Facturée
          </h1>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Sélecteur de périmètre interactif */}
          <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg">
            <button
              onClick={() => onScopeChange('all')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                dashboardScope === 'all'
                  ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              Périmètre Entreprise
            </button>
            <button
              onClick={() => onScopeChange('mine')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                dashboardScope === 'mine'
                  ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              Mon Portefeuille
            </button>
          </div>

          <button
            onClick={onQuickCreateContact}
            className="px-3.5 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0"
          >
            + Nouveau Compte
          </button>
          <button
            onClick={onQuickCreateQuote}
            className="px-4 py-2 text-xs font-medium text-white bg-slate-900 dark:bg-blue-600 rounded-lg hover:bg-slate-800 dark:hover:bg-blue-500 transition-colors whitespace-nowrap shrink-0"
          >
            + Émettre un Devis
          </button>
        </div>
      </div>

      {/* Bandeau d'alerte intelligent si factures échues ou relances en retard */}
      {(kpis.overdueInvoicesCount > 0 || kpis.overdueTasksCount > 0) && (
        <div className="p-4 bg-amber-50/70 dark:bg-amber-950/30 border border-amber-200/80 dark:border-amber-800/60 rounded-lg flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-start sm:items-center gap-3 text-xs text-amber-900 dark:text-amber-200">
            <AlertCircle className="w-4 h-4 text-amber-700 dark:text-amber-400 shrink-0 mt-0.5 sm:mt-0" />
            <div>
              <span className="font-semibold">Points d’attention prioritaires : </span>
              {kpis.overdueInvoicesCount > 0 && (
                <span>
                  {kpis.overdueInvoicesCount} facture{kpis.overdueInvoicesCount > 1 ? 's' : ''} échue{kpis.overdueInvoicesCount > 1 ? 's' : ''} pour un montant de{' '}
                  <strong className="font-mono tabular-nums">{formatCurrency(kpis.overdueInvoicesTtc)}</strong>
                </span>
              )}
              {kpis.overdueInvoicesCount > 0 && kpis.overdueTasksCount > 0 && <span> · </span>}
              {kpis.overdueTasksCount > 0 && (
                <span>
                  {kpis.overdueTasksCount} tâche{kpis.overdueTasksCount > 1 ? 's' : ''} de relance en retard d’échéance.
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {kpis.overdueInvoicesCount > 0 && (
              <button
                onClick={() => onNavigate('invoices')}
                className="px-3 py-1.5 text-xs font-medium text-amber-900 dark:text-amber-200 bg-white dark:bg-slate-900 border border-amber-300 dark:border-amber-700 rounded-md hover:bg-amber-100/50 transition-colors whitespace-nowrap shrink-0"
              >
                Voir les impayés
              </button>
            )}
            <button
              onClick={() => onNavigate('tasks')}
              className="px-3 py-1.5 text-xs font-medium text-white bg-amber-800 hover:bg-amber-700 rounded-md transition-colors whitespace-nowrap shrink-0"
            >
              Traiter les relances
            </button>
          </div>
        </div>
      )}

      {/* 4 Cartes KPI Structurées avec Barres de Progression Visuelles */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        {/* KPI 1 : Pipeline Pondéré */}
        <div
          onClick={() => onNavigate('pipeline')}
          className="group cursor-pointer p-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg hover:border-slate-300 dark:hover:border-slate-700 transition-colors flex flex-col justify-between"
        >
          <div>
            <div className="flex items-center justify-between text-xs font-medium text-slate-500 dark:text-slate-400">
              <span>Pipeline Pondéré (HT)</span>
              <ArrowUpRight className="w-3.5 h-3.5 opacity-0 group-hover:opacity-100 transition-opacity text-slate-400" />
            </div>
            <div className="mt-2 text-2xl font-bold font-mono tabular-nums text-slate-900 dark:text-slate-100">
              {formatCurrency(kpis.weightedPipelineHt)}
            </div>
          </div>
          <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800/80 space-y-2">
            <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
              <span>Volume Brut ouvert</span>
              <span className="font-mono tabular-nums font-medium text-slate-800 dark:text-slate-200">
                {formatCurrency(kpis.openPipelineHt)}
              </span>
            </div>
            <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
              <span>Affaires gagnées</span>
              <span className="font-mono tabular-nums font-medium text-emerald-700 dark:text-emerald-400">
                {formatCurrency(kpis.wonOpportunitiesHt)}
              </span>
            </div>
          </div>
        </div>

        {/* KPI 2 : Facturation & Transformation Devis */}
        <div
          onClick={() => onNavigate('quotes')}
          className="group cursor-pointer p-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg hover:border-slate-300 dark:hover:border-slate-700 transition-colors flex flex-col justify-between"
        >
          <div>
            <div className="flex items-center justify-between text-xs font-medium text-slate-500 dark:text-slate-400">
              <span>Volume Facturé (TTC)</span>
              <ArrowUpRight className="w-3.5 h-3.5 opacity-0 group-hover:opacity-100 transition-opacity text-slate-400" />
            </div>
            <div className="mt-2 text-2xl font-bold font-mono tabular-nums text-slate-900 dark:text-slate-100">
              {formatCurrency(kpis.invoicedTotalTtc)}
            </div>
          </div>
          <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800/80 space-y-2">
            <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
              <span>Chiffre d’affaires Net HT</span>
              <span className="font-mono tabular-nums font-medium text-slate-800 dark:text-slate-200">
                {formatCurrency(kpis.invoicedTotalHt)}
              </span>
            </div>
            <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
              <span>Taux d’acceptation devis</span>
              <span className="font-mono tabular-nums font-semibold text-blue-600 dark:text-blue-400">
                {kpis.quotesAcceptedRatePercent}%
              </span>
            </div>
          </div>
        </div>

        {/* KPI 3 : Trésorerie Encaissée & Recouvrement */}
        <div
          onClick={() => onNavigate('invoices')}
          className="group cursor-pointer p-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg hover:border-slate-300 dark:hover:border-slate-700 transition-colors flex flex-col justify-between"
        >
          <div>
            <div className="flex items-center justify-between text-xs font-medium text-slate-500 dark:text-slate-400">
              <span>Trésorerie Encaissée (TTC)</span>
              <span className="font-mono tabular-nums text-emerald-700 dark:text-emerald-400">
                {collectionRatePercent}% recouvré
              </span>
            </div>
            <div className="mt-2 text-2xl font-bold font-mono tabular-nums text-emerald-700 dark:text-emerald-400">
              {formatCurrency(kpis.collectedTotalTtc)}
            </div>
          </div>
          <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800/80 space-y-2">
            <div className="h-1.5 w-full bg-slate-100 dark:bg-slate-800 rounded overflow-hidden">
              <div
                className="h-full bg-emerald-600 dark:bg-emerald-500"
                style={{ width: `${Math.min(100, collectionRatePercent)}%` }}
              />
            </div>
            <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
              <span>Reste à encaisser</span>
              <span className="font-mono tabular-nums font-medium text-slate-800 dark:text-slate-200">
                {formatCurrency(kpis.outstandingBalanceTtc)}
              </span>
            </div>
          </div>
        </div>

        {/* KPI 4 : Base Clients & Conversion */}
        <div
          onClick={() => onNavigate('contacts')}
          className="group cursor-pointer p-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg hover:border-slate-300 dark:hover:border-slate-700 transition-colors flex flex-col justify-between"
        >
          <div>
            <div className="flex items-center justify-between text-xs font-medium text-slate-500 dark:text-slate-400">
              <span>Comptes & Conversion</span>
              <ArrowUpRight className="w-3.5 h-3.5 opacity-0 group-hover:opacity-100 transition-opacity text-slate-400" />
            </div>
            <div className="mt-2 text-2xl font-bold font-mono tabular-nums text-slate-900 dark:text-slate-100">
              {kpis.activeClientsCount} <span className="text-sm font-sans font-normal text-slate-500">clients actifs</span>
            </div>
          </div>
          <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800/80 space-y-2">
            <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
              <span>Prospects en qualification</span>
              <span className="font-mono tabular-nums font-medium text-slate-800 dark:text-slate-200">
                {kpis.prospectsCount} ({kpis.qualifiedProspectsCount} qualifiés)
              </span>
            </div>
            <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
              <span>Taux de conversion compte</span>
              <span className="font-mono tabular-nums font-semibold text-slate-900 dark:text-slate-100">
                {kpis.conversionRatePercent}%
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Grille Centrale : Entonnoir Pipeline (7 col) + Flux Mensuel (5 col) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-7 p-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-4 mb-5 border-b border-slate-100 dark:border-slate-800">
              <div>
                <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
                  Architecture du Pipeline par Étape
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Superposition du montant brut estimé HT et du montant pondéré serveur
                </p>
              </div>
              <button
                onClick={() => onNavigate('pipeline')}
                className="text-xs font-medium text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1 whitespace-nowrap shrink-0"
              >
                Ouvrir le Kanban <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="space-y-4">
              {pipelineByStage.map((item) => {
                const widthPercent = Math.max(3, Math.round((item.totalHt / maxStageHt) * 100));
                const weightedPercent = Math.max(
                  item.weightedHt > 0 ? 2 : 0,
                  Math.round((item.weightedHt / maxStageHt) * 100)
                );
                return (
                  <div key={item.stage} className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-slate-800 dark:text-slate-200">
                          {item.label}
                        </span>
                        <span className="text-slate-400 dark:text-slate-500 font-mono tabular-nums">
                          · {item.count} affaire{item.count > 1 ? 's' : ''}
                        </span>
                      </div>
                      <div className="font-mono tabular-nums text-slate-600 dark:text-slate-300">
                        <span className="text-slate-400">Brut :</span> {formatCurrency(item.totalHt)}
                        <span className="mx-2 text-slate-300 dark:text-slate-700">|</span>
                        <span className="font-semibold text-slate-900 dark:text-slate-100">
                          Pondéré : {formatCurrency(item.weightedHt)}
                        </span>
                      </div>
                    </div>
                    <div className="h-2.5 w-full bg-slate-100 dark:bg-slate-800 rounded overflow-hidden relative">
                      <div
                        className="h-full bg-slate-300 dark:bg-slate-700 rounded transition-all"
                        style={{ width: `${widthPercent}%` }}
                      />
                      <div
                        className={`h-full rounded absolute top-0 left-0 transition-all ${
                          item.stage === OpportunityStage.WON
                            ? 'bg-emerald-600 dark:bg-emerald-500'
                            : 'bg-blue-600 dark:bg-blue-500'
                        }`}
                        style={{ width: `${weightedPercent}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="mt-6 pt-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs text-slate-500">
            <div className="flex items-center gap-4">
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 bg-slate-300 dark:bg-slate-700 inline-block rounded-xs" />
                Montant Brut HT
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 bg-blue-600 inline-block rounded-xs" />
                Montant Pondéré HT
              </span>
            </div>
            <span className="font-mono tabular-nums">
              Total Pondéré Ouvert : <strong>{formatCurrency(kpis.weightedPipelineHt)}</strong>
            </span>
          </div>
        </div>

        {/* Performance Mensuelle Facturation vs Encaissement */}
        <div className="lg:col-span-5 p-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-4 mb-5 border-b border-slate-100 dark:border-slate-800">
              <div>
                <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
                  Cadence Mensuelle & Encaissements
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Suivi comparatif Devis émis HT, Facturé HT et Encaissé TTC
                </p>
              </div>
              <button
                onClick={() => onNavigate('invoices')}
                className="text-xs font-medium text-blue-600 dark:text-blue-400 hover:underline whitespace-nowrap shrink-0"
              >
                Facturier
              </button>
            </div>

            <div className="space-y-4">
              {revenueByMonth.map((m) => (
                <div
                  key={m.month}
                  className="p-3.5 bg-slate-50/70 dark:bg-slate-800/30 border border-slate-200/70 dark:border-slate-800 rounded-lg space-y-2.5"
                >
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold text-slate-900 dark:text-slate-100">{m.month}</span>
                    <span className="text-slate-500 font-mono tabular-nums">
                      Devis émis : {formatCurrency(m.quotesHt)} HT
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-3 text-xs">
                    <div>
                      <div className="text-slate-500 dark:text-slate-400 text-[11px]">Facturé Net HT</div>
                      <div className="font-mono tabular-nums font-semibold text-slate-900 dark:text-slate-100 mt-0.5">
                        {formatCurrency(m.invoicedHt)}
                      </div>
                    </div>
                    <div>
                      <div className="text-slate-500 dark:text-slate-400 text-[11px]">Encaissé TTC</div>
                      <div className="font-mono tabular-nums font-semibold text-emerald-700 dark:text-emerald-400 mt-0.5">
                        {formatCurrency(m.collectedTtc)}
                      </div>
                    </div>
                  </div>
                  <div className="h-1.5 w-full bg-slate-200 dark:bg-slate-700 rounded overflow-hidden">
                    <div
                      className="h-full bg-emerald-600 dark:bg-emerald-500"
                      style={{
                        width: `${Math.min(100, Math.round((m.collectedTtc / maxMonthRev) * 100))}%`,
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Grille Basse : Relances Prioritaires & Piste d'Audit */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-6 p-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg">
          <div className="flex items-center justify-between pb-4 mb-4 border-b border-slate-100 dark:border-slate-800">
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
                File d’Attente des Relances Commerciales
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Actions immédiates triées par urgence et date d’échéance
              </p>
            </div>
            <button
              onClick={() => onNavigate('tasks')}
              className="text-xs font-medium text-blue-600 dark:text-blue-400 hover:underline whitespace-nowrap shrink-0"
            >
              Gérer l’agenda ({kpis.pendingTasksCount})
            </button>
          </div>

          {urgentTasks.length === 0 ? (
            <div className="py-10 text-center text-xs text-slate-500">
              Aucune tâche de relance en attente.
            </div>
          ) : (
            <div className="divide-y divide-slate-200 dark:divide-slate-800">
              {urgentTasks.map((task) => (
                <div
                  key={task.id}
                  className="py-3.5 first:pt-0 last:pb-0 flex items-start justify-between gap-4"
                >
                  <div className="space-y-1 min-w-0">
                    <div className="text-xs font-semibold text-slate-900 dark:text-slate-100 truncate">
                      {task.title}
                    </div>
                    <div className="text-xs text-slate-500 dark:text-slate-400 flex flex-wrap items-center gap-1.5">
                      <span>{TASK_TYPE_LABELS[task.type]}</span>
                      <span aria-hidden="true">·</span>
                      <span
                        className={
                          task.priority === TaskPriority.URGENT
                            ? 'text-red-600 dark:text-red-400 font-medium'
                            : ''
                        }
                      >
                        Priorité {TASK_PRIORITY_LABELS[task.priority]}
                      </span>
                      {task.companyName && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span className="text-slate-700 dark:text-slate-300 font-medium">
                            {task.companyName}
                          </span>
                        </>
                      )}
                      <span aria-hidden="true">·</span>
                      <span
                        className={`font-mono tabular-nums ${
                          task.isOverdue
                            ? 'text-red-600 dark:text-red-400 font-semibold'
                            : 'text-slate-600 dark:text-slate-400'
                        }`}
                      >
                        Échéance : {formatDateFr(task.dueDate)}
                        {task.isOverdue ? ' (En retard)' : ''}
                      </span>
                    </div>
                  </div>
                  <button
                    onClick={() => onCompleteTask(task.id)}
                    className="px-3 py-1.5 text-xs font-medium text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800 rounded-md hover:bg-emerald-100 transition-colors whitespace-nowrap shrink-0 flex items-center gap-1"
                  >
                    <Check className="w-3.5 h-3.5" /> Clôturer
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="lg:col-span-6 p-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg">
          <div className="flex items-center justify-between pb-4 mb-4 border-b border-slate-100 dark:border-slate-800">
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
                Piste d’Audit & Activités Récentes
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Journalisation automatique des opérations sensibles et commerciales
              </p>
            </div>
            <button
              onClick={() => onNavigate('activities')}
              className="text-xs font-medium text-blue-600 dark:text-blue-400 hover:underline whitespace-nowrap shrink-0"
            >
              Journal complet
            </button>
          </div>

          <div className="divide-y divide-slate-200 dark:divide-slate-800">
            {recentActivities.slice(0, 6).map((act) => (
              <div key={act.id} className="py-3 first:pt-0 last:pb-0 space-y-1">
                <div className="text-xs font-medium text-slate-900 dark:text-slate-100">
                  {act.summary}
                </div>
                <div className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                  <span className="font-semibold text-slate-700 dark:text-slate-300">
                    {act.actorName}
                  </span>
                  <span aria-hidden="true">·</span>
                  <span>{ROLE_LABELS[act.actorRole]}</span>
                  <span aria-hidden="true">·</span>
                  <span className="font-mono">{act.entityType}</span>
                  <span aria-hidden="true">·</span>
                  <span className="font-mono tabular-nums">{formatDateTimeFr(act.createdAt)}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// 2. RÉFÉRENTIEL PROSPECTS & CLIENTS AVEC FICHE 360° (MASTER-DETAIL)
// ============================================================================
export function ContactsView({
  contacts,
  opportunities,
  quotes,
  invoices,
  tasks,
  users,
  currentUser,
  initialShowCreate = false,
  onClearInitialCreate,
  onCreateContact,
  onUpdateContact,
  onDeleteContact,
  onNavigateToModule,
}: {
  contacts: Contact[];
  opportunities: Opportunity[];
  quotes: Quote[];
  invoices: Invoice[];
  tasks: FollowUpTask[];
  users: User[];
  currentUser: User;
  initialShowCreate?: boolean;
  onClearInitialCreate?: () => void;
  onCreateContact: (data: Partial<Contact>) => Promise<void>;
  onUpdateContact: (id: string, data: Partial<Contact>) => Promise<void>;
  onDeleteContact: (id: string) => Promise<void>;
  onNavigateToModule: (tab: string) => void;
}) {
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [ownerFilter, setOwnerFilter] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedContactId, setSelectedContactId] = useState<string | null>(
    contacts[0]?.id || null
  );
  const [showForm, setShowForm] = useState<boolean>(initialShowCreate);
  const [editingContact, setEditingContact] = useState<Contact | null>(null);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [formState, setFormState] = useState({
    companyName: '',
    contactName: '',
    email: '',
    phone: '',
    status: ContactStatus.PROSPECT,
    industry: '',
    city: '',
    country: 'France',
    vatNumber: '',
    source: 'Entrant site web',
    ownerId: currentUser.id,
    notes: '',
  });

  const openCreateModal = () => {
    setEditingContact(null);
    setFormError(null);
    setFormState({
      companyName: '',
      contactName: '',
      email: '',
      phone: '',
      status: ContactStatus.PROSPECT,
      industry: '',
      city: '',
      country: 'France',
      vatNumber: '',
      source: 'Entrant site web',
      ownerId: currentUser.id,
      notes: '',
    });
    setShowForm(true);
    if (onClearInitialCreate) onClearInitialCreate();
  };

  const openEditModal = (c: Contact) => {
    setEditingContact(c);
    setFormError(null);
    setFormState({
      companyName: c.companyName,
      contactName: c.contactName,
      email: c.email,
      phone: c.phone,
      status: c.status,
      industry: c.industry,
      city: c.city,
      country: c.country,
      vatNumber: c.vatNumber,
      source: c.source,
      ownerId: c.ownerId,
      notes: c.notes,
    });
    setShowForm(true);
  };

  const filteredContacts = useMemo(() => {
    return contacts.filter((c) => {
      const matchesStatus = statusFilter === 'ALL' || c.status === statusFilter;
      const matchesOwner = ownerFilter === 'ALL' || c.ownerId === ownerFilter;
      const q = searchQuery.toLowerCase().trim();
      const matchesSearch =
        !q ||
        c.companyName.toLowerCase().includes(q) ||
        c.contactName.toLowerCase().includes(q) ||
        c.email.toLowerCase().includes(q) ||
        c.city.toLowerCase().includes(q) ||
        c.industry.toLowerCase().includes(q);
      return matchesStatus && matchesOwner && matchesSearch;
    });
  }, [contacts, statusFilter, ownerFilter, searchQuery]);

  const selectedContact = useMemo(
    () => contacts.find((c) => c.id === selectedContactId) || filteredContacts[0] || null,
    [contacts, selectedContactId, filteredContacts]
  );

  // Agrégations Client 360° pour le contact sélectionné
  const contact360 = useMemo(() => {
    if (!selectedContact) return null;
    const cOpps = opportunities.filter((o) => o.contactId === selectedContact.id);
    const cQuotes = quotes.filter((q) => q.contactId === selectedContact.id);
    const cInvoices = invoices.filter((i) => i.contactId === selectedContact.id);
    const cTasks = tasks.filter((t) => t.contactId === selectedContact.id);

    const totalInvoicedTtc = cInvoices.reduce((acc, i) => acc + i.totalTtc, 0);
    const totalPaidTtc = cInvoices.reduce((acc, i) => acc + i.amountPaid, 0);
    const totalBalanceDueTtc = cInvoices.reduce((acc, i) => acc + i.balanceDue, 0);
    const totalPipelineHt = cOpps.reduce((acc, o) => acc + o.estimatedAmountHt, 0);

    return {
      opportunities: cOpps,
      quotes: cQuotes,
      invoices: cInvoices,
      tasks: cTasks,
      totalInvoicedTtc,
      totalPaidTtc,
      totalBalanceDueTtc,
      totalPipelineHt,
    };
  }, [selectedContact, opportunities, quotes, invoices, tasks]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setFormError(null);
    try {
      if (editingContact) {
        await onUpdateContact(editingContact.id, formState);
      } else {
        await onCreateContact(formState);
      }
      setShowForm(false);
    } catch (err: any) {
      setFormError(err.message || "Erreur lors de l'enregistrement.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* En-tête de section */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-slate-200 dark:border-slate-800">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
            Référentiel Comptes — Prospects & Clients 360°
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
            Sélectionnez une entreprise dans la liste pour inspecter son dossier 360° (opportunités, devis, factures et relances rattachés)
          </p>
        </div>
        <button
          onClick={openCreateModal}
          className="px-4 py-2 text-xs font-medium text-white bg-slate-900 dark:bg-blue-600 rounded-lg hover:bg-slate-800 dark:hover:bg-blue-500 transition-colors flex items-center gap-2 whitespace-nowrap shrink-0 self-start sm:self-auto"
        >
          <Plus className="w-4 h-4" /> Nouveau Compte
        </button>
      </div>

      {/* Barre d'outils : Filtres par statut, filtre par commercial et recherche instantanée */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg overflow-x-auto">
            {[
              { id: 'ALL', label: `Tous (${contacts.length})` },
              {
                id: ContactStatus.PROSPECT,
                label: `Prospects (${contacts.filter((c) => c.status === ContactStatus.PROSPECT).length})`,
              },
              {
                id: ContactStatus.QUALIFIED_PROSPECT,
                label: `Qualifiés (${contacts.filter((c) => c.status === ContactStatus.QUALIFIED_PROSPECT).length})`,
              },
              {
                id: ContactStatus.ACTIVE_CLIENT,
                label: `Clients Actifs (${contacts.filter((c) => c.status === ContactStatus.ACTIVE_CLIENT).length})`,
              },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setStatusFilter(tab.id)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                  statusFilter === tab.id
                    ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <select
            aria-label="Filtrer par commercial responsable"
            value={ownerFilter}
            onChange={(e) => setOwnerFilter(e.target.value)}
            className="px-3 py-2 text-xs bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-700 dark:text-slate-200"
          >
            <option value="ALL">Tous les responsables</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                Resp. : {u.name}
              </option>
            ))}
          </select>
        </div>

        <div className="relative w-full lg:w-80">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Rechercher société, interlocuteur, ville..."
            className="w-full pl-9 pr-4 py-2 text-xs bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-600"
          />
        </div>
      </div>

      {/* Formulaire de Création / Modification */}
      {showForm && (
        <form
          onSubmit={handleSubmit}
          className="p-6 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg space-y-5"
        >
          <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
            <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
              {editingContact
                ? `Modifier le compte : ${editingContact.companyName}`
                : 'Enregistrer un nouveau Prospect / Client'}
            </h2>
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {formError && (
            <div className="p-3 bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-800 rounded text-xs text-red-700 dark:text-red-300 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{formError}</span>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Raison sociale *
              </label>
              <input
                type="text"
                required
                value={formState.companyName}
                onChange={(e) => setFormState({ ...formState, companyName: e.target.value })}
                className="w-full px-3 py-2 text-xs bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-md"
                placeholder="Ex: Atelier Lumière SAS"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Interlocuteur principal *
              </label>
              <input
                type="text"
                required
                value={formState.contactName}
                onChange={(e) => setFormState({ ...formState, contactName: e.target.value })}
                className="w-full px-3 py-2 text-xs bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-md"
                placeholder="Ex: Hélène Rochefort"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Statut commercial *
              </label>
              <select
                value={formState.status}
                onChange={(e) =>
                  setFormState({ ...formState, status: e.target.value as ContactStatus })
                }
                className="w-full px-3 py-2 text-xs bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-md"
              >
                {Object.entries(CONTACT_STATUS_LABELS).map(([k, label]) => (
                  <option key={k} value={k}>
                    {label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Email professionnel *
              </label>
              <input
                type="email"
                required
                value={formState.email}
                onChange={(e) => setFormState({ ...formState, email: e.target.value })}
                className="w-full px-3 py-2 text-xs bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-md"
                placeholder="contact@entreprise.fr"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Téléphone *
              </label>
              <input
                type="text"
                required
                value={formState.phone}
                onChange={(e) => setFormState({ ...formState, phone: e.target.value })}
                className="w-full px-3 py-2 text-xs bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-md"
                placeholder="+33 4 72 00 00 00"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Secteur d’activité *
              </label>
              <input
                type="text"
                required
                value={formState.industry}
                onChange={(e) => setFormState({ ...formState, industry: e.target.value })}
                className="w-full px-3 py-2 text-xs bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-md"
                placeholder="Industrie, Logistique, Santé..."
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Ville *
              </label>
              <input
                type="text"
                required
                value={formState.city}
                onChange={(e) => setFormState({ ...formState, city: e.target.value })}
                className="w-full px-3 py-2 text-xs bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-md"
                placeholder="Lyon, Lille, Nantes..."
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                N° TVA Intracommunautaire
              </label>
              <input
                type="text"
                value={formState.vatNumber}
                onChange={(e) => setFormState({ ...formState, vatNumber: e.target.value })}
                className="w-full px-3 py-2 text-xs font-mono bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-md"
                placeholder="FR42819203411"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Responsable du compte
              </label>
              <select
                value={formState.ownerId}
                disabled={currentUser.role === Role.SALES}
                onChange={(e) => setFormState({ ...formState, ownerId: e.target.value })}
                className="w-full px-3 py-2 text-xs bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-md disabled:opacity-60"
              >
                {users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name} ({ROLE_LABELS[u.role]})
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
              Notes de qualification et contexte
            </label>
            <textarea
              rows={2}
              value={formState.notes}
              onChange={(e) => setFormState({ ...formState, notes: e.target.value })}
              className="w-full px-3 py-2 text-xs bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-md"
              placeholder="Besoins identifiés, échéances, décideurs..."
            />
          </div>

          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="px-4 py-2 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-md"
            >
              Annuler
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-4 py-2 text-xs font-medium text-white bg-slate-900 dark:bg-blue-600 rounded-md hover:bg-slate-800 disabled:opacity-50"
            >
              {submitting ? 'Enregistrement...' : 'Enregistrer le compte'}
            </button>
          </div>
        </form>
      )}

      {/* Architecture Master-Detail : Liste à gauche (7 col) + Fiche Client 360° à droite (5 col) */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
        {/* Colonne Gauche : Table haute densité */}
        <div className="xl:col-span-7 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40 text-xs font-semibold text-slate-600 dark:text-slate-300">
                  <th className="py-3 px-4">Entreprise & Secteur</th>
                  <th className="py-3 px-4">Interlocuteur</th>
                  <th className="py-3 px-4">Statut</th>
                  <th className="py-3 px-4">Ville</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800 text-xs">
                {filteredContacts.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-12 text-center text-slate-500">
                      Aucun compte ne correspond à vos filtres.
                    </td>
                  </tr>
                ) : (
                  filteredContacts.map((c) => {
                    const isSelected = selectedContact?.id === c.id;
                    const canEdit =
                      currentUser.role !== Role.SALES || c.ownerId === currentUser.id;
                    return (
                      <tr
                        key={c.id}
                        onClick={() => setSelectedContactId(c.id)}
                        className={`cursor-pointer transition-colors ${
                          isSelected
                            ? 'bg-blue-50/60 dark:bg-blue-950/30'
                            : 'hover:bg-slate-50/80 dark:hover:bg-slate-800/40'
                        }`}
                      >
                        <td className="py-3.5 px-4">
                          <div className="font-semibold text-slate-900 dark:text-slate-100">
                            {c.companyName}
                          </div>
                          <div className="text-slate-500 dark:text-slate-400 mt-0.5">
                            {c.industry} · Resp. {c.ownerName?.split(' ')[0] || c.ownerId}
                          </div>
                        </td>
                        <td className="py-3.5 px-4">
                          <div className="font-medium text-slate-800 dark:text-slate-200">
                            {c.contactName}
                          </div>
                          <div className="text-slate-500 dark:text-slate-400 font-mono text-[11px]">
                            {c.email}
                          </div>
                        </td>
                        <td className="py-3.5 px-4">
                          <span
                            className={`font-medium ${
                              c.status === ContactStatus.ACTIVE_CLIENT
                                ? 'text-emerald-700 dark:text-emerald-400'
                                : c.status === ContactStatus.QUALIFIED_PROSPECT
                                ? 'text-blue-700 dark:text-blue-400'
                                : 'text-amber-700 dark:text-amber-400'
                            }`}
                          >
                            {CONTACT_STATUS_LABELS[c.status]}
                          </span>
                        </td>
                        <td className="py-3.5 px-4 text-slate-700 dark:text-slate-300">
                          {c.city}
                        </td>
                        <td
                          className="py-3.5 px-4 text-right whitespace-nowrap space-x-1.5"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {canEdit ? (
                            <button
                              onClick={() => openEditModal(c)}
                              className="px-2.5 py-1 text-xs font-medium text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded hover:bg-slate-100"
                            >
                              Éditer
                            </button>
                          ) : (
                            <span className="text-slate-400 text-[11px]">Lecture seule</span>
                          )}
                          {currentUser.role === Role.ADMIN && (
                            <button
                              onClick={() => onDeleteContact(c.id)}
                              title="Supprimer (Admin uniquement)"
                              className="p-1 text-red-600 hover:bg-red-50 dark:hover:bg-red-950/50 rounded align-middle"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Colonne Droite : Panneau d'Inspection Client 360° */}
        <div className="xl:col-span-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-6 space-y-6">
          {!selectedContact || !contact360 ? (
            <div className="py-16 text-center text-xs text-slate-500">
              Sélectionnez un prospect ou client dans le tableau pour afficher sa vue 360°.
            </div>
          ) : (
            <>
              {/* En-tête Fiche 360° */}
              <div className="pb-4 border-b border-slate-200 dark:border-slate-800 flex items-start justify-between gap-4">
                <div>
                  <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
                    Dossier Compte 360° · {CONTACT_STATUS_LABELS[selectedContact.status]}
                  </div>
                  <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100 mt-0.5">
                    {selectedContact.companyName}
                  </h2>
                  <div className="text-xs text-slate-600 dark:text-slate-400 mt-1">
                    {selectedContact.industry} · Source : {selectedContact.source}
                  </div>
                </div>
                {(currentUser.role !== Role.SALES ||
                  selectedContact.ownerId === currentUser.id) && (
                  <button
                    onClick={() => openEditModal(selectedContact)}
                    className="px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 border border-slate-300 dark:border-slate-700 rounded-md hover:bg-slate-50 dark:hover:bg-slate-800 shrink-0"
                  >
                    Modifier
                  </button>
                )}
              </div>

              {/* Synthèse Financière du Compte */}
              <div className="grid grid-cols-3 gap-3">
                <div className="p-3 bg-slate-50 dark:bg-slate-800/50 rounded-lg">
                  <div className="text-[11px] text-slate-500">Pipeline HT</div>
                  <div className="text-sm font-bold font-mono tabular-nums text-slate-900 dark:text-slate-100 mt-0.5">
                    {formatCurrency(contact360.totalPipelineHt)}
                  </div>
                </div>
                <div className="p-3 bg-slate-50 dark:bg-slate-800/50 rounded-lg">
                  <div className="text-[11px] text-slate-500">Facturé TTC</div>
                  <div className="text-sm font-bold font-mono tabular-nums text-slate-900 dark:text-slate-100 mt-0.5">
                    {formatCurrency(contact360.totalInvoicedTtc)}
                  </div>
                </div>
                <div className="p-3 bg-slate-50 dark:bg-slate-800/50 rounded-lg">
                  <div className="text-[11px] text-slate-500">Solde dû TTC</div>
                  <div
                    className={`text-sm font-bold font-mono tabular-nums mt-0.5 ${
                      contact360.totalBalanceDueTtc > 0
                        ? 'text-amber-700 dark:text-amber-400'
                        : 'text-emerald-700 dark:text-emerald-400'
                    }`}
                  >
                    {formatCurrency(contact360.totalBalanceDueTtc)}
                  </div>
                </div>
              </div>

              {/* Coordonnées & Informations Légales */}
              <div className="space-y-2 text-xs border-b border-slate-200 dark:border-slate-800 pb-4">
                <div className="font-semibold text-slate-800 dark:text-slate-200">
                  Coordonnées & Informations Légales
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-slate-600 dark:text-slate-400">
                  <div>
                    <span className="text-slate-400">Contact : </span>
                    <strong className="text-slate-800 dark:text-slate-200">
                      {selectedContact.contactName}
                    </strong>
                  </div>
                  <div>
                    <span className="text-slate-400">Responsable : </span>
                    <strong className="text-slate-800 dark:text-slate-200">
                      {selectedContact.ownerName}
                    </strong>
                  </div>
                  <div className="font-mono">{selectedContact.email}</div>
                  <div className="font-mono">{selectedContact.phone}</div>
                  <div>
                    <span className="text-slate-400">Localisation : </span>
                    {selectedContact.city} ({selectedContact.country})
                  </div>
                  <div className="font-mono">
                    <span className="font-sans text-slate-400">TVA : </span>
                    {selectedContact.vatNumber || 'Non renseignée'}
                  </div>
                </div>
                {selectedContact.notes && (
                  <p className="mt-2 p-2.5 bg-slate-50 dark:bg-slate-800/40 rounded text-slate-600 dark:text-slate-300 leading-relaxed">
                    {selectedContact.notes}
                  </p>
                )}
              </div>

              {/* Opportunités et Documents Commerciaux rattachés */}
              <div className="space-y-4 text-xs">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-semibold text-slate-800 dark:text-slate-200">
                      Opportunités Pipeline ({contact360.opportunities.length})
                    </span>
                    <button
                      onClick={() => onNavigateToModule('pipeline')}
                      className="text-blue-600 dark:text-blue-400 hover:underline"
                    >
                      Voir pipeline
                    </button>
                  </div>
                  {contact360.opportunities.length === 0 ? (
                    <div className="text-slate-400">Aucune opportunité enregistrée.</div>
                  ) : (
                    <div className="space-y-1.5">
                      {contact360.opportunities.map((o) => (
                        <div
                          key={o.id}
                          className="p-2.5 border border-slate-200 dark:border-slate-800 rounded flex items-center justify-between gap-2"
                        >
                          <div className="truncate">
                            <div className="font-medium text-slate-900 dark:text-slate-100 truncate">
                              {o.title}
                            </div>
                            <div className="text-[11px] text-slate-500">
                              {OPPORTUNITY_STAGE_LABELS[o.stage]} · Probabilité {o.probability}%
                            </div>
                          </div>
                          <div className="font-mono tabular-nums font-semibold shrink-0">
                            {formatCurrency(o.estimatedAmountHt)}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-semibold text-slate-800 dark:text-slate-200">
                      Devis & Factures ({contact360.quotes.length + contact360.invoices.length})
                    </span>
                    <button
                      onClick={() => onNavigateToModule('quotes')}
                      className="text-blue-600 dark:text-blue-400 hover:underline"
                    >
                      Gérer les pièces
                    </button>
                  </div>
                  {contact360.quotes.length === 0 && contact360.invoices.length === 0 ? (
                    <div className="text-slate-400">Aucun devis ni facture pour ce compte.</div>
                  ) : (
                    <div className="space-y-1.5">
                      {contact360.quotes.map((q) => (
                        <div
                          key={q.id}
                          className="p-2.5 border border-slate-200 dark:border-slate-800 rounded flex items-center justify-between"
                        >
                          <div>
                            <span className="font-mono font-semibold text-slate-900 dark:text-slate-100">
                              {q.reference}
                            </span>
                            <span className="text-slate-500"> · {QUOTE_STATUS_LABELS[q.status]}</span>
                          </div>
                          <span className="font-mono tabular-nums font-medium">
                            {formatCurrency(q.totalTtc)} TTC
                          </span>
                        </div>
                      ))}
                      {contact360.invoices.map((i) => (
                        <div
                          key={i.id}
                          className="p-2.5 border border-slate-200 dark:border-slate-800 rounded flex items-center justify-between"
                        >
                          <div>
                            <span className="font-mono font-semibold text-slate-900 dark:text-slate-100">
                              {i.reference}
                            </span>
                            <span className="text-slate-500"> · {INVOICE_STATUS_LABELS[i.status]}</span>
                          </div>
                          <span className="font-mono tabular-nums font-semibold">
                            {formatCurrency(i.totalTtc)} TTC
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// 3. PIPELINE & OPPORTUNITÉS (KANBAN STRUCTURÉ + VUE TABLEAU)
// ============================================================================
export function PipelineView({
  opportunities,
  contacts,
  users,
  currentUser,
  onCreateOpportunity,
  onChangeStage,
}: {
  opportunities: Opportunity[];
  contacts: Contact[];
  users: User[];
  currentUser: User;
  onCreateOpportunity: (data: Partial<Opportunity>) => Promise<void>;
  onChangeStage: (id: string, stage: OpportunityStage) => Promise<void>;
}) {
  const [viewMode, setViewMode] = useState<'kanban' | 'table'>('kanban');
  const [ownerFilter, setOwnerFilter] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [showModal, setShowModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [formState, setFormState] = useState({
    title: '',
    contactId: contacts[0]?.id || '',
    stage: OpportunityStage.QUALIFICATION,
    estimatedAmountHt: 15000,
    probability: 25,
    expectedCloseDate: '2026-12-15',
    notes: '',
  });

  const stages: OpportunityStage[] = [
    OpportunityStage.QUALIFICATION,
    OpportunityStage.DISCOVERY,
    OpportunityStage.PROPOSAL,
    OpportunityStage.NEGOTIATION,
    OpportunityStage.WON,
    OpportunityStage.LOST,
  ];

  const filteredOpportunities = useMemo(() => {
    return opportunities.filter((o) => {
      const matchesOwner = ownerFilter === 'ALL' || o.ownerId === ownerFilter;
      const q = searchQuery.toLowerCase().trim();
      const matchesSearch =
        !q ||
        o.title.toLowerCase().includes(q) ||
        (o.companyName || '').toLowerCase().includes(q);
      return matchesOwner && matchesSearch;
    });
  }, [opportunities, ownerFilter, searchQuery]);

  const totalOpenBrut = useMemo(
    () =>
      filteredOpportunities
        .filter((o) => o.stage !== OpportunityStage.WON && o.stage !== OpportunityStage.LOST)
        .reduce((acc, o) => acc + o.estimatedAmountHt, 0),
    [filteredOpportunities]
  );

  const totalOpenWeighted = useMemo(
    () =>
      filteredOpportunities
        .filter((o) => o.stage !== OpportunityStage.WON && o.stage !== OpportunityStage.LOST)
        .reduce((acc, o) => acc + o.weightedAmountHt, 0),
    [filteredOpportunities]
  );

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setErrorMsg(null);
    try {
      await onCreateOpportunity(formState);
      setShowModal(false);
      setFormState({
        title: '',
        contactId: contacts[0]?.id || '',
        stage: OpportunityStage.QUALIFICATION,
        estimatedAmountHt: 15000,
        probability: 25,
        expectedCloseDate: '2026-12-15',
        notes: '',
      });
    } catch (err: any) {
      setErrorMsg(err.message || 'Erreur lors de la création.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* En-tête et Synthèse Pipeline */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-5 border-b border-slate-200 dark:border-slate-800">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
            Pipeline d’Opportunités Commerciales
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
            En cours Brut : <strong className="font-mono tabular-nums text-slate-900 dark:text-slate-100">{formatCurrency(totalOpenBrut)} HT</strong> · Pondéré Serveur : <strong className="font-mono tabular-nums text-blue-600 dark:text-blue-400">{formatCurrency(totalOpenWeighted)} HT</strong>
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg">
            <button
              onClick={() => setViewMode('kanban')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                viewMode === 'kanban'
                  ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 shadow-xs'
                  : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              Tableau Kanban
            </button>
            <button
              onClick={() => setViewMode('table')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                viewMode === 'table'
                  ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 shadow-xs'
                  : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              Registre Tabulaire
            </button>
          </div>

          <button
            onClick={() => setShowModal(true)}
            className="px-4 py-2 text-xs font-medium text-white bg-slate-900 dark:bg-blue-600 rounded-lg hover:bg-slate-800 transition-colors flex items-center gap-2 whitespace-nowrap shrink-0"
          >
            <Plus className="w-4 h-4" /> Nouvelle Opportunité
          </button>
        </div>
      </div>

      {/* Filtres Pipeline */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <select
            aria-label="Filtrer le pipeline par responsable"
            value={ownerFilter}
            onChange={(e) => setOwnerFilter(e.target.value)}
            className="px-3 py-2 text-xs bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg"
          >
            <option value="ALL">Tous les commerciaux ({opportunities.length} dossiers)</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                Portefeuille : {u.name}
              </option>
            ))}
          </select>
        </div>

        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Filtrer par intitulé d’affaire ou client..."
            className="w-full pl-9 pr-4 py-2 text-xs bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg"
          />
        </div>
      </div>

      {/* Modal de création d'opportunité */}
      {showModal && (
        <form
          onSubmit={handleCreate}
          className="p-6 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg space-y-4"
        >
          <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
            <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
              Nouvelle Opportunité Commerciale
            </h2>
            <button
              type="button"
              onClick={() => setShowModal(false)}
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

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="md:col-span-2">
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Intitulé de l’affaire *
              </label>
              <input
                type="text"
                required
                value={formState.title}
                onChange={(e) => setFormState({ ...formState, title: e.target.value })}
                placeholder="Ex: Déploiement ERP Atelier 15 postes"
                className="w-full px-3 py-2 text-xs bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-md"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Compte rattaché *
              </label>
              <select
                required
                value={formState.contactId}
                onChange={(e) => setFormState({ ...formState, contactId: e.target.value })}
                className="w-full px-3 py-2 text-xs bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-md"
              >
                {contacts.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.companyName} ({c.contactName})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Étape initiale *
              </label>
              <select
                value={formState.stage}
                onChange={(e) =>
                  setFormState({ ...formState, stage: e.target.value as OpportunityStage })
                }
                className="w-full px-3 py-2 text-xs bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-md"
              >
                {stages.map((s) => (
                  <option key={s} value={s}>
                    {OPPORTUNITY_STAGE_LABELS[s]}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Montant estimé HT (€) *
              </label>
              <input
                type="number"
                min="0"
                step="100"
                required
                value={formState.estimatedAmountHt}
                onChange={(e) =>
                  setFormState({ ...formState, estimatedAmountHt: Number(e.target.value) })
                }
                className="w-full px-3 py-2 text-xs font-mono tabular-nums bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-md"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Probabilité (%) & Clôture prévue *
              </label>
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="number"
                  min="0"
                  max="100"
                  required
                  value={formState.probability}
                  onChange={(e) =>
                    setFormState({ ...formState, probability: Number(e.target.value) })
                  }
                  className="w-full px-3 py-2 text-xs font-mono tabular-nums bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-md"
                />
                <input
                  type="date"
                  required
                  value={formState.expectedCloseDate}
                  onChange={(e) =>
                    setFormState({ ...formState, expectedCloseDate: e.target.value })
                  }
                  className="w-full px-2 py-2 text-xs font-mono bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-md"
                />
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between pt-2">
            <div className="text-xs text-slate-500 font-mono tabular-nums">
              Montant pondéré calculé :{' '}
              <strong className="text-slate-900 dark:text-slate-100">
                {formatCurrency((formState.estimatedAmountHt * formState.probability) / 100)} HT
              </strong>
            </div>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setShowModal(false)}
                className="px-4 py-2 text-xs font-medium text-slate-600 dark:text-slate-300"
              >
                Annuler
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="px-4 py-2 text-xs font-medium text-white bg-slate-900 dark:bg-blue-600 rounded-md"
              >
                {submitting ? 'Création...' : 'Créer l’opportunité'}
              </button>
            </div>
          </div>
        </form>
      )}

      {/* Vue Kanban Structurée */}
      {viewMode === 'kanban' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4 items-start">
          {stages.map((stage) => {
            const stageOpps = filteredOpportunities.filter((o) => o.stage === stage);
            const totalStageHt = stageOpps.reduce((acc, o) => acc + o.estimatedAmountHt, 0);
            const weightedStageHt = stageOpps.reduce((acc, o) => acc + o.weightedAmountHt, 0);

            return (
              <div
                key={stage}
                className="bg-slate-100/90 dark:bg-slate-900/70 border border-slate-200 dark:border-slate-800 rounded-lg p-3 space-y-3"
              >
                <div className="pb-2.5 border-b border-slate-200 dark:border-slate-800">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-bold text-slate-900 dark:text-slate-100">
                      {OPPORTUNITY_STAGE_LABELS[stage]}
                    </h3>
                    <span className="text-xs font-mono tabular-nums font-semibold text-slate-600 dark:text-slate-400">
                      {stageOpps.length}
                    </span>
                  </div>
                  <div className="mt-1.5 text-xs font-mono tabular-nums font-semibold text-slate-900 dark:text-slate-100">
                    {formatCurrency(totalStageHt)} <span className="font-normal text-slate-500">HT</span>
                  </div>
                  <div className="text-[11px] font-mono tabular-nums text-slate-500">
                    Pondéré : {formatCurrency(weightedStageHt)}
                  </div>
                </div>

                <div className="space-y-2.5">
                  {stageOpps.length === 0 ? (
                    <div className="py-8 text-center text-xs text-slate-400 border border-dashed border-slate-200 dark:border-slate-800 rounded-md">
                      Aucune affaire
                    </div>
                  ) : (
                    stageOpps.map((opp) => {
                      const canMove =
                        currentUser.role !== Role.SALES || opp.ownerId === currentUser.id;
                      return (
                        <div
                          key={opp.id}
                          className="p-3.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-md space-y-2.5 hover:border-slate-300 dark:hover:border-slate-700 transition-colors"
                        >
                          <div className="text-xs font-semibold text-slate-900 dark:text-slate-100 leading-snug">
                            {opp.title}
                          </div>
                          <div className="text-xs font-medium text-slate-600 dark:text-slate-400">
                            {opp.companyName}
                          </div>

                          {/* Barre de probabilité */}
                          <div className="space-y-1 pt-1">
                            <div className="flex items-center justify-between text-xs font-mono tabular-nums">
                              <span className="font-bold text-slate-900 dark:text-slate-100">
                                {formatCurrency(opp.estimatedAmountHt)}
                              </span>
                              <span className="text-blue-600 dark:text-blue-400 font-semibold">
                                {opp.probability}%
                              </span>
                            </div>
                            <div className="h-1 w-full bg-slate-100 dark:bg-slate-800 rounded overflow-hidden">
                              <div
                                className="h-full bg-blue-600 dark:bg-blue-500"
                                style={{ width: `${opp.probability}%` }}
                              />
                            </div>
                          </div>

                          <div className="pt-1 text-[11px] text-slate-500 flex items-center justify-between">
                            <span className="font-mono tabular-nums">
                              Éch. {formatDateFr(opp.expectedCloseDate)}
                            </span>
                            <span>{opp.ownerName?.split(' ')[0]}</span>
                          </div>

                          {canMove && (
                            <div className="pt-1.5 border-t border-slate-100 dark:border-slate-800">
                              <select
                                aria-label={`Déplacer ${opp.title} vers une autre étape`}
                                value={opp.stage}
                                onChange={(e) =>
                                  onChangeStage(opp.id, e.target.value as OpportunityStage)
                                }
                                className="w-full px-2 py-1 text-[11px] font-medium bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded text-slate-700 dark:text-slate-200"
                              >
                                {stages.map((s) => (
                                  <option key={s} value={s}>
                                    Étape : {OPPORTUNITY_STAGE_LABELS[s]}
                                  </option>
                                ))}
                              </select>
                            </div>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40 text-xs font-semibold text-slate-600 dark:text-slate-300">
                <th className="py-3 px-4">Affaire & Société</th>
                <th className="py-3 px-4">Étape Pipeline</th>
                <th className="py-3 px-4 text-right">Montant Brut HT</th>
                <th className="py-3 px-4 text-right">Probabilité</th>
                <th className="py-3 px-4 text-right">Pondéré Serveur HT</th>
                <th className="py-3 px-4">Clôture Prévue</th>
                <th className="py-3 px-4">Responsable</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800 text-xs">
              {filteredOpportunities.map((opp) => (
                <tr key={opp.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40">
                  <td className="py-3.5 px-4">
                    <div className="font-semibold text-slate-900 dark:text-slate-100">
                      {opp.title}
                    </div>
                    <div className="text-slate-500">{opp.companyName}</div>
                  </td>
                  <td className="py-3.5 px-4 font-medium text-slate-800 dark:text-slate-200">
                    {OPPORTUNITY_STAGE_LABELS[opp.stage]}
                  </td>
                  <td className="py-3.5 px-4 text-right font-mono tabular-nums">
                    {formatCurrency(opp.estimatedAmountHt)}
                  </td>
                  <td className="py-3.5 px-4 text-right font-mono tabular-nums">
                    {opp.probability}%
                  </td>
                  <td className="py-3.5 px-4 text-right font-mono tabular-nums font-semibold text-slate-900 dark:text-slate-100">
                    {formatCurrency(opp.weightedAmountHt)}
                  </td>
                  <td className="py-3.5 px-4 font-mono tabular-nums">
                    {formatDateFr(opp.expectedCloseDate)}
                  </td>
                  <td className="py-3.5 px-4">{opp.ownerName}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

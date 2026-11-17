/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Mercator CRM — Application de Gestion Commerciale & Facturation PME
 * Conçu, architecturé et développé par Mendel Temgoua (mendeltemgouabusiness@gmail.com)
 *
 * - Palette de Commandes Globale (Ctrl+K / Cmd+K) pour recherche universelle et actions rapides
 * - Architecture SaaS B2B structurée (3 domaines métiers + Documentation & Auteur)
 * - Crédits Auteur avec photo portrait générée et guide GitHub intégré
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  BookOpen,
  ChevronRight,
  Clock,
  Command,
  FileSpreadsheet,
  FileText,
  Kanban,
  LayoutDashboard,
  Moon,
  Plus,
  Receipt,
  RefreshCw,
  Search,
  ShieldCheck,
  Sun,
  Users,
  X,
} from 'lucide-react';
import {
  ContactsView,
  DashboardView,
  PipelineView,
} from './components/CommercialViews.tsx';
import {
  ActivitiesAndExportView,
  InvoicesView,
  QuotesView,
  TasksView,
} from './components/DocumentAndAuditViews.tsx';
import { DocumentationAndAuthorView } from './components/DocumentationView.tsx';
import { api, setApiActorId } from './services/api.ts';
import {
  ActivityLog,
  Contact,
  DashboardSummary,
  FollowUpTask,
  Invoice,
  Opportunity,
  OpportunityStage,
  Quote,
  QuoteStatus,
  Role,
  TaskStatus,
  User,
} from './types/domain.ts';
import { formatCurrency, ROLE_LABELS } from './utils/formatters.ts';

const AUTHOR_AVATAR = '/src/assets/images/author_mendel_avatar_1794875155331.jpg';

type ActiveTab =
  | 'dashboard'
  | 'contacts'
  | 'pipeline'
  | 'quotes'
  | 'invoices'
  | 'tasks'
  | 'activities'
  | 'docs';

const TAB_METADATA: Record<ActiveTab, { domain: string; title: string }> = {
  dashboard: { domain: 'Pilotage & Relation Client', title: 'Tableau de bord exécutif' },
  contacts: { domain: 'Pilotage & Relation Client', title: 'Comptes — Prospects & Clients 360°' },
  pipeline: { domain: 'Pilotage & Relation Client', title: 'Pipeline & Opportunités Kanban' },
  quotes: { domain: 'Cycle Devis-Facturation', title: 'Devis & Propositions Chiffrées' },
  invoices: { domain: 'Cycle Devis-Facturation', title: 'Facturier & Encaissements' },
  tasks: { domain: 'Opérations & Conformité', title: 'Agenda des Relances' },
  activities: { domain: 'Opérations & Conformité', title: 'Piste d’Audit & Exports Contrôlés' },
  docs: { domain: 'Architecture & Livrable GitHub', title: 'Documentation & Auteur (Mendel Temgoua)' },
};

export default function App() {
  const [activeTab, setActiveTab] = useState<ActiveTab>('dashboard');
  const [darkMode, setDarkMode] = useState<boolean>(false);
  const [dashboardScope, setDashboardScope] = useState<'all' | 'mine'>('all');

  const [triggerNewContact, setTriggerNewContact] = useState<boolean>(false);
  const [triggerNewQuote, setTriggerNewQuote] = useState<boolean>(false);

  // Palette de commandes globale (Ctrl+K / Cmd+K)
  const [commandOpen, setCommandOpen] = useState<boolean>(false);
  const [commandQuery, setCommandQuery] = useState<string>('');

  const [users, setUsers] = useState<User[]>([]);
  const [currentUser, setCurrentUser] = useState<User>({
    id: 'usr-admin',
    name: 'Claire Vance',
    email: 'claire.vance@mercator-demo.fr',
    role: Role.ADMIN,
    title: 'Directrice Générale & Administratrice',
    active: true,
  });

  const [dashboard, setDashboard] = useState<DashboardSummary | null>(null);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [tasks, setTasks] = useState<FollowUpTask[]>([]);
  const [activities, setActivities] = useState<ActivityLog[]>([]);

  const [loading, setLoading] = useState<boolean>(true);
  const [globalError, setGlobalError] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  useEffect(() => {
    const root = document.documentElement;
    if (darkMode) {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
  }, [darkMode]);

  // Raccourci clavier Ctrl+K / Cmd+K pour la palette de commandes
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setCommandOpen((prev) => !prev);
      } else if (e.key === 'Escape') {
        setCommandOpen(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage((prev) => (prev === msg ? null : prev));
    }, 4000);
  };

  const refreshAllData = useCallback(
    async (scopeOverride?: 'all' | 'mine') => {
      setGlobalError(null);
      const effectiveScope = scopeOverride ?? dashboardScope;
      try {
        const [
          usersRes,
          dashRes,
          contactsRes,
          oppsRes,
          quotesRes,
          invoicesRes,
          tasksRes,
          actsRes,
        ] = await Promise.all([
          api.getUsers(),
          api.getDashboard(effectiveScope),
          api.getContacts(),
          api.getOpportunities(),
          api.getQuotes(),
          api.getInvoices(),
          api.getTasks(),
          api.getActivities(),
        ]);

        setUsers(usersRes.users);
        setCurrentUser(usersRes.currentUser);
        setDashboard(dashRes);
        setContacts(contactsRes);
        setOpportunities(oppsRes);
        setQuotes(quotesRes);
        setInvoices(invoicesRes);
        setTasks(tasksRes);
        setActivities(actsRes);
      } catch (err: any) {
        setGlobalError(
          err.message || 'Impossible de synchroniser les données avec le serveur.'
        );
      } finally {
        setLoading(false);
      }
    },
    [dashboardScope]
  );

  useEffect(() => {
    refreshAllData();
  }, [refreshAllData]);

  const handleScopeChange = async (newScope: 'all' | 'mine') => {
    setDashboardScope(newScope);
    await refreshAllData(newScope);
  };

  const handleActorSwitch = async (actorId: string) => {
    setApiActorId(actorId);
    setLoading(true);
    await refreshAllData();
    const switched = users.find((u) => u.id === actorId);
    if (switched) {
      showToast(`Profil actif changé : ${switched.name} (${ROLE_LABELS[switched.role]})`);
    }
  };

  // Handlers métiers connectés à l'API Express
  const handleCreateContact = async (payload: Partial<Contact>) => {
    await api.createContact(payload);
    await refreshAllData();
    showToast('Nouveau compte enregistré.');
  };

  const handleUpdateContact = async (id: string, payload: Partial<Contact>) => {
    await api.updateContact(id, payload);
    await refreshAllData();
    showToast('Compte mis à jour avec succès.');
  };

  const handleDeleteContact = async (id: string) => {
    try {
      await api.deleteContact(id);
      await refreshAllData();
      showToast('Compte supprimé.');
    } catch (err: any) {
      setGlobalError(err.message);
    }
  };

  const handleCreateOpportunity = async (payload: Partial<Opportunity>) => {
    await api.createOpportunity(payload);
    await refreshAllData();
    showToast('Opportunité ajoutée et pondérée côté serveur.');
  };

  const handleChangeStage = async (id: string, stage: OpportunityStage) => {
    try {
      await api.updateOpportunityStage(id, { stage });
      await refreshAllData();
      showToast('Étape du pipeline mise à jour.');
    } catch (err: any) {
      setGlobalError(err.message);
    }
  };

  const handleCreateQuote = async (payload: any) => {
    await api.createQuote(payload);
    await refreshAllData();
    showToast('Devis émis avec totaux certifiés côté serveur.');
  };

  const handleUpdateQuoteStatus = async (id: string, status: QuoteStatus) => {
    try {
      await api.updateQuoteStatus(id, status);
      await refreshAllData();
      showToast('Statut du devis mis à jour.');
    } catch (err: any) {
      setGlobalError(err.message);
    }
  };

  const handleConvertQuote = async (id: string) => {
    try {
      const invoice = await api.convertQuoteToInvoice(id);
      await refreshAllData();
      showToast(`Devis converti en facture ${invoice.reference} avec succès.`);
      setActiveTab('invoices');
    } catch (err: any) {
      setGlobalError(err.message);
    }
  };

  const handleRecordPayment = async (
    id: string,
    amountPaid: number,
    paymentMethod: string
  ) => {
    try {
      await api.recordInvoicePayment(id, { amountPaid, paymentMethod });
      await refreshAllData();
      showToast('Règlement enregistré et solde recalculé.');
    } catch (err: any) {
      setGlobalError(err.message);
    }
  };

  const handleCreateTask = async (payload: Partial<FollowUpTask>) => {
    await api.createTask(payload);
    await refreshAllData();
    showToast('Tâche de relance planifiée.');
  };

  const handleUpdateTaskStatus = async (id: string, status: TaskStatus) => {
    try {
      await api.updateTaskStatus(id, status);
      await refreshAllData();
      showToast('Statut de la relance mis à jour.');
    } catch (err: any) {
      setGlobalError(err.message);
    }
  };

  const handleRefreshActivities = async (entityType?: string) => {
    const acts = await api.getActivities(entityType);
    setActivities(acts);
  };

  // Recherche universelle pour la Palette de Commandes (Ctrl+K)
  const commandResults = useMemo(() => {
    const q = commandQuery.toLowerCase().trim();
    const matchedContacts = contacts
      .filter(
        (c) =>
          !q ||
          c.companyName.toLowerCase().includes(q) ||
          c.contactName.toLowerCase().includes(q) ||
          c.city.toLowerCase().includes(q)
      )
      .slice(0, 4);
    const matchedQuotes = quotes
      .filter(
        (quo) =>
          !q ||
          quo.reference.toLowerCase().includes(q) ||
          (quo.companyName || '').toLowerCase().includes(q)
      )
      .slice(0, 3);
    const matchedInvoices = invoices
      .filter(
        (inv) =>
          !q ||
          inv.reference.toLowerCase().includes(q) ||
          (inv.companyName || '').toLowerCase().includes(q)
      )
      .slice(0, 3);

    return { matchedContacts, matchedQuotes, matchedInvoices };
  }, [commandQuery, contacts, quotes, invoices]);

  const navGroups: Array<{
    groupLabel: string;
    items: Array<{
      id: ActiveTab;
      label: string;
      icon: React.ComponentType<any>;
      count?: number;
      alert?: boolean;
    }>;
  }> = [
    {
      groupLabel: '01. Pilotage & Relation Client',
      items: [
        { id: 'dashboard', label: 'Tableau de bord', icon: LayoutDashboard },
        { id: 'contacts', label: 'Comptes 360°', icon: Users, count: contacts.length },
        { id: 'pipeline', label: 'Pipeline Kanban', icon: Kanban, count: opportunities.length },
      ],
    },
    {
      groupLabel: '02. Cycle Devis-Facturation',
      items: [
        { id: 'quotes', label: 'Devis Commerciaux', icon: FileText, count: quotes.length },
        {
          id: 'invoices',
          label: 'Facturier & Soldes',
          icon: Receipt,
          count: invoices.length,
          alert: invoices.some((i) => i.isOverdue),
        },
      ],
    },
    {
      groupLabel: '03. Opérations & Conformité',
      items: [
        {
          id: 'tasks',
          label: 'Agenda des Relances',
          icon: Clock,
          count: tasks.filter((t) => t.status !== TaskStatus.DONE).length,
          alert: tasks.some((t) => t.isOverdue && t.status !== TaskStatus.DONE),
        },
        { id: 'activities', label: 'Audit & Exports', icon: FileSpreadsheet },
        { id: 'docs', label: 'Documentation & GitHub', icon: BookOpen },
      ],
    },
  ];

  const currentMeta = TAB_METADATA[activeTab];

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col">
      {/* TOP BAR CONTRACT: 1-row, 3-zone header (Brand wordmark | 5 concise nav links | 1 primary CTA) */}
      <header className="sticky top-0 z-30 flex items-center justify-between gap-8 px-6 py-3.5 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800">
        {/* Zone 1: Single text element wordmark */}
        <a
          href="#dashboard"
          onClick={(e) => {
            e.preventDefault();
            setActiveTab('dashboard');
          }}
          className="text-lg font-bold tracking-tight text-slate-900 dark:text-slate-100 whitespace-nowrap shrink-0 font-display"
        >
          Mercator CRM
        </a>

        {/* Zone 2: 5 concise single-line text navigation links */}
        <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-600 dark:text-slate-400">
          <button
            onClick={() => setActiveTab('dashboard')}
            className={`hover:text-slate-900 dark:hover:text-slate-100 transition-colors whitespace-nowrap shrink-0 ${
              activeTab === 'dashboard'
                ? 'text-slate-900 dark:text-slate-100 underline underline-offset-4'
                : ''
            }`}
          >
            Synthèse
          </button>
          <button
            onClick={() => setActiveTab('contacts')}
            className={`hover:text-slate-900 dark:hover:text-slate-100 transition-colors whitespace-nowrap shrink-0 ${
              activeTab === 'contacts'
                ? 'text-slate-900 dark:text-slate-100 underline underline-offset-4'
                : ''
            }`}
          >
            Comptes 360°
          </button>
          <button
            onClick={() => setActiveTab('pipeline')}
            className={`hover:text-slate-900 dark:hover:text-slate-100 transition-colors whitespace-nowrap shrink-0 ${
              activeTab === 'pipeline'
                ? 'text-slate-900 dark:text-slate-100 underline underline-offset-4'
                : ''
            }`}
          >
            Pipeline
          </button>
          <button
            onClick={() => setActiveTab('quotes')}
            className={`hover:text-slate-900 dark:hover:text-slate-100 transition-colors whitespace-nowrap shrink-0 ${
              activeTab === 'quotes' || activeTab === 'invoices'
                ? 'text-slate-900 dark:text-slate-100 underline underline-offset-4'
                : ''
            }`}
          >
            Devis & Factures
          </button>
          <button
            onClick={() => setActiveTab('docs')}
            className={`hover:text-slate-900 dark:hover:text-slate-100 transition-colors whitespace-nowrap shrink-0 ${
              activeTab === 'docs'
                ? 'text-slate-900 dark:text-slate-100 underline underline-offset-4'
                : ''
            }`}
          >
            Documentation
          </button>
        </nav>

        {/* Zone 3: 1 primary action */}
        <div className="flex items-center gap-3 shrink-0">
          <button
            onClick={() => setCommandOpen(true)}
            className="px-4 py-2 text-xs font-medium text-white bg-slate-900 dark:bg-blue-600 rounded-lg hover:bg-slate-800 dark:hover:bg-blue-500 transition-colors whitespace-nowrap shrink-0"
          >
            Recherche Rapide (Ctrl+K)
          </button>
        </div>
      </header>

      {/* PALETTE DE COMMANDES GLOBALE (CTRL+K) */}
      {commandOpen && (
        <div
          className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-start justify-center pt-20 px-4"
          onClick={() => setCommandOpen(false)}
        >
          <div
            className="w-full max-w-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg shadow-xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-3.5 border-b border-slate-200 dark:border-slate-800 flex items-center gap-3">
              <Search className="w-4 h-4 text-slate-400 shrink-0" />
              <input
                type="text"
                autoFocus
                value={commandQuery}
                onChange={(e) => setCommandQuery(e.target.value)}
                placeholder="Rechercher un client, un devis (DEV-2026...), une facture ou lancer une action..."
                className="w-full text-xs bg-transparent text-slate-900 dark:text-slate-100 focus:outline-none"
              />
              <button
                onClick={() => setCommandOpen(false)}
                className="text-xs font-mono text-slate-400 hover:text-slate-600 px-1.5 py-0.5 border border-slate-200 dark:border-slate-700 rounded"
              >
                ESC
              </button>
            </div>

            <div className="p-4 max-h-96 overflow-y-auto space-y-5 text-xs">
              {/* Actions rapides */}
              <div className="space-y-1.5">
                <div className="text-[11px] font-semibold text-slate-400">Actions Directes</div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <button
                    onClick={() => {
                      setCommandOpen(false);
                      setTriggerNewContact(true);
                      setActiveTab('contacts');
                    }}
                    className="p-2.5 text-left border border-slate-200 dark:border-slate-800 rounded hover:bg-slate-50 dark:hover:bg-slate-800 font-medium"
                  >
                    + Créer un Compte Client
                  </button>
                  <button
                    onClick={() => {
                      setCommandOpen(false);
                      setTriggerNewQuote(true);
                      setActiveTab('quotes');
                    }}
                    className="p-2.5 text-left border border-slate-200 dark:border-slate-800 rounded hover:bg-slate-50 dark:hover:bg-slate-800 font-medium"
                  >
                    + Émettre un Devis
                  </button>
                  <button
                    onClick={() => {
                      setCommandOpen(false);
                      setActiveTab('activities');
                    }}
                    className="p-2.5 text-left border border-slate-200 dark:border-slate-800 rounded hover:bg-slate-50 dark:hover:bg-slate-800 font-medium"
                  >
                    → Exporter CSV / JSON
                  </button>
                </div>
              </div>

              {/* Comptes trouvés */}
              <div className="space-y-1.5">
                <div className="text-[11px] font-semibold text-slate-400">
                  Comptes Clients & Prospects ({commandResults.matchedContacts.length})
                </div>
                <div className="divide-y divide-slate-100 dark:divide-slate-800">
                  {commandResults.matchedContacts.map((c) => (
                    <button
                      key={c.id}
                      onClick={() => {
                        setCommandOpen(false);
                        setActiveTab('contacts');
                      }}
                      className="w-full py-2 px-2 flex items-center justify-between hover:bg-slate-50 dark:hover:bg-slate-800 rounded text-left"
                    >
                      <div>
                        <span className="font-semibold text-slate-900 dark:text-slate-100">
                          {c.companyName}
                        </span>
                        <span className="text-slate-500"> · {c.contactName} ({c.city})</span>
                      </div>
                      <span className="text-blue-600 dark:text-blue-400">Ouvrir 360°</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Pièces commerciales trouvées */}
              <div className="space-y-1.5">
                <div className="text-[11px] font-semibold text-slate-400">
                  Devis & Factures ({commandResults.matchedQuotes.length + commandResults.matchedInvoices.length})
                </div>
                <div className="divide-y divide-slate-100 dark:divide-slate-800">
                  {commandResults.matchedQuotes.map((q) => (
                    <button
                      key={q.id}
                      onClick={() => {
                        setCommandOpen(false);
                        setActiveTab('quotes');
                      }}
                      className="w-full py-2 px-2 flex items-center justify-between hover:bg-slate-50 dark:hover:bg-slate-800 rounded text-left"
                    >
                      <div>
                        <span className="font-mono font-semibold text-slate-900 dark:text-slate-100">
                          {q.reference}
                        </span>
                        <span className="text-slate-500"> · {q.companyName}</span>
                      </div>
                      <span className="font-mono tabular-nums font-semibold">
                        {formatCurrency(q.totalTtc)} TTC
                      </span>
                    </button>
                  ))}
                  {commandResults.matchedInvoices.map((inv) => (
                    <button
                      key={inv.id}
                      onClick={() => {
                        setCommandOpen(false);
                        setActiveTab('invoices');
                      }}
                      className="w-full py-2 px-2 flex items-center justify-between hover:bg-slate-50 dark:hover:bg-slate-800 rounded text-left"
                    >
                      <div>
                        <span className="font-mono font-semibold text-slate-900 dark:text-slate-100">
                          {inv.reference}
                        </span>
                        <span className="text-slate-500"> · {inv.companyName}</span>
                      </div>
                      <span className="font-mono tabular-nums font-semibold">
                        {formatCurrency(inv.totalTtc)} TTC
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* WORKSPACE CANVAS: Sidebar structurée (268px) + Main Viewport */}
      <div className="flex-1 flex flex-col lg:flex-row">
        <aside className="w-full lg:w-64 shrink-0 bg-white dark:bg-slate-900 border-b lg:border-b-0 lg:border-r border-slate-200 dark:border-slate-800 p-4 flex flex-col justify-between gap-6">
          <div className="space-y-6">
            {/* Groupes de navigation structurés par domaine métier */}
            {navGroups.map((group) => (
              <div key={group.groupLabel} className="space-y-1">
                <div className="px-3 pb-1 text-[11px] font-semibold text-slate-400 dark:text-slate-500">
                  {group.groupLabel}
                </div>
                {group.items.map((item) => {
                  const Icon = item.icon;
                  const isActive = activeTab === item.id;
                  return (
                    <button
                      key={item.id}
                      onClick={() => setActiveTab(item.id)}
                      className={`w-full flex items-center justify-between px-3 py-2 text-xs font-medium rounded-lg transition-colors whitespace-nowrap ${
                        isActive
                          ? 'bg-slate-900 dark:bg-blue-600 text-white'
                          : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                      }`}
                    >
                      <span className="flex items-center gap-2.5 truncate">
                        <Icon className="w-4 h-4 shrink-0" />
                        <span className="truncate">{item.label}</span>
                      </span>
                      {typeof item.count === 'number' && (
                        <span
                          className={`font-mono tabular-nums text-[11px] ${
                            isActive
                              ? 'text-slate-200 dark:text-blue-100'
                              : item.alert
                              ? 'text-amber-600 dark:text-amber-400 font-semibold'
                              : 'text-slate-400 dark:text-slate-500'
                          }`}
                        >
                          {item.count}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            ))}

            {/* Sélecteur d'identité et contrôle d'accès par rôles (RBAC) */}
            <div className="p-3.5 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800 rounded-lg space-y-2.5">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-800 dark:text-slate-200">
                <ShieldCheck className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" />
                <span>Session & Rôle (RBAC)</span>
              </div>
              <select
                aria-label="Sélectionner le profil utilisateur actif"
                value={currentUser.id}
                onChange={(e) => handleActorSwitch(e.target.value)}
                className="w-full px-2.5 py-1.5 text-xs font-medium bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded text-slate-900 dark:text-slate-100"
              >
                {users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name} — {ROLE_LABELS[u.role]}
                  </option>
                ))}
              </select>
              <div className="text-[11px] text-slate-500 dark:text-slate-400 pt-1 border-t border-slate-200 dark:border-slate-700/80 space-y-0.5">
                <div>
                  Rôle : <strong className="text-slate-800 dark:text-slate-200">{ROLE_LABELS[currentUser.role]}</strong>
                </div>
                <div className="truncate">{currentUser.title}</div>
              </div>
            </div>
          </div>

          {/* Carte Auteur & Barre d'utilitaires */}
          <div className="space-y-3 pt-4 border-t border-slate-200 dark:border-slate-800">
            <div
              onClick={() => setActiveTab('docs')}
              className="p-2.5 rounded-lg border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/60 cursor-pointer transition-colors flex items-center gap-2.5"
            >
              <div className="w-8 h-8 rounded-full overflow-hidden bg-slate-200 dark:bg-slate-700 shrink-0">
                <img
                  src={AUTHOR_AVATAR}
                  alt="Mendel Temgoua"
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-cover"
                  onError={(e) => {
                    (e.currentTarget as HTMLImageElement).style.display = 'none';
                  }}
                />
              </div>
              <div className="min-w-0">
                <div className="text-[10px] text-slate-400">Réalisé par</div>
                <div className="text-xs font-bold text-slate-900 dark:text-slate-100 truncate">
                  Mendel Temgoua
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between gap-2">
              <button
                onClick={() => setDarkMode(!darkMode)}
                className="flex-1 px-3 py-2 text-xs font-medium text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 rounded-md hover:bg-slate-200 dark:hover:bg-slate-700 flex items-center justify-center gap-1.5 whitespace-nowrap shrink-0"
              >
                {darkMode ? (
                  <>
                    <Sun className="w-3.5 h-3.5" /> Mode Clair
                  </>
                ) : (
                  <>
                    <Moon className="w-3.5 h-3.5" /> Mode Sombre
                  </>
                )}
              </button>

              <button
                onClick={() => refreshAllData()}
                title="Synchroniser avec le serveur"
                className="p-2 text-slate-600 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 rounded-md hover:bg-slate-200 dark:hover:bg-slate-700"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              </button>
            </div>
          </div>
        </aside>

        {/* Contenu Principal (Main Viewport) */}
        <main className="flex-1 p-6 lg:p-8 max-w-[1440px] w-full mx-auto space-y-6 flex flex-col justify-between">
          <div className="space-y-6">
            {/* Barre de fil d'Ariane contextuel (Breadcrumbs) */}
            <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
              <div className="flex items-center gap-1.5">
                <span>Mercator CRM</span>
                <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
                <span>{currentMeta.domain}</span>
                <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
                <span className="font-semibold text-slate-900 dark:text-slate-200">
                  {currentMeta.title}
                </span>
              </div>
              <div className="hidden sm:flex items-center gap-2 font-mono text-[11px]">
                <span>Opérateur : {currentUser.name}</span>
                <span>·</span>
                <span>{ROLE_LABELS[currentUser.role]}</span>
              </div>
            </div>

            {/* Notification Toast non-bloquante */}
            {toastMessage && (
              <div className="p-3 bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 rounded-lg text-xs font-medium text-emerald-900 dark:text-emerald-200 flex items-center justify-between">
                <span>{toastMessage}</span>
                <button
                  onClick={() => setToastMessage(null)}
                  className="text-emerald-700 dark:text-emerald-400 hover:underline ml-4"
                >
                  Fermer
                </button>
              </div>
            )}

            {/* Bannière d'erreur explicite */}
            {globalError && (
              <div className="p-4 bg-red-50 dark:bg-red-950/60 border border-red-200 dark:border-red-800 rounded-lg text-xs text-red-800 dark:text-red-200 flex items-center justify-between gap-4">
                <div className="flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 text-red-600 dark:text-red-400" />
                  <span>{globalError}</span>
                </div>
                <button
                  onClick={() => setGlobalError(null)}
                  className="px-2.5 py-1 bg-white dark:bg-slate-900 border border-red-200 dark:border-red-800 rounded text-xs font-medium"
                >
                  Fermer
                </button>
              </div>
            )}

            {activeTab === 'dashboard' && (
              <DashboardView
                summary={dashboard}
                currentUser={currentUser}
                dashboardScope={dashboardScope}
                onScopeChange={handleScopeChange}
                onNavigate={(tab) => setActiveTab(tab as ActiveTab)}
                onCompleteTask={(id) => handleUpdateTaskStatus(id, TaskStatus.DONE)}
                onQuickCreateContact={() => {
                  setTriggerNewContact(true);
                  setActiveTab('contacts');
                }}
                onQuickCreateQuote={() => {
                  setTriggerNewQuote(true);
                  setActiveTab('quotes');
                }}
              />
            )}

            {activeTab === 'contacts' && (
              <ContactsView
                contacts={contacts}
                opportunities={opportunities}
                quotes={quotes}
                invoices={invoices}
                tasks={tasks}
                users={users}
                currentUser={currentUser}
                initialShowCreate={triggerNewContact}
                onClearInitialCreate={() => setTriggerNewContact(false)}
                onCreateContact={handleCreateContact}
                onUpdateContact={handleUpdateContact}
                onDeleteContact={handleDeleteContact}
                onNavigateToModule={(tab) => setActiveTab(tab as ActiveTab)}
              />
            )}

            {activeTab === 'pipeline' && (
              <PipelineView
                opportunities={opportunities}
                contacts={contacts}
                users={users}
                currentUser={currentUser}
                onCreateOpportunity={handleCreateOpportunity}
                onChangeStage={handleChangeStage}
              />
            )}

            {activeTab === 'quotes' && (
              <QuotesView
                quotes={quotes}
                contacts={contacts}
                opportunities={opportunities}
                currentUser={currentUser}
                initialShowBuilder={triggerNewQuote}
                onClearInitialBuilder={() => setTriggerNewQuote(false)}
                onCreateQuote={handleCreateQuote}
                onUpdateStatus={handleUpdateQuoteStatus}
                onConvertQuote={handleConvertQuote}
              />
            )}

            {activeTab === 'invoices' && (
              <InvoicesView
                invoices={invoices}
                currentUser={currentUser}
                onRecordPayment={handleRecordPayment}
              />
            )}

            {activeTab === 'tasks' && (
              <TasksView
                tasks={tasks}
                contacts={contacts}
                currentUser={currentUser}
                onCreateTask={handleCreateTask}
                onUpdateTaskStatus={handleUpdateTaskStatus}
              />
            )}

            {activeTab === 'activities' && (
              <ActivitiesAndExportView
                activities={activities}
                currentUser={currentUser}
                onRefreshActivities={handleRefreshActivities}
              />
            )}

            {activeTab === 'docs' && (
              <DocumentationAndAuthorView
                onNavigate={(tab) => setActiveTab(tab as ActiveTab)}
              />
            )}
          </div>

          {/* Pied de page sobre avec attribution officielle */}
          <footer className="pt-6 mt-12 border-t border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-slate-500 dark:text-slate-400">
            <div>
              Mercator CRM v1.0.0 — Conçu et réalisé par{' '}
              <strong className="text-slate-800 dark:text-slate-200">Mendel Temgoua</strong>
            </div>
            <div className="flex items-center gap-4">
              <button
                onClick={() => setActiveTab('docs')}
                className="hover:text-slate-900 dark:hover:text-slate-200 underline underline-offset-4"
              >
                Documentation & Architecture
              </button>
              <span>·</span>
              <button
                onClick={() => setActiveTab('activities')}
                className="hover:text-slate-900 dark:hover:text-slate-200 underline underline-offset-4"
              >
                Piste d’Audit & Exports
              </button>
            </div>
          </footer>
        </main>
      </div>
    </div>
  );
}

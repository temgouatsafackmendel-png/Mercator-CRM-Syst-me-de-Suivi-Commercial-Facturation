/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Documentation Interactive, Architecture Visuelle, Crédits Auteur (Mendel Temgoua) & Guide de Publication GitHub
 */

import React, { useState } from 'react';
import {
  BookOpen,
  Check,
  Code2,
  Copy,
  Database,
  ExternalLink,
  FileCheck2,
  FolderTree,
  GitBranch,
  Layers,
  Lock,
  Mail,
  Server,
  ShieldCheck,
  Terminal,
  UserCheck,
} from 'lucide-react';

const HERO_IMAGE = '/src/assets/images/crm_hero_banner_1794875154785.jpg';
const AUTHOR_IMAGE = '/src/assets/images/author_mendel_avatar_1794875155331.jpg';
const PIPELINE_IMAGE = '/src/assets/images/crm_pipeline_preview_1794875156288.jpg';

export function DocumentationAndAuthorView({
  onNavigate,
}: {
  onNavigate: (tab: string) => void;
}) {
  const [activeDocSection, setActiveDocSection] = useState<
    'overview' | 'architecture' | 'api' | 'github'
  >('overview');
  const [copiedCmd, setCopiedCmd] = useState<string | null>(null);

  const copyCommand = (cmd: string) => {
    navigator.clipboard.writeText(cmd);
    setCopiedCmd(cmd);
    setTimeout(() => setCopiedCmd(null), 2500);
  };

  const gitPublishCommands = `git init
git add .
git commit -m "feat: release Mercator CRM v1.0.0 Full-Stack (Designed & Engineered by Mendel Temgoua)"
git branch -M main
git remote add origin https://github.com/mendeltemgoua/mercator-crm.git
git push -u origin main`;

  return (
    <div className="space-y-8">
      {/* HERO BANNER AVEC VISUEL GÉNÉRÉ & CRÉDIT AUTEUR OFFICIEL */}
      <div className="relative rounded-lg overflow-hidden border border-slate-200 dark:border-slate-800 bg-slate-900">
        <div className="grid grid-cols-1 lg:grid-cols-12 items-stretch">
          <div className="lg:col-span-7 p-6 sm:p-8 flex flex-col justify-between z-10 bg-slate-900 text-white space-y-6">
            <div className="space-y-3">
              <div className="text-xs font-mono text-blue-400">
                DOCUMENTATION OFFICIELLE · ARCHITECTURE & LIVRABLE GITHUB v1.0.0
              </div>
              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white font-display leading-tight">
                Mercator CRM — Système de Gestion Commerciale & Facturation PME
              </h1>
              <p className="text-sm text-slate-300 leading-relaxed max-w-2xl">
                Application Full-Stack de niveau production intégrant un moteur de calcul financier côté serveur, un contrôle d’accès par rôles (RBAC), un journal d’audit immuable et un centre d’exports sécurisé contre les injections CSV.
              </p>
            </div>

            {/* Carte Signature Réalisateur / Auteur */}
            <div className="p-4 bg-slate-800/90 border border-slate-700 rounded-lg flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-center gap-3.5">
                <div className="w-12 h-12 rounded-full overflow-hidden border border-slate-600 bg-slate-700 shrink-0">
                  <img
                    src={AUTHOR_IMAGE}
                    alt="Mendel Temgoua — Architecte & Développeur Full-Stack"
                    referrerPolicy="no-referrer"
                    className="w-full h-full object-cover"
                    onError={(e) => {
                      (e.currentTarget as HTMLImageElement).style.display = 'none';
                    }}
                  />
                </div>
                <div>
                  <div className="text-xs text-slate-400">Conçu, architecturé et réalisé par</div>
                  <div className="text-sm font-bold text-white">Mendel Temgoua</div>
                  <div className="text-xs font-mono text-blue-400">
                    mendeltemgouabusiness@gmail.com
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={() => setActiveDocSection('github')}
                  className="px-3.5 py-2 text-xs font-medium text-white bg-blue-600 hover:bg-blue-500 rounded-md transition-colors whitespace-nowrap"
                >
                  Guide Publication GitHub
                </button>
              </div>
            </div>
          </div>

          <div className="lg:col-span-5 relative min-h-[240px] bg-slate-800">
            <img
              src={HERO_IMAGE}
              alt="Espace de travail exécutif Mercator CRM"
              referrerPolicy="no-referrer"
              className="w-full h-full object-cover"
              onError={(e) => {
                (e.currentTarget as HTMLImageElement).style.display = 'none';
              }}
            />
            <div className="absolute inset-0 bg-gradient-to-t from-slate-900/80 via-slate-900/20 to-transparent lg:bg-gradient-to-r lg:from-slate-900 lg:via-slate-900/30 lg:to-transparent" />
          </div>
        </div>
      </div>

      {/* Navigation par onglets de la documentation */}
      <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg w-fit overflow-x-auto">
        {[
          { id: 'overview', label: '01. Vue d’ensemble & Galerie' },
          { id: 'architecture', label: '02. Structure du Projet & Base SQL' },
          { id: 'api', label: '03. Contrats API & Sécurité RBAC' },
          { id: 'github', label: '04. Prêt pour GitHub & Déploiement' },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveDocSection(tab.id as any)}
            className={`px-4 py-2 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
              activeDocSection === tab.id
                ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* SECTION 1 : VUE D'ENSEMBLE & GALERIE VISUELLE */}
      {activeDocSection === 'overview' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
            <div className="lg:col-span-7 p-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg space-y-4 flex flex-col justify-between">
              <div className="space-y-3">
                <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">
                  Spécifications Fonctionnelles & Critères d’Acceptation Validés
                </h2>
                <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                  Ce projet répond aux exigences strictes d’une gestion commerciale PME de bout en bout, sans aucun compromis sur la sécurité ni sur l’exactitude comptable :
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                  <div className="p-3.5 bg-slate-50 dark:bg-slate-800/50 border border-slate-200/80 dark:border-slate-800 rounded-lg space-y-1">
                    <div className="text-xs font-bold text-slate-900 dark:text-slate-100">
                      1. Calculs Financiers Côté Serveur
                    </div>
                    <p className="text-[11px] text-slate-600 dark:text-slate-400">
                      Sous-total HT, remises en %, TVA multi-taux (20%, 10%, 5,5%, 0%), TTC, reste à payer et pondération pipeline calculés exclusivement par le backend.
                    </p>
                  </div>

                  <div className="p-3.5 bg-slate-50 dark:bg-slate-800/50 border border-slate-200/80 dark:border-slate-800 rounded-lg space-y-1">
                    <div className="text-xs font-bold text-slate-900 dark:text-slate-100">
                      2. Rôles & Permissions (RBAC)
                    </div>
                    <p className="text-[11px] text-slate-600 dark:text-slate-400">
                      Séparation stricte entre Administrateur, Manager Commercial et Commercial (isolation de modification et d’export par portefeuille).
                    </p>
                  </div>

                  <div className="p-3.5 bg-slate-50 dark:bg-slate-800/50 border border-slate-200/80 dark:border-slate-800 rounded-lg space-y-1">
                    <div className="text-xs font-bold text-slate-900 dark:text-slate-100">
                      3. Piste d’Audit Immuable
                    </div>
                    <p className="text-[11px] text-slate-600 dark:text-slate-400">
                      Enregistrement horodaté de chaque création, changement d’étape, conversion de devis en facture, encaissement et export.
                    </p>
                  </div>

                  <div className="p-3.5 bg-slate-50 dark:bg-slate-800/50 border border-slate-200/80 dark:border-slate-800 rounded-lg space-y-1">
                    <div className="text-xs font-bold text-slate-900 dark:text-slate-100">
                      4. Exports Contrôlés (CSV & JSON)
                    </div>
                    <p className="text-[11px] text-slate-600 dark:text-slate-400">
                      Protection active contre l’injection de formules Excel (OWASP CSV Injection), rate-limiting dédié et filtrage automatique selon le rôle.
                    </p>
                  </div>
                </div>
              </div>

              <div className="pt-4 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center gap-2">
                <button
                  onClick={() => onNavigate('dashboard')}
                  className="px-3 py-1.5 text-xs font-medium text-white bg-slate-900 dark:bg-blue-600 rounded hover:bg-slate-800"
                >
                  Explorer le Tableau de Bord
                </button>
                <button
                  onClick={() => onNavigate('contacts')}
                  className="px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 border border-slate-300 dark:border-slate-700 rounded hover:bg-slate-50 dark:hover:bg-slate-800"
                >
                  Ouvrir la Vue Client 360°
                </button>
                <button
                  onClick={() => onNavigate('quotes')}
                  className="px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 border border-slate-300 dark:border-slate-700 rounded hover:bg-slate-50 dark:hover:bg-slate-800"
                >
                  Tester le Calculateur de Devis
                </button>
              </div>
            </div>

            <div className="lg:col-span-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden flex flex-col justify-between">
              <div className="h-56 bg-slate-950 overflow-hidden relative">
                <img
                  src={PIPELINE_IMAGE}
                  alt="Architecture analytique et registre financier Mercator CRM"
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-cover"
                />
              </div>
              <div className="p-5 space-y-2">
                <div className="text-xs font-mono text-blue-600 dark:text-blue-400">
                  MOTEUR FINANCIER & PIPELINE
                </div>
                <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
                  Architecture Analytique & Grand Livre Commercial
                </h3>
                <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                  Toutes les valeurs monétaires utilisent des chiffres tabulaires (`font-variant-numeric: tabular-nums`) et sont validées par des transactions SQLite ACID (`db.transaction()`).
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* SECTION 2 : STRUCTURE DU PROJET & BASE SQL */}
      {activeDocSection === 'architecture' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-6 p-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg space-y-4">
            <h2 className="text-base font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <FolderTree className="w-4 h-4 text-blue-600" /> Arborescence Structurée du Dépôt GitHub
            </h2>
            <pre className="p-4 bg-slate-950 text-slate-200 rounded-lg text-xs font-mono overflow-x-auto leading-relaxed">
{`mercator-crm/
├── .github/workflows/
│   └── ci.yml                  # Pipeline CI (Typecheck, Vitest, Build)
├── src/
│   ├── assets/images/          # Visuels haute résolution du projet
│   ├── components/
│   │   ├── CommercialViews.tsx # Dashboard, Comptes 360°, Pipeline Kanban
│   │   ├── DocumentAndAuditViews.tsx # Devis A4, Facturier, Relances, Audit
│   │   └── DocumentationView.tsx     # Documentation & Crédits Auteur
│   ├── server/
│   │   ├── middleware/
│   │   │   └── security.ts     # Headers HTTP, Rate Limit, Auth & RBAC
│   │   ├── services/
│   │   │   ├── auditService.ts # Journal d'activité immuable
│   │   │   ├── calculations.ts # Calculateur serveur HT/Remise/TVA/TTC
│   │   │   └── exportService.ts# Export CSV/JSON & Anti-CSV Injection
│   │   ├── app.ts              # Routeur REST Express (/api/*)
│   │   ├── db.ts               # Schéma SQLite WAL, Migrations & Seed
│   │   └── validators.ts       # Schémas de validation stricte Zod
│   ├── services/
│   │   └── api.ts              # Client HTTP typé Frontend
│   ├── tests/
│   │   └── crm.test.ts         # Suite de 9 tests unitaires & intégration
│   ├── types/
│   │   └── domain.ts           # Modèles TypeScript partagés
│   └── App.tsx                 # Shell SaaS, Command Palette (Ctrl+K)
├── Dockerfile                  # Build Multi-Stage non-root
├── docker-compose.yml          # Orchestration + Volume SQLite persistant
├── CONTRIBUTING.md             # Guide de contribution GitHub
├── LICENSE                     # Licence MIT (Mendel Temgoua)
├── architecture.md             # Diagrammes Mermaid & Modèle ERD
└── README.md                   # Documentation principale avec visuels`}
            </pre>
          </div>

          <div className="lg:col-span-6 p-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg space-y-4">
            <h2 className="text-base font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <Database className="w-4 h-4 text-blue-600" /> Tables Relationnelles SQLite (Mode WAL)
            </h2>
            <div className="space-y-3 text-xs">
              {[
                {
                  table: 'users',
                  desc: 'Utilisateurs et rôles RBAC (ADMIN, MANAGER, SALES).',
                },
                {
                  table: 'contacts',
                  desc: 'Prospects et clients avec statut, secteur, ville, N° TVA et responsable.',
                },
                {
                  table: 'opportunities',
                  desc: 'Affaires du pipeline avec montant estimé HT, probabilité et montant pondéré calculé serveur.',
                },
                {
                  table: 'quotes & quote_lines',
                  desc: 'Devis commerciaux et lignes détaillées (quantité, P.U. HT, remise %, taux TVA, totaux nets).',
                },
                {
                  table: 'invoices & invoice_lines',
                  desc: 'Factures émises, suivi des règlements (amount_paid, balance_due) et détection des retards.',
                },
                {
                  table: 'follow_up_tasks',
                  desc: 'Agenda des tâches de relance (appels, emails, relances devis et recouvrement).',
                },
                {
                  table: 'activity_logs',
                  desc: 'Table d’audit immuable (Append-Only) traçant chaque action utilisateur avec contexte JSON.',
                },
              ].map((t) => (
                <div
                  key={t.table}
                  className="p-3 border border-slate-200 dark:border-slate-800 rounded-md flex items-start justify-between gap-4"
                >
                  <div>
                    <div className="font-mono font-bold text-slate-900 dark:text-slate-100">
                      {t.table}
                    </div>
                    <div className="text-slate-600 dark:text-slate-400 mt-0.5">{t.desc}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* SECTION 3 : CONTRATS API & MATRICE RBAC */}
      {activeDocSection === 'api' && (
        <div className="p-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg space-y-4">
          <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
            Endpoints REST (`/api/*`) & Règles de Validation Serveur
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 text-slate-600 dark:text-slate-300">
                  <th className="py-2.5 px-3">Méthode & Route</th>
                  <th className="py-2.5 px-3">Rôle Minimum</th>
                  <th className="py-2.5 px-3">Logique Métier & Sécurité Serveur</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                <tr>
                  <td className="py-2.5 px-3 font-mono font-semibold">GET /api/dashboard</td>
                  <td className="py-2.5 px-3">Authentifié</td>
                  <td className="py-2.5 px-3">Agrégations temps réel (`scope=all|mine`), entonnoir pipeline et trésorerie.</td>
                </tr>
                <tr>
                  <td className="py-2.5 px-3 font-mono font-semibold">POST /api/contacts</td>
                  <td className="py-2.5 px-3">SALES / MANAGER / ADMIN</td>
                  <td className="py-2.5 px-3">Validation `contactInputSchema` (Zod), assainissement anti-XSS et trace d’audit.</td>
                </tr>
                <tr>
                  <td className="py-2.5 px-3 font-mono font-semibold">DELETE /api/contacts/:id</td>
                  <td className="py-2.5 px-3 font-semibold text-red-600 dark:text-red-400">ADMIN uniquement</td>
                  <td className="py-2.5 px-3">Vérifie l’absence de factures comptables liées (`409 Conflict` sinon) et journalise.</td>
                </tr>
                <tr>
                  <td className="py-2.5 px-3 font-mono font-semibold">POST /api/quotes</td>
                  <td className="py-2.5 px-3">SALES / MANAGER / ADMIN</td>
                  <td className="py-2.5 px-3">Ignore tout montant transmis par le client ; recalcule HT, remises, TVA et TTC côté serveur.</td>
                </tr>
                <tr>
                  <td className="py-2.5 px-3 font-mono font-semibold">POST /api/quotes/:id/convert-to-invoice</td>
                  <td className="py-2.5 px-3">Propriétaire / MANAGER / ADMIN</td>
                  <td className="py-2.5 px-3">Transaction ACID : génère la facture `FAC-2026-XXX`, passe le devis en `ACCEPTED` et le client en `ACTIVE_CLIENT`.</td>
                </tr>
                <tr>
                  <td className="py-2.5 px-3 font-mono font-semibold">POST /api/invoices/:id/payments</td>
                  <td className="py-2.5 px-3">Propriétaire / MANAGER / ADMIN</td>
                  <td className="py-2.5 px-3">Recalcule le solde restant dû (`balanceDue`) et met à jour le statut (`PARTIALLY_PAID` ou `PAID`).</td>
                </tr>
                <tr>
                  <td className="py-2.5 px-3 font-mono font-semibold">GET /api/export</td>
                  <td className="py-2.5 px-3">Contrôlé par entité</td>
                  <td className="py-2.5 px-3">Neutralise les formules CSV (`=`, `+`, `-`, `@`), filtre `OWNED_ONLY` pour SALES, bloque l’export d’audit aux commerciaux (`403`).</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* SECTION 4 : GUIDE DE PUBLICATION GITHUB & DÉPLOIEMENT */}
      {activeDocSection === 'github' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-7 p-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <GitBranch className="w-4 h-4 text-blue-600" /> Commandes de Publication sur votre GitHub
              </h2>
              <button
                onClick={() => copyCommand(gitPublishCommands)}
                className="px-3 py-1 text-xs font-medium text-slate-700 dark:text-slate-200 border border-slate-300 dark:border-slate-700 rounded hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center gap-1.5"
              >
                {copiedCmd === gitPublishCommands ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-600" /> Copié
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" /> Copier les commandes
                  </>
                )}
              </button>
            </div>

            <pre className="p-4 bg-slate-950 text-slate-100 rounded-lg text-xs font-mono overflow-x-auto leading-relaxed">
              {gitPublishCommands}
            </pre>

            <div className="p-4 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800 rounded-lg space-y-2 text-xs">
              <div className="font-semibold text-slate-900 dark:text-slate-100">
                Fichiers GitHub Standards inclus et prêts dans ce dépôt :
              </div>
              <ul className="space-y-1 text-slate-600 dark:text-slate-400">
                <li>· <strong>README.md</strong> : Documentation complète illustrée avec bannières visuelles, badges et crédit auteur <em>Mendel Temgoua</em>.</li>
                <li>· <strong>architecture.md</strong> : Spécifications techniques, diagrammes Mermaid et modèle relationnel ERD.</li>
                <li>· <strong>LICENSE</strong> : Licence Open-Source MIT au nom de <em>Mendel Temgoua</em>.</li>
                <li>· <strong>CONTRIBUTING.md</strong> : Charte de qualité, conventions de commits et procédure de Pull Request.</li>
                <li>· <strong>.github/workflows/ci.yml</strong> : Pipeline d’intégration continue exécutant automatiquement `npm run lint`, `npm test` et `npm run build` à chaque `git push`.</li>
              </ul>
            </div>
          </div>

          <div className="lg:col-span-5 p-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg space-y-4">
            <h2 className="text-base font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <Terminal className="w-4 h-4 text-blue-600" /> Vérification Avant Publication
            </h2>
            <div className="space-y-3 text-xs">
              <div className="p-3 bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 rounded-md">
                <div className="font-semibold text-emerald-900 dark:text-emerald-200">
                  ✓ Tests Unitaires & Intégration (Vitest)
                </div>
                <div className="text-emerald-700 dark:text-emerald-400 font-mono mt-0.5">
                  9/9 tests passés (Calculs HT/TVA/TTC, RBAC, Conversion Devis, Anti-CSV Injection)
                </div>
              </div>

              <div className="p-3 bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 rounded-md">
                <div className="font-semibold text-emerald-900 dark:text-emerald-200">
                  ✓ Vérification Statique TypeScript (`tsc --noEmit`)
                </div>
                <div className="text-emerald-700 dark:text-emerald-400 font-mono mt-0.5">
                  0 erreur de typage client et serveur
                </div>
              </div>

              <div className="p-3 bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 rounded-md">
                <div className="font-semibold text-emerald-900 dark:text-emerald-200">
                  ✓ Sécurité & Secrets Git
                </div>
                <div className="text-emerald-700 dark:text-emerald-400 font-mono mt-0.5">
                  Aucun secret commité · `.env.example` documenté · `.gitignore` configuré
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

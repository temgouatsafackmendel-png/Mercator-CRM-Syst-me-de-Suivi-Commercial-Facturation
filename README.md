# Mercator CRM — Plateforme de Gestion Commerciale & Facturation PME

![Mercator CRM — Aperçu Exécutif](./src/assets/images/crm_hero_banner_1794875154785.jpg)

> **Conçu, architecturé et développé par [Mendel Temgoua](mailto:mendeltemgouabusiness@gmail.com)**  
> *Application Full-Stack TypeScript · React 19 · Express 4 · SQLite Relationnel (Mode WAL) · Zod · Vitest*

---

## 1. Présentation du Produit

**Mercator CRM** est une solution complète de suivi commercial et de facturation conçue pour les petites et moyennes entreprises (PME). Elle centralise l'ensemble de la chaîne de valeur commerciale — de la qualification d'un prospect jusqu'à l'encaissement effectif des factures — tout en garantissant une **exactitude comptable stricte côté serveur**, un **contrôle d'accès par rôles (RBAC)** et une **traçabilité d'audit immuable**.

![Architecture Analytique & Grand Livre Commercial](./src/assets/images/crm_pipeline_preview_1794875156288.jpg)

### Critères d'Acceptation & Garanties d'Ingénierie
1. **Totaux Financiers Calculés Exclusivement Côté Serveur (`src/server/services/calculations.ts`)** :
   - Aucune confiance n'est accordée aux montants transmis par le client. Le backend recalcule chaque ligne (`Sous-total Brut HT`, `Remise en %`, `Net HT`, `TVA multi-taux 20% / 10% / 5,5% / 0%`, `Total TTC`), le solde restant dû (`balanceDue`), le statut d'échéance (`OVERDUE`) et le montant pondéré du pipeline (`weightedAmountHt`).
2. **Contrôle d'Accès par Rôles — RBAC (`src/server/middleware/security.ts`)** :
   - **Administrateur (`ADMIN`)** : Droits complets, suppression contrôlée (bloquée si factures rattachées), exports globaux et audit complet.
   - **Manager Commercial (`MANAGER`)** : Supervision globale, validation des devis, enregistrement des règlements et exports globaux, sans droit de suppression définitive (`403 FORBIDDEN_ROLE`).
   - **Commercial (`SALES`)** : Modification et conversion restreintes à ses propres dossiers (`403 FORBIDDEN_OWNER` sur les dossiers d'autrui) ; exports automatiquement filtrés sur son seul portefeuille (`OWNED_ONLY`).
3. **Historique d'Activité & Piste d'Audit Immuable (`src/server/services/auditService.ts`)** :
   - Toute création, modification de statut, conversion de devis en facture, saisie de règlement ou opération d'export (réussie ou refusée) génère une entrée horodatée dans la table `activity_logs`.
4. **Exports Contrôlés CSV & JSON (`src/server/services/exportService.ts`)** :
   - Protection active contre l'injection de formules tableur (**OWASP CSV Formula Injection** : neutralisation des préfixes `=`, `+`, `-`, `@`), BOM UTF-8 pour Excel, rate-limiting dédié et filtrage RBAC automatique.

---

## 2. Fonctionnalités & Expérience Utilisateur (UI / UX)

- **Palette de Commandes Globale (`Ctrl+K` / `Cmd+K`)** : Recherche instantanée à travers tous les comptes clients, devis et factures, avec raccourcis d'actions rapides.
- **Tableau de Bord Exécutif** : Sélecteur de périmètre en direct (`Périmètre Entreprise` vs `Mon Portefeuille`), alertes proactives sur les factures échues, entonnoir du pipeline par étape et flux mensuels.
- **Vue Master-Detail « Compte Client 360° »** : Tableau haute densité à gauche et panneau d'inspection 360° à droite réunissant synthèse financière, coordonnées légales/TVA, opportunités, devis et factures liés.
- **Pipeline Kanban & Registre Tabulaire** : Suivi visuel sur 6 étapes (`Qualification`, `Découverte`, `Proposition`, `Négociation`, `Gagné`, `Perdu`) avec barres de probabilité et promotion automatique du prospect en client actif lors du gain d'une affaire.
- **Éditeur de Devis & Aperçu Feuille Commerciale A4** : Simulation serveur en temps réel (`/api/calculations/preview`) et **conversion en facture en 1 clic** via transaction SQLite atomique.
- **Facturier & Recouvrement** : Bandeau de synthèse de trésorerie, barres de progression d'encaissement par facture et saisie d'acomptes ou règlements complets.
- **Thème Dual (Mode Clair / Mode Sombre)** : Contraste WCAG AA calibré et alignement vertical des chiffres (`font-variant-numeric: tabular-nums`).

---

## 3. Architecture & Structure du Projet

```text
mercator-crm/
├── .github/workflows/
│   └── ci.yml                        # Pipeline GitHub Actions (Lint, Tests, Build)
├── src/
│   ├── assets/images/                # Visuels haute résolution et portrait auteur
│   ├── components/
│   │   ├── CommercialViews.tsx       # Dashboard, Comptes 360°, Pipeline Kanban
│   │   ├── DocumentAndAuditViews.tsx # Devis A4, Facturier, Relances, Audit & Exports
│   │   └── DocumentationView.tsx     # Documentation interactive & Guide GitHub
│   ├── server/
│   │   ├── middleware/
│   │   │   └── security.ts           # En-têtes HTTP, Rate Limiter, Auth & RBAC
│   │   ├── services/
│   │   │   ├── auditService.ts       # Piste d'audit immuable (Append-Only)
│   │   │   ├── calculations.ts       # Moteur de calcul financier serveur
│   │   │   └── exportService.ts      # Générateur CSV/JSON & Anti-CSV Injection
│   │   ├── app.ts                    # Routeur API REST Express (/api/*)
│   │   ├── db.ts                     # Base SQLite WAL, Migrations & Jeu d'essai PME
│   │   └── validators.ts             # Validation et assainissement Zod
│   ├── services/
│   │   └── api.ts                    # Client HTTP typé
│   ├── tests/
│   │   └── crm.test.ts               # Suite de tests unitaires & intégration API
│   ├── types/
│   │   └── domain.ts                 # Modèles de données et Enums stricts
│   └── App.tsx                       # Workspace SaaS & Palette de commandes Ctrl+K
├── Dockerfile                        # Conteneur Multi-Stage non-root
├── docker-compose.yml                # Orchestration avec volume SQLite persistant
├── CONTRIBUTING.md                   # Guide de contribution
├── LICENSE                           # Licence MIT — Mendel Temgoua
├── architecture.md                   # Diagrammes Mermaid & Modèle relationnel ERD
└── README.md                         # Documentation principale
```

Consultez le fichier [architecture.md](./architecture.md) pour les diagrammes d'architecture Mermaid, le schéma relationnel ERD et le détail complet des contrats API.

---

## 4. Installation, Démarrage & Tests

### Prérequis
- **Node.js** `>= 20.x`
- **npm** `>= 10.x`

### Démarrage rapide en local
```bash
# 1. Cloner le dépôt
git clone https://github.com/mendeltemgoua/mercator-crm.git
cd mercator-crm

# 2. Configurer l'environnement local
cp .env.example .env

# 3. Installer les dépendances
npm install

# 4. Lancer le serveur Full-Stack (API Express + Frontend Vite sur http://localhost:3000)
npm run dev
```

### Vérification de la qualité (Tests, Typage, Build)
```bash
# Vérification stricte des types TypeScript
npm run lint

# Exécution de la suite de tests automatisés (Vitest + Supertest)
npm test

# Compilation du bundle de production
npm run build
```

### Déploiement avec Docker Compose
```bash
docker compose up --build -d
```

---

## 5. Auteur & Réalisation

<img src="./src/assets/images/author_mendel_avatar_1794875155331.jpg" alt="Mendel Temgoua" width="96" />

- **Auteur & Architecte Logiciel** : **Mendel Temgoua**
- **Contact Professionnel** : [mendeltemgouabusiness@gmail.com](mailto:mendeltemgouabusiness@gmail.com)
- **Licence** : Distribué sous licence [MIT](./LICENSE).

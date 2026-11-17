# Guide de Contribution — Mercator CRM

Merci de votre intérêt pour **Mercator CRM**, conçu et maintenu par **Mendel Temgoua** (`mendeltemgouabusiness@gmail.com`).

## 1. Standards de Qualité & Architecture

Avant de soumettre une Pull Request, assurez-vous que vos modifications respectent les règles fondamentales du projet :
1. **Zéro Calcul Financier Client de Confiance** : Tous les calculs de montants HT, remises, TVA, TTC, soldes de factures et pondérations du pipeline doivent obligatoirement résider dans `src/server/services/calculations.ts`.
2. **Contrôle d'Accès par Rôles (RBAC)** : Toute nouvelle route mutative ou d'export dans `src/server/app.ts` doit vérifier les permissions via `requireRoles` ou `canAccessRecord`.
3. **Traçabilité d'Audit** : Toute opération métier sensible doit appeler `recordActivity()` (`src/server/services/auditService.ts`).
4. **Validation Stricte** : Toutes les entrées utilisateur doivent être validées et assainies via un schéma Zod dans `src/server/validators.ts`.

## 2. Vérifications Obligatoires avant Commit

Exécutez systématiquement les trois commandes suivantes :

```bash
npm run lint
npm test
npm run build
```

## 3. Conventions de Commits

Nous utilisons la convention *Conventional Commits* :
- `feat: ajout d'une fonctionnalité métier`
- `fix: correction d'un bug de calcul ou d'affichage`
- `sec: renforcement de sécurité, validation ou RBAC`
- `docs: mise à jour de la documentation ou des diagrammes`
- `test: ajout de tests unitaires ou d'intégration`

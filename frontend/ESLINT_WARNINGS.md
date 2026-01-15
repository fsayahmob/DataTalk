# ESLint Warnings Structurels

Ces warnings sont des problèmes de structure (fonctions trop longues, complexité, etc.) qui seront corrigés au fur et à mesure des évolutions du code.

**Stratégie**: Lors de la modification d'un fichier listé ci-dessous, profiter de l'évolution pour refactorer et corriger le warning associé.

---

## max-lines-per-function (14 warnings)

| Fichier | Fonction | Lignes | Max |
|---------|----------|--------|-----|
| `src/app/catalog/page.tsx:31` | `CatalogPageContent` | 321 | 150 |
| `src/app/page.tsx:17` | `Home` | 241 | 150 |
| `src/app/runs/page.tsx:58` | `RunsPageContent` | 311 | 150 |
| `src/app/settings/page.tsx:10` | `SettingsPage` | 153 | 150 |
| `src/components/Chart.tsx:64` | `Chart` | 289 | 150 |
| `src/components/ChatZone.tsx:79` | `ChatZone` | 279 | 150 |
| `src/components/DataTable.tsx:55` | `DataTable` | 233 | 150 |
| `src/components/catalog/PipelineLog.tsx:10` | `PipelineLog` | 197 | 150 |
| `src/components/catalog/TableDetailPanel.tsx:16` | `TableDetailPanel` | 223 | 150 |
| `src/components/settings/ApiKeysTab.tsx:24` | `ApiKeysTab` | 194 | 150 |
| `src/components/settings/DatabaseTab.tsx:17` | `DatabaseTab` | 220 | 150 |
| `src/components/settings/PromptsTab.tsx:46` | `PromptsTab` | 213 | 150 |
| `src/components/settings/UsageTab.tsx:41` | `UsageTab` | 268 | 150 |
| `src/hooks/useConversation.ts:42` | `useConversation` | 154 | 150 |

**Solution**: Extraire des sous-composants ou des hooks personnalisés.

---

## complexity (1 warning)

| Fichier | Fonction | Complexité | Max |
|---------|----------|------------|-----|
| `src/components/Chart.tsx:64` | `Chart` | 29 | 20 |

**Solution**: Simplifier la logique conditionnelle, extraire des fonctions helper.

---

## max-depth (2 warnings)

| Fichier | Ligne | Niveau | Max |
|---------|-------|--------|-----|
| `src/components/catalog/layoutUtils.ts:81` | - | 6 | 5 |
| `src/components/catalog/layoutUtils.ts:86` | - | 7 | 5 |

**Solution**: Extraire la logique imbriquée dans des fonctions séparées.

---

## max-lines (1 warning)

| Fichier | Lignes | Max |
|---------|--------|-----|
| `src/lib/api.ts` | 733 | 500 |

**Solution**: Diviser en plusieurs fichiers (api/catalog.ts, api/llm.ts, api/reports.ts, etc.)

---

## incompatible-library (1 warning)

| Fichier | Ligne | Détail |
|---------|-------|--------|
| `src/components/DataTable.tsx:78` | 17 | Use of incompatible library |

**Solution**: Vérifier la compatibilité de la bibliothèque avec React 19/Next.js 16.

---

## Historique

- **2026-01-15**: 54 warnings corrigés (no-floating-promises, no-misused-promises, no-unused-vars, no-explicit-any, exhaustive-deps, eqeqeq). 20 warnings structurels reportés.
- **2026-01-15**: Refactoring runs/page.tsx - séparation en 3 effets distincts, extraction helpers status. Complexity warning corrigé (21→OK). 19 warnings restants.

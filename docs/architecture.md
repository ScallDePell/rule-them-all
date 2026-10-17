# Rule Them'All : architecture

Ce document décrit le module dans sa version actuelle. Le guide d'utilisation est dans [guide-mj.md](guide-mj.md), les exemples dans [exemples-configuration.md](exemples-configuration.md).

## 1. Mission

- Rule Them'All est un **module Foundry v14** qui tourne par-dessus **n'importe quel système de jeu**. Il ne contient aucune règle : caractéristiques, dés, seuils, ressources, états, couleurs et feuilles viennent des **Rulesets** que le MJ configure.
- Les sous-types Actor/Item sont ceux du système actif (`src/core/system-document-types.mjs`) ; un système qui en propose plusieurs demande un choix explicite sur le Type de contenu.
- Tous les libellés de l'interface existent en français et en anglais (`lang/fr.json`, `lang/en.json`, mêmes clés). Les textes d'un Ruleset passent par ses propres traductions.

## 2. Couches

| Couche | Fichiers | Rôle |
| --- | --- | --- |
| Identité | `src/core/module-contract.mjs` | ID du module, format d'export, hooks publics |
| Configurateur (domaine) | `src/configurator/configurator-api.mjs`, `-schema`, `-validation`, `-graph`, `rule-contracts.mjs`, `dependency-index.mjs` | Collections d'un Ruleset, préparation des entrées, validation, versions, dépendances |
| Stockage | `configurator-storage.mjs`, `world-setting-storage.mjs` | Un réglage de monde d'index plus un réglage par version de Ruleset |
| Fenêtres du configurateur | `configurator-app.mjs`, `configurator-entry-editor.mjs`, `sheet-layout-controller.mjs` | Orchestration Foundry et DOM ; la collecte et la sérialisation sont dans des modules testés à part (`entry-data-collector.mjs`, `creation-step-serialization.mjs`, `entry-expression-serialization.mjs`) |
| Présentation | `src/ui/*.mjs`, `templates/**/*.hbs`, `styles/*.css` | Tout le markup ; ni règle de jeu ni écriture |
| Runtime | `src/runtime/runtime-engine.mjs`, `runtime-evaluator.mjs`, `runtime-transaction.mjs`, `runtime-states.mjs` | Exécution générique : tests, actions, effets, états, durées, progression, réactions |
| Pont Foundry | `src/runtime/foundry-*.mjs`, `rule-them-all.mjs` | Adaptateur de données, feuilles jouées, création de personnage, initiative, ressources partagées, horloge du monde |

Frontière : le domaine ne produit pas de HTML, la présentation ne décide ni de mécanique ni de persistance (contrôlé par `qa/architecture-audit.mjs` et `qa/release-readiness.mjs`).

## 3. Données

- Stockage du monde : index `configuratorStorage` (`storageVersion: 4`, découpé) ; le configurateur voit un instantané `storageVersion: 3`. Aucune lecture d'un format plus ancien.
- Export/import : enveloppe `rta-ruleset`, seul format lu et écrit.
- Quand un format stocké disparaît, `src/configurator/stored-data-repair.mjs` le convertit : le MJ le lance depuis Paramètres du jeu → Rule Them'All → Réparer les données (`repair-data-menu.mjs`), qui montre les changements, télécharge une sauvegarde puis écrit. Le reste du module ne lit que le format courant.
- Toute écriture de jeu persistante passe par `engine.transaction` (journal, annulation). Les adaptateurs exposent `load`, `loadLedger`, `write`, `canWrite`, `subject`, `worldTime`, `listContainers`.
- Les feuilles écrivent dans le runtime (`writeSheetValue`), jamais dans les données du système hôte.

## 4. Points d'extension

- `game.ruleThemAll` : API du configurateur et du runtime.
- Hooks : `ruleThemAllTestResolved`, `ruleThemAllEvent`, `ruleThemAllActionExecuted`, `ruleThemAllLedgerEntry`, `ruleThemAllReactionOffered`, `ruleThemAllChoiceOffered`.
- `ruleThemAllRegisterTypes` (au `setup`) : un autre module y ajoute des types de valeur, des nœuds de formule et des opérations d'effet.

## 5. Interface

- **RTA Select** est le seul sélecteur simple/multiple. En simple, un choix peut être décoché et cliquer une autre option la remplace.
- Couleurs : celle du Type de définition ou de contenu, celle de la famille sinon ; un Tag a toujours sa propre couleur. Sans couleur, rail neutre.
- CSS (vérifié par les tests) : une feuille par composant, couleurs seulement dans `tokens.css`, pas de `!important` (une exception pour le select natif), `@container` plutôt que `@media`, espacements 4/8/12 px via `--rta-gap-*`.

## 6. Vérifications

```
node --test tests/*.test.mjs
node qa/architecture-audit.mjs --strict
node qa/release-readiness.mjs
```

Rendus Chromium (variable `RTA_CHROMIUM`, CSS de Foundry via `RTA_FOUNDRY_CSS`) : `qa/configurator-render.mjs` d'abord, puis `dynamic-markup-audit.mjs`, `layout-audit.mjs`, `sheet-editor-flow.mjs`, `sheet-render.mjs`, `creation-render.mjs`, `shared-resources-render.mjs`.

## 7. Limites et dettes identifiées

- Les tests Node et Chromium ne remplacent pas une recette dans Foundry v14 ; elle se note dans [recette-foundry-v14.md](recette-foundry-v14.md).
- `runtime-engine.mjs` dépasse 1000 lignes ; à découper si on y ajoute encore des mécaniques.
- Trois vérifications de largeur d'aperçu de `qa/sheet-editor-flow.mjs` échouent dans Chromium (déjà le cas avant la 1.0.1).

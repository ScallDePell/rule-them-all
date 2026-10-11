> Current development snapshot: **v0.1.66 WIP** (constraints/presentation stage; NOT_READY). See RTA-CONTRAINTES-PRESENTATION-v0.1.66.md.

# Rule Them'All v0.1.65 WIP — Reprise continue (NON VALIDÉE)

Cette version **poursuit directement les sources v0.1.60 WIP**. Elle ne remplace pas les contrats canoniques ; lire `RTA-RELATIONS-CANONIQUE-v0.1.60.md` puis `RTA-ACQUISITION-GUIDEE-v0.1.61.md` , `CHANGELOG-v0.1.61.md` et `CHANGELOG-v0.1.62.md`.

Le parcours d'acquisition natif prévalide les choix multi-familles et préserve les données des Items. Le contrôle de livraison reste **NOT_READY**, avec **huit critères ouverts**, et aucun essai réel Foundry v14 n'a été exécuté. Ne pas utiliser cette archive sur un monde principal ou considérer les contrôles Node/Chromium comme une recette Foundry.

---

# v0.1.59 - Contrat transverse de references (candidat NOT_READY)

Lire `RTA-RELATIONS-CONTRAT-v0.1.59.md` et `CHANGELOG-v0.1.59.md`. Cette version corrige des pertes de liens a la sauvegarde et renforce l'integrite des relations entre collections. Une preuve traverse le vrai formulaire HBS/RTA Select, la serialisation, l'API et le rechargement du stockage simule. **Le module n'est pas encore valide pour jouer et la recette Foundry v14 est manquante.**

---

# v0.1.58 - WIP functional integration candidate, NOT validated for play

Read [RTA-PARCOURS-FONCTIONNELS-v0.1.58.md](RTA-PARCOURS-FONCTIONNELS-v0.1.58.md) and [CHANGELOG-v0.1.58.md](CHANGELOG-v0.1.58.md) FIRST. The critical Ruleset creation failure is corrected and the first cross-layer Creation/Content/Action execution paths are implemented. The Creation player UI, Progression, Sheets, PermissionPolicy, Duration lifecycle and Foundry v14 live acceptance are still OPEN. Do not treat this as a completed refactor.

---

# Reprise technique — v0.1.57 (candidat d'intégration Foundry)

**LIRE EN PREMIER : [`RTA-ARCHITECTURE-CANONIQUE.md`](RTA-ARCHITECTURE-CANONIQUE.md)**. Les responsabilités JavaScript de l'éditeur, les règles métier et leur sérialisation sont extraites dans des modules indépendants. Le mapping de sous-types Actor/Item est explicite dès que le système hôte en propose plusieurs ; il est enregistré sur le Content Type et proposé dans Runtime Lab. **182 tests Node et les matrices Chromium sont verts ; la recette Foundry v14 réelle reste non exécutée.** Voir [`CHANGELOG-v0.1.57.md`](CHANGELOG-v0.1.57.md) et [`RTA-RECETTE-FOUNDRY-v0.1.57.md`](RTA-RECETTE-FOUNDRY-v0.1.57.md). La v0.1.56 reste la base de retour arrière.

---

# Reprise technique — v0.1.56 (candidat d’assainissement architectural)

**LIRE EN PREMIER : [`RTA-ARCHITECTURE-CANONIQUE.md`](RTA-ARCHITECTURE-CANONIQUE.md)**. Ce contrat de conception est la source de reprise pour les prochaines sessions ; les journaux historiques ne le remplacent pas.

Cette version sépare des responsabilités JavaScript, élimine les hypothèses de Game System et migre les noms d'interface `rwf-*` vers `rta-*` sans modifier les 32 captures de référence testées. Les formats d'export et hooks historiques sont maintenus pour compatibilité. Exécuter `node --test tests/*.test.mjs`, `node qa/architecture-audit.mjs --strict`, puis les matrices Chromium en cas de changement UI. Voir [`CHANGELOG-v0.1.56.md`](CHANGELOG-v0.1.56.md).

**Statut : candidat non validé dans Foundry v14.** La dette encore ouverte est listée dans le contrat canonique ; cette version n'est pas une réécriture complète de RTA.

---

## v0.1.55 — CSS design system transverse (candidat de recette)

Le CSS a ete restructure et mis en forme, avec un ensemble commun de variables d'espacement, typographie et arrondis. Les anciennes associations fixes de couleurs aux types de jeu sont supprimees au profit des couleurs deja fournies par le Ruleset. Les regles repetitives ont ete consolidees sans modifier le JavaScript metier. Les controles Chromium couvrent 25 editeurs et 7 ecrans principaux aux largeurs 560/760/1250 px (96 rendus) ; 140 tests Node passent. Voir [`RTA-DESIGN-SYSTEM-v0.1.55.md`](RTA-DESIGN-SYSTEM-v0.1.55.md) et [`CHANGELOG-v0.1.55.md`](CHANGELOG-v0.1.55.md). La normalisation de l'echelle introduit de petits ajustements visuels, en attente de validation dans Foundry v14. Cette version n'est pas declaree stable.

## v0.1.54 — Condition / Formula : grille de formulaire unique

Les opérations (`Comparison` et `Operation`) et les opérandes appartiennent maintenant à la même grille canonique `[libellé][contrôle]` que `Name`/`Description`. Les deux éditeurs ainsi que l'ajout dynamique d'opérandes utilisent une seule structure, avec sous-grille métier dans la colonne contrôle. Voir [`CHANGELOG-v0.1.53.md`](CHANGELOG-v0.1.53.md). Candidat de recette Foundry v14 ; Chromium validé, Foundry non testé.

## v0.1.52 — Correction des sélecteurs d’opérandes Formula / Condition

La grille compacte des opérandes (type | valeur | suppression) utilise désormais RTA Select sans y insérer une seconde grille standard. Le comportement des champs ordinaires reste inchangé. Voir [`CHANGELOG-v0.1.52.md`](CHANGELOG-v0.1.52.md).

## v0.1.50 — RTA Select : couleur neutre visible et ouverture accélérée

Chaque option affiche un repère de couleur, même quand aucune couleur spécifique n'est enregistrée : **#808080** (neutre canonique déjà utilisé dans le configurateur). Les couleurs de types, Tags et familles restent prioritaires, les couleurs multiples restent visibles. La préparation de l'éditeur réutilise les catalogues déjà présents dans son instantané de rendu, au lieu de recopier l'agrégat Ruleset à chaque liste, et revient à l'API courante pour toute opération hors rendu. **Aucune modification du schéma de sauvegarde.** Voir [`CHANGELOG-v0.1.50.md`](CHANGELOG-v0.1.50.md). Candidat de recette Foundry v14 ; temps de préparation mesuré hors Foundry, pas temps total d'ouverture.

## v0.1.49 — Correctif bloquant : ouverture des éditeurs

Corrige le `ReferenceError: withColors is not defined` introduit en v0.1.48 lors de la construction des opérandes de formules et de conditions. `withColors` est désormais transmis explicitement aux générateurs d’opérandes. Le correctif conserve le même RTA Select, les mêmes couleurs, les mêmes valeurs sauvegardées et le même CSS. Un test reproduit le crash original avec des catalogues non vides, et un second vérifie l’ouverture du contexte des 25 types d’éditeurs. Voir [`CHANGELOG-v0.1.49.md`](CHANGELOG-v0.1.49.md). Candidat de recette Foundry v14.

## v0.1.48 — RTA Select : noms lisibles et traits colorés

Les références homogènes n’affichent plus le suffixe « · definition ». Les options reçoivent, lorsque configurées, les couleurs réelles des familles de types et Tags, avec plusieurs traits possibles à gauche des cases. Même composant RTA Select, aucune modification des valeurs stockées. Contrôle des sélections dynamiques et du Runtime Lab. Voir [`CHANGELOG-v0.1.48.md`](CHANGELOG-v0.1.48.md). Candidat de recette Foundry v14.

## v0.1.47 — RTA Form Row canonique

La norme visuelle `[libellé][contrôle]` s'applique maintenant aux champs ordinaires du module, y compris à tous les modes de RTA Select et aux champs construits dynamiquement. Les contenus spéciaux (cartes de valeurs, Sheet Builder compact, JSON technique, barres d'outils) restent explicitement justifiés. Voir [`RTA-FORM-ROW-CONTRAT-v0.1.47.md`](RTA-FORM-ROW-CONTRAT-v0.1.47.md) et [`CHANGELOG-v0.1.47.md`](CHANGELOG-v0.1.47.md). Candidat de recette Foundry v14 ; visuel validé en Chromium avec variables de thème simulées.

## v0.1.46 — RTA Select : lisibilité des sélections

Capacités obligatoires affichées hors du sélecteur ; champs de références multiples transformés en RTA Select en conservant leurs objets de référence ; titre des listes maintenu visible lors de la sélection. Voir `CHANGELOG-v0.1.46.md`. Cette version est un **candidat de recette Foundry v14**.

# Rule Them'All

Rule Them'All is a generic Foundry VTT module extracted from the Real World Fantasy development line.

It owns the configurable rules engine and authoring tooling: Rulesets, Definition Types/Definitions, Formulae, Conditions, Effects, Actions, Tests/Rolls/Outcomes, content authoring and Compendium synchronization, acquisition/provenance, modifiers/restrictions/durations, creation/progression contracts, Runtime Lab, and the declarative Sheet Builder/WYSIWYG foundation.

It does **not** contain Real World Fantasy game rules. A Game System supplies Foundry document subtypes and a Ruleset supplies all game semantics.

Public API: `game.ruleThemAll` after initialization, with `game.ruleThemAll.configuratorReady` as the hydration promise.

## v0.1.64 WIP — Liseré unique Ruleset / Général / navigation

Suite de la validation visuelle v0.1.63 : le liseré du premier type de tuile devient la seule forme (4 px pleine hauteur, rayon 4 px) sur les cartes de Ruleset, cadres Général et navigation gauche. Suppression de la variante 1 px Général, de l'ombre intérieure de 3 px du menu et du micro-liseré de sous-menu. Couleurs, héritage, éditeur de Ruleset et fonctions v0.1.63 inchangés. **WIP / NOT_READY : pas de validation réelle Foundry v14.** Voir [CHANGELOG-v0.1.64.md](CHANGELOG-v0.1.64.md) et [RTA-LISERET-UNIQUE-v0.1.64.md](RTA-LISERET-UNIQUE-v0.1.64.md).

## v0.1.63 WIP — Couleurs hiérarchiques Ruleset / Général

Vue Général avec liserés utilisant l’accent CSS existant et bouton **Modifier Ruleset** ; édition du nom/description/version et des couleurs du Ruleset et de ses rubriques. Autorisation des surcharges par rubrique, héritage par défaut des sous-sections et préservation des couleurs individuelles lorsque désactivées. Neutre universel `#666666`. Voir [`RTA-COULEURS-RULESET-v0.1.63.md`](RTA-COULEURS-RULESET-v0.1.63.md) et [`CHANGELOG-v0.1.63.md`](CHANGELOG-v0.1.63.md). **WIP / NOT_READY** ; tests navigateur simulés, Foundry v14 non testé. Les passages historiques du README parlant de `#808080` décrivent des versions remplacées, non le contrat courant.

## v0.1.2
- Fix new Ruleset editor: no collection lookups before a Ruleset version exists.
- Existing tile layout and bottom Import area unchanged.

## v0.1.13
Flyout positioning uses the full Foundry window height above the sidebar; compact menus remain at their trigger.

## v0.1.22
Shared canonical card geometry for Ruleset landing and collections; normalized actions and row alignment; removed title-button focus flash while retaining keyboard-visible parent focus.


## v0.1.23 — Entry editor visual foundation

- Shared entry-window CSS contract in the existing `styles/configurator.css`, scoped to `.rwf-config-entry`.
- Uses the existing Foundry controls and Configurator palette; no new per-component stylesheet or editor-specific business styles.
- Harmonizes fieldset, collapsible sections, dynamic field cards, field spacing and footer.
- Does not change the template, field names, handlers, persistence or business logic.
- Requires visual acceptance in Foundry VTT 14 before broader CSS cleanup.

## v0.1.24
- Editor window: unify collapsible pickers and technical sections with the same existing section CSS.
- Tags pickers moved outside their enclosing fieldsets (same data bindings).
- Textareas use full available width; consistent heading actions and summary spacing.
- Definitions granted list scrolls inside a bounded area; optional initial-value inputs shown on selected definitions.

## v0.1.25
- General panels share the canonical collection tile border and radius.
- Dependencies now provides a read-only grouped explorer with resolved names, search, detailed technical paths and missing-reference indications.

### v0.1.27
- Dependencies: no mouse-focus flash; canonical family-colored left accent and title.
- Dependency graph wheel zoom anchors to mouse pointer.
- Collection tag facets: frequency ordered, multi-tag AND filtering, view-local selection and clear.

## v0.1.28
- Dependencies tag facets use the existing shared UI and AND filtering.
- Dependencies colors resolve from actual definition/content type, mirroring collection tiles.
- Click unresolved count to filter consumers with missing targets; toggle to restore.

## v0.1.29
- Default configurator height 860 px.
- Tag filters across collections and Dependencies use OR semantics.
- Tag facet buttons reuse the compact squared visual style of collection tags.
- Dependencies titles use neutral white, metadata muted yellow, and edit actions bottom-right; colored left accents retained.

## v0.1.30
- Fix collection card accent regression: canonical neutral panel border no longer overrides the type/family-specific left stripe.
- Keep configurator dimensions at 1118 x 860.

## v0.1.31 — Maintenance CSS

Consolidation conservatrice des declarations CSS redondantes pour les facettes Tags et les lignes Dependencies. Aucun changement intentionnel de rendu ou de logique metier. JavaScript et templates inchanges.

## v0.1.32 — Tag facet selected state
- Selected tag filters use a white background and black text (including counts), retaining their existing accent border, width and radius.
- Hover does not override the selected appearance. Applies to collections and Dependencies.


## v0.1.33
Experimental isolated generic operation-plan contract and tests; no UI or runtime behavior changes. See AUDIT-CONTRAT-GENERIQUE-v0.1.33.md.

## Composants HTML / CSS canoniques (v0.1.41)

Avant toute intervention sur un champ, un sélecteur, une carte, une section ou un bouton, consulter
[`UI-CONTRAT-COMPOSANTS-v0.1.41.md`](UI-CONTRAT-COMPOSANTS-v0.1.41.md).
La consolidation est transversale ; les exceptions de structure y sont motivées par les usages.
Les tests Node vérifient les contrats de code. L'inspection visuelle Chromium réalisée lors de la livraison
est complémentaire, **pas une certification de rendu et de persistance dans Foundry**.

## v0.1.42 — Creation System source families

Les étapes Creation System peuvent sélectionner les **Definition Types** (familles de règles) indépendamment des **Definitions spécifiques**. Les données historiques utilisant la collection `definitions` restent inchangées. Voir `CREATION-SOURCES-v0.1.42.md` pour les implications fonctionnelles et la limite runtime.

## v0.1.43 — Sélecteur universel RTA Select

Toutes les sélections simples/multiples des formulaires sont présentées par une seule implémentation HTML/CSS/JavaScript (`src/ui/rta-select.mjs`), y compris les choix injectés dynamiquement. Les sélections sont réordonnées seulement à la réouverture. Les inputs natifs restent les supports de données et d'événements pour ne pas casser le module. Documentation et exceptions : [`RTA-SELECT-CONTRAT-v0.1.43.md`](RTA-SELECT-CONTRAT-v0.1.43.md).

## v0.1.44 — Espacements des sélecteurs dans les éditeurs

RTA Select conserve un seul composant visuel ; les conteneurs d'édition définissent maintenant son espacement vertical lorsqu'il remplace une section `<details>`. Correctif CSS transversal sans ajout de marges dans les grilles ou les piles qui possèdent déjà un `gap`. Voir [`CHANGELOG-v0.1.44.md`](CHANGELOG-v0.1.44.md).

## v0.1.45 — RTA Select : choix vides

Les options HTML de valeur vide des sélections uniques servent uniquement à enregistrer « aucune sélection ». Elles ne sont plus affichées comme des cases à cocher techniques dans RTA Select ; décocher la sélection restaure bien la valeur native vide. Les véritables options utilisent leurs indices natifs d'origine, y compris lorsqu'une option est désactivée. Voir [`CHANGELOG-v0.1.45.md`](CHANGELOG-v0.1.45.md).

### v0.1.54 - Canonical geometry QA
The same control-height token and form-row width contract now cover 25 editor kinds. `qa/form-matrix.py` is an optional Chromium visual validation harness (requires Python Playwright). See `CHANGELOG-v0.1.54.md`.

## v0.1.65 WIP — Navigation sans champ de recherche

Retrait du champ de recherche du volet de navigation gauche, du filtrage JS associé et du CSS orphelin. Recalcul de hauteur du panneau sans recherche. Les recherches des listes métier et RTA Select ne changent pas. Contrat des définitions inchangé. Foundry v14 réel non testé ; NOT_READY.

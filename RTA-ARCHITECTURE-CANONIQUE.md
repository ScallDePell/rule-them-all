# Rule Them'All — contrat d'architecture canonique

**Autorité de reprise technique : RTA v0.1.59 candidat de contrat des relations, NON VALIDE pour jouer. Lire `RTA-RELATIONS-CONTRAT-v0.1.59.md` et `RTA-PARCOURS-FONCTIONNELS-v0.1.58.md` ; conserver v0.1.58 comme base de comparaison intacte.**
Ce document doit être lu **avant** toute modification de RTA. Les changelogs décrivent l'histoire ; ils ne sont pas une source d'architecture quand ils contredisent ce document ou les contrats d'interface plus récents. La v0.1.56 reste le point de comparaison de code et de rendu pour cette étape ; ne pas la supprimer.

## 1. Mission et limites

- **Rule Them'All (RTA)** est un **module Foundry v14 générique pour tout JDR**. **Real World Fantasy (RWF)** est un Ruleset consommateur, jamais une famille de règles imposées par le module.
- Les formules, caractéristiques, compétences, ressources, dés, seuils, bonus, familles et leurs couleurs viennent des **Rulesets** et des schémas configurables ; le Runtime Lab peut utiliser des **données fictives de test** isolées.
- Les sous-types Foundry Actor/Item sont **déclarés par le Game System actif**, jamais fixés par RTA à `character`, `npc`, `pc`, `content`. `src/core/system-document-types.mjs` les résout à l'exécution. Le sous-type est choisi explicitement pour les systèmes en exposant plusieurs, via `ContentType.documentSubtype` ou les sélections source/cible du Runtime Lab. Un sous-type unique est accepté automatiquement. Les anciennes données restent lisibles.
- Les noms métiers et UI doivent être disponibles en **FR/EN**, sans déclarer `TYPES.Actor.*` pour le système hôte.

## 1 bis. Infrastructure transversale des références (v0.1.59)

- `src/configurator/relation-contract.mjs` établit la correspondance entre collections de Ruleset et identifiants logiques ; `dependency-index.mjs` enregistre les consommateurs connus ainsi que les références logiques imbriquées.
- `src/configurator/content-template-form.mjs` conserve les données non éditées et sérialise les groupes de choix en relations typées (`targetRef`, `operation`, `config`).
- `src/configurator/relation-persistence.mjs` vérifie **après relecture** que les relations soumises dans le formulaire ont bien survécu à la sauvegarde ; l'erreur est bloquante plutôt que masquée.
- Les champs de référence s'alimentent des **24 collections du schéma**. Une famille sélectionnable n'est pas forcément exécutable dans le Runtime : ne jamais confondre disponibilité de la sélection et gameplay fonctionnel.
- Test transversal : `python qa/relations-browser.py` (véritable template et RTA Select Chromium, puis API/stockage simulé). Cela ne remplace pas une recette Foundry v14.

## 2. Dépendances et responsabilités

| Couche | Sources canoniques | Responsabilité |
| --- | --- | --- |
| Identité / compatibilité | `src/core/module-contract.mjs` | Module ID, formats d'export, hooks publics historiques |
| Interopérabilité Foundry | `src/core/system-document-types.mjs`, `src/runtime/foundry-*.mjs` | Résolution Actor/Item, flags et documents du système actif |
| Configurateur / domaine | `src/configurator/configurator-api.mjs`, `configurator-schema.mjs`, `configurator-validation.mjs`, `configurator-storage.mjs` | Schéma, données, validations, versions, persistance |
| Routage éditeurs | `src/configurator/entry-operations.mjs`, `configurator-entry-editor.mjs` | Méthodes par type d'entrée et orchestration du formulaire |
| Modèles et sérialisation | `src/configurator/entry-field-models.mjs`, `entry-field-serialization.mjs`, `entry-data-collector.mjs`, `entry-expression-serialization.mjs`, `creation-step-serialization.mjs`, `entry-reference-catalog.mjs` | Modèles de champs, collecte des données et références sans couplage à Foundry |
| Modèles et sérialisation | `src/configurator/entry-field-models.mjs`, `entry-field-serialization.mjs`, `entry-data-collector.mjs`, `entry-expression-serialization.mjs`, `creation-step-serialization.mjs`, `entry-reference-catalog.mjs` | Modèles de champs, collecte des données et références sans couplage à Foundry |
| Présentation HTML | `src/ui/entry-editor-markup.mjs`, `picker-markup.mjs`, `html-utils.mjs` | Génération de markup sans règles métier et sans accès Foundry |
| Sélection | `src/ui/rta-select.mjs`, `select-option-presentation.mjs` | Sélecteur unique/multiple, libellés, rails de couleur |
| Styles | `styles/*.css` (ordre fixé par `module.json` « styles »), `RTA-DESIGN-SYSTEM-v0.1.55.md`, `RTA-FORM-ROW-CONTRAT-v0.1.47.md` | Tokens et grille `[libellé][contrôle]` |
| Runtime | `src/runtime/runtime-engine.mjs`, `runtime-evaluator.mjs`, `runtime-contracts.mjs` | Exécution générique du Ruleset |
| Exemples de test | `src/runtime/runtime-demo-profile.mjs`, `runtime-lab-fixtures.mjs` | Valeurs fictives uniquement pour Runtime Lab, injectables |

**Frontière impérative :** les fonctions de présentation ne doivent ni décider de la mécanique d'un jeu ni écrire la persistance. Les fonctions de domaine ne doivent ni injecter d'HTML ni décider du style.

## 3. Invariants des données et de la compatibilité

- ID public Foundry : **`rule-them-all`**, centralisé dans `src/core/module-contract.mjs`. Ne pas changer arbitrairement les flags de monde, identifiants, `data-*` opérationnels, chemins de stockage ou structures de références.
- `storageVersion: 3` est le **contrat de stockage actuellement pris en charge** par `src/configurator/configurator-storage.mjs`. Attention : le code actuel **ne lit pas** les envelopes de stockage versions 2 et antérieures ; ne jamais affirmer le contraire.
- Format d'enveloppe d'export **historique** `rwf-ruleset` : toujours lu et **encore émis par défaut** ; format `rta-ruleset` également lisible et émettable explicitement. Il ne faut pas basculer la valeur émise par défaut sans migration concertée.
- Hooks publics historiques `rwfEvent`, `rwfTestResolved` et `rwfActionExecuted` : **conservés** comme points d'intégration externes jusqu'à migration explicite.
- Runtime Lab : noms internes `source` et `target`, anciennes propriétés `pj`/`pnj` retournées comme **alias de compatibilité** uniquement.
- Ancien namespace **transitoire d'interface** `rwf-*` remplacé par `rta-*` dans MJS/HTML/CSS : la migration est atomique dans le module. **Risque résiduel :** des thèmes ou macros externes sélectionnant les anciennes classes DOM peuvent nécessiter adaptation ; cela ne doit pas être présenté comme une migration universellement transparente.
- Aucun renommage de `data-*`, d'identifiants d'objets ou de champs enregistrés sans test de cycle sauvegarde / réouverture / export / import.

## 4. Composants UI, contrat global

- **RTA Select** est le seul sélecteur visuel simple/multiple. Single : fermeture immédiate après coche ; tant qu'un élément reste coché, les autres sont inactifs ; décocher libère la liste. Multiple : sélection libre. Le résumé se met à jour immédiatement, le tri ne bouge **pas pendant l'ouverture** ; les choix sélectionnés remontent uniquement **à la prochaine ouverture**. Clic extérieur ferme le panneau.
- Source de couleur des choix : `DefinitionType.color` pour une Definition ; `ContentType.color` pour un Content ; couleur de famille pour une autre famille RTA ; couleur du Tag **uniquement si l'objet proposé est lui-même un Tag**. Un choix sans couleur personnalisée affiche le rail neutre **`#808080`**. Ne pas colorer une Definition d'après ses Tags.
- Une entrée standard de formulaire = **un wrapper canonique `[libellé][contrôle]`**. Exceptions techniques justifiées : rangées d'opérandes comportant sous-grille `type / valeur / suppression`, cartes d'acquisition avec valeurs composites, Sheet Builder compact, tableaux, JSON brut. Ces exceptions conservent **les mêmes tokens de hauteur et d'espacement**.
- Les classes d'interface RTA commencent par `rta-`, et les composants réutilisent les tokens CSS plutôt que des valeurs arbitraires locales.
- La règle des couleurs n'est **pas** `characteristic = rouge`, `skill = bleu`, etc. Elle est déterminée par le Ruleset ou, si non définie, par la couleur neutre.

## 5. Reprise sans dépendre de la mémoire de la conversation

**À chaque session et avant de toucher au code :**

1. Lire ce fichier, `module.json`, le changelog le plus récent, `RTA-DESIGN-SYSTEM-v0.1.55.md`, `RTA-FORM-ROW-CONTRAT-v0.1.47.md` et `RTA-SELECT-CONTRAT-v0.1.43.md` (en appliquant les règles actualisées ici en cas de contradiction).
2. Prendre le ZIP/source existant comme **vérité technique** et identifier la version effective ; ne jamais reconstruire les modules de mémoire.
3. Avant changement : garder un snapshot, lancer `node --test tests/*.test.mjs`, `node qa/architecture-audit.mjs --strict`.
4. Pour une modification d'interface : générer avec Chromium la matrice complète `python qa/form-matrix.py . /tmp/rta-entry-matrix` et `python qa/shell-matrix.py . /tmp/rta-shell-matrix`, puis comparer **captures et styles calculés** à la référence avant de déclarer une absence de régression.
5. Pour une modification de données : tester les enveloppes anciennes et nouvelles, conservation des IDs/flags et round-trip d'objets réels ou fixtures représentatives. Pour Foundry : ne jamais annoncer un test in-app absent.
6. Pour toute livraison : rapport `fait / non fait / exceptions / risques`, résultats mesurés, changelog, `module.json` cohérent, ZIP avec **racine `rule-them-all/`**. Ne pas proclamer une stabilité supérieure à ce qui a été réellement testé.

## 6. Limites et dettes identifiées après v0.1.57

- `configurator-entry-editor.mjs` est réduit à un contrôleur de coordination (~447 lignes). Les modèles de champs, sérialiseurs d’entrées, références, étapes de création et AST de règles sont isolés et testés. Les interactions Foundry/DOM restent dans la fenêtre.
- Les catalogues de familles / de types d'entrées et certains champs de présentation demeurent répartis entre plusieurs registres. Leur unicité sémantique doit encore être vérifiée avant toute fusion.
- **Localisation FR/EN :** les templates et générateurs principaux ont été migrés vers les locales ; quelques libellés de diagnostic et d’aide en MJS nécessitent encore un inventaire à l’exécution et ne sont pas certifiés exhaustivement.
- Les sous-types Actor/Item sont désormais issus du système actif ; un système en exposant plusieurs exige un choix explicite. Le mapping de contenu est conservé dans le Ruleset, sans mutation des données historiques.
- Le support de stockage est volontairement limité à `storageVersion:3` ; la lecture d'anciens stockages nécessiterait un véritable migrateur (distinct de la compatibilité d'export).
- Les composants `rta-*` n'ont pas été testés contre **tous les thèmes, modules tiers et macros** qui pourraient s'appuyer sur les sélecteurs antérieurs `rwf-*`.
- Les tests Node et Chromium ne remplacent pas une **recette d'intégration Foundry v14** avec sauvegarde, ouverture, reprise de parties et documents Actor/Item.
- Des styles CSS hérités et générateurs d'interface particuliers peuvent encore présenter des variations non couvertes par les états simulés ; les matrices protègent les cas testés mais ne constituent pas une preuve exhaustive.

## 7. Critère d'acceptation

Une version n'est **candidate** que si code, tests, audit architectural, audit CSS, matrice Chromium et archive vérifiés sont tous disponibles. Elle n'est **validée/stable** qu'après tests d'intégration Foundry v14 et accord explicite du mainteneur. Une suite verte ne permet pas de déclarer que tout le code est devenu propre ni qu'il n'existe plus de dette.

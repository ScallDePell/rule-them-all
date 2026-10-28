# Rule Them'All : guide de l'assistant de Ruleset

*[English version](assistant-guide.md)*

L'assistant construit une règle complète à partir de quelques questions : une liste de caractéristiques, une attaque, un état, un repos, une création de personnage… Ce guide décrit **chaque parcours** de l'assistant et **chaque question** qu'il pose : à quoi elle sert, sa valeur par défaut, quand elle s'affiche, et ce que l'assistant crée avec vos réponses.

Il complète le [guide du MJ](gm-guide.md) (en anglais), qui présente le configurateur et les notions du Ruleset (Définitions, Tests, Actions, Effets…).

## Sommaire

1. [Ouvrir l'assistant](#ouvrir)
2. [Comment ça marche](#fonctionnement)
3. [Les sortes de questions](#questions)
4. [L'aperçu et les erreurs](#apercu)
5. [Les évènements du module](#evenements)
6. [Lire les tableaux des parcours](#tableaux)
7. Les parcours :
- **Bases** : [Caractéristiques](#path-characteristics), [Compétences](#path-skills), [Valeur calculée](#path-derivedValue), [Bornes d'une valeur](#path-bounds), [Ressource](#path-resource), [Jet ou test](#path-test), [Attaque](#path-attack), [État](#path-state), [Coût](#path-cost), [Consommable](#path-consumable), [Niveau et expérience](#path-level), [Encombrement](#path-encumbrance)
- **Systèmes de jeu** : [Avantage et bonus de situation](#path-advantage), [Types de dégâts](#path-damageTypes), [Pouvoir ou sort](#path-power), [Seuil automatique](#path-threshold), [Repos et récupération](#path-rest), [Réagir à un jet du système](#path-systemRoll), [Initiative](#path-initiative), [Création de personnage](#path-creation), [Progression](#path-progression), [Échelle descriptive](#path-scale), [Type de contenu](#path-contentType), [Permissions](#path-permission)
- **Briques** : [Type de définition](#path-definitionType), [Valeur](#path-value), [Paramètre](#path-parameter), [Formule](#path-formula), [Condition](#path-condition), [Jet](#path-roll), [Résultat de test](#path-outcome), [Durée](#path-duration), [Effet](#path-effect), [Action](#path-action), [Compteur](#path-counter), [Déclencheur](#path-trigger), [Table aléatoire](#path-table), [Dé spécial](#path-die)
8. [Pour les autres modules](#modules)
9. [Tenir ce guide à jour](#maintenance)

<a id="ouvrir"></a>
## 1. Ouvrir l'assistant

Ouvrez le configurateur (bouton **Rule Them'All** des réglages du jeu, MJ seulement), choisissez un Ruleset et une version **brouillon**, puis cliquez sur **Assistant**, en haut à gauche de **Importer une partie…**. Sur une version validée, l'assistant montre les parcours mais ne peut rien appliquer : créez une nouvelle version pour la modifier.

La fenêtre a trois zones :

- **à gauche**, la liste des parcours, rangés en trois groupes (Bases, Systèmes de jeu, Briques), avec une recherche par mot (« attaque », « mana », « niveau »…) ; chaque carte prend la couleur de la section du Ruleset qu'elle remplit ;
- **au centre**, le parcours choisi : son titre, ce qu'il fait, ses limites (la ligne ⓘ), puis **Vos réponses** ;
- **en bas**, **Ce que l'assistant va faire** : l'aperçu, et le bouton **Appliquer**.

Un module compagnon peut ajouter son propre panneau en haut de la fenêtre (par exemple un assistant qui remplit les réponses pour vous) ; il ne fait que remplir le formulaire, c'est toujours vous qui appliquez.

<a id="fonctionnement"></a>
## 2. Comment ça marche

1. **Choisissez un parcours** à gauche.
2. **Répondez aux questions.** Elles sont toutes sur une seule page ; certaines n'apparaissent que selon une réponse précédente (colonne « Affichée si » des tableaux). Une question qui attend une entrée du Ruleset (un type, une ressource, un test…) propose les entrées existantes qui conviennent **et** l'option **Créer : …**, qui ouvre sur place les questions du parcours de cette entrée.
3. **Lisez l'aperçu**, mis à jour à chaque réponse : ce qui sera créé, réutilisé, complété, renseigné ou modifié, les erreurs à corriger (sous le nom de la question fautive) et ce qui manquera avant de publier.
4. **Appliquez.** Tout est écrit d'un coup dans le brouillon. Ensuite : ouvrez une entrée créée pour l'ajuster, **Essayer les règles** pour la tester dans le bac à sable, ou **Construire une autre règle**.

Les règles que l'assistant respecte toujours :

- **Il ne supprime jamais rien.** Il crée des entrées, ajoute des éléments aux listes d'une entrée existante (un coût à une Action, une étape à une création, une variante à un Jet) et renseigne des champs encore vides (l'initiative, l'échelle d'une valeur). Un champ déjà renseigné n'est pas remplacé : l'aperçu le signale.
- **Il ne modifie un réglage existant que dans un parcours fait pour cela** : [Bornes d'une valeur](#path-bounds) remplace le minimum ou le maximum d'un type ou de valeurs, et l'aperçu montre « avant → après ».
- **Il réutilise plutôt que de doubler** : une Formule, une Condition, un Jet ou une Durée identiques à une entrée existante sont réutilisés (sauf une Formule ou une Condition à laquelle vous donnez un identifiant ou une description).
- **Il ne crée pas de Contenus** (objets, sorts, origines) : ils se créent dans le configurateur ou par import.
- **Il n'impose aucune règle de jeu** : pas de dé, de difficulté ou de valeur « par défaut » propre à un jeu ; ce que les questions proposent se change.
- Les entrées créées vont dans le **brouillon** : elles ne jouent dans les parties qu'une fois la version **publiée**.

**Noms et identifiants.** Le nom d'une entrée est écrit dans la langue du MJ au moment où il applique ; les noms que l'assistant donne lui-même (« Bonus : Mêlée », « Infliger : Empoisonné ») sont indiqués dans chaque parcours. L'identifiant d'une nouvelle entrée est fabriqué à partir de son nom (« Coup d'épée » → `coup-d-epee`), rendu unique dans tout le Ruleset. Les questions dont l'identifiant est lu par les calculs (questions d'Action, valeurs lues par un Test, champs, étapes de création : « avec identifiant » dans les tableaux) ont en plus une case **Identifiant (facultatif)**.

<a id="questions"></a>
## 3. Les sortes de questions

| Sorte | Comment répondre |
|---|---|
| Nom | Un texte. Avec identifiant : une seconde case pour l'identifiant (lettres, chiffres, `-` et `_`). |
| Texte | Un texte libre. |
| Nombre, Nombre entier | Un nombre, dans les limites indiquées (« au moins 1 »). |
| Oui / non | Une case à cocher. |
| Choix | Une liste d'options ; chaque option est expliquée dans le tableau du parcours. |
| Dés | Une formule de dés Foundry : `1d20`, `3d6`, `2d20kh` (garder le meilleur), `4d6kh3`, `1d8+2`. Les dés peuvent lire le Contenu utilisé (`@content.champ`), les questions de l'Action (`@input.identifiant`) et les dés spéciaux par leur lettre. |
| Formule | Un calcul, construit avec l'éditeur visuel (le même que dans le configurateur). |
| Condition | Un test vrai ou faux, avec le même éditeur. |
| Entrée | Une entrée du Ruleset parmi celles qui conviennent (la colonne « À quoi ça sert » dit lesquelles), ou **Créer : …** pour en créer une avec ses propres questions, affichées sur place. |
| Entrées | Plusieurs entrées existantes, cochées dans une liste. |
| Liste | Des lignes à ajouter (**Ajouter une ligne**) ou retirer (**Retirer la ligne**), chacune avec ses propres questions (les clés `liste.question` des tableaux). Une liste « au moins 1 » commence avec une ligne. |
| Évènement | Un évènement du module (voir [section 5](#evenements)) ou un Type d'évènement du Ruleset. |

Une question **facultative** de sorte Formule ou Condition a une case **Utiliser** : décochée, elle est laissée vide. Une question facultative Entrée a l'option **Aucun**.

**L'éditeur de calcul.** Chaque case d'un calcul est un opérande ou un calcul imbriqué :

- **Valeur littérale** : un nombre, un texte, oui ou non ;
- **Paramètre** : un réglage du Ruleset ([Paramètre](#path-parameter)) ;
- **Formule** : une Formule du Ruleset ;
- **Référence** : une valeur d'une Définition (la valeur finale d'une caractéristique, les points d'une jauge, un état actif), **lue sur** soi, la cible ou un autre rôle ;
- **Valeur du contexte** : une donnée du moment, par exemple `variables.input.<id>` (réponse à une question de l'Action), `variables.test.margin` (total − difficulté), `variables.test.natural` (le dé naturel), `variables.test.outcome.resultKey`, `event.payload.<champ>` (un champ de l'évènement) ;
- **Champ du Contenu** : un champ du Contenu utilisé (les dégâts d'une arme), avec une valeur de repli ;
- **Dés du jet**, **Distance**, **Acteurs à proximité** ;
- **Sorte d'Acteur** : vrai si l'Acteur est joué par un joueur (PJ), est d'un type d'Acteur Foundry ou porte un Type de contenu ;
- **Donnée du système** : une donnée du système de jeu de Foundry (`system.attributes.ac.value` en dnd5e), lue sur un rôle ;
- **Calcul** : une opération sur d'autres cases (+, −, ×, ÷, min, max, somme, moyenne, arrondis, borner, si…alors…sinon, table de plages, table de correspondance, comparaisons, et, ou, non).

<a id="apercu"></a>
## 4. L'aperçu et les erreurs

L'aperçu range ce que fera l'application :

- **Créé** : les nouvelles entrées, avec leur sorte (cliquez pour les ouvrir après application) ;
- **Réutilisé** : les entrées existantes choisies dans vos réponses ;
- **Complété** : les listes d'une entrée existante qui reçoivent des éléments (« Coûts : +1 ») ;
- **Renseigné** : les champs vides qui seront remplis ;
- **Modifié** : les réglages remplacés, « avant → après » (seulement [Bornes d'une valeur](#path-bounds)) ;
- **À corriger** : les erreurs, avec la question concernée ; **Appliquer** reste grisé tant qu'il y en a ;
- **À compléter avant de publier** : ce qui manque aux nouvelles entrées pour que la version puisse être publiée (elles peuvent être appliquées quand même, en brouillon).

Les erreurs possibles :

| Code | Message |
|---|---|
| `MISSING` | Réponse requise |
| `TYPE` | Réponse invalide |
| `RANGE` | Hors des limites |
| `OPTION` | Choix inconnu |
| `DICE` | Formule de dés invalide |
| `FORMULA` | Calcul invalide |
| `NOT_FOUND` | Entrée introuvable |
| `NOT_ACCEPTED` | Cette entrée ne convient pas ici |
| `TOO_MANY` | Trop de lignes |
| `DEPTH` | Trop de niveaux imbriqués |
| `ID_TAKEN` | Identifiant déjà pris |
| `BUILD` | Construction impossible |
| `ADD_TARGET` | Impossible de compléter cette entrée |
| `FILL_TARGET` | Impossible de renseigner ce champ |
| `REPLACE_TARGET` | Impossible de modifier ce réglage |
| `ALREADY_SET` | Déjà renseigné : l'assistant ne remplace rien |
| `INVALID` | Le résultat ne serait pas valide |

Si le Ruleset change entre l'aperçu et l'application (une autre fenêtre, un autre MJ), l'assistant refuse d'écrire et demande de vérifier à nouveau.

<a id="evenements"></a>
## 5. Les évènements du module

Les questions de sorte Évènement proposent ces évènements, puis les Types d'évènement du Ruleset :

| Identifiant | Nom | Champs (`event.payload.<champ>`) |
|---|---|---|
| `rta.combat.start` | Début du combat | `combatId`, `round` |
| `rta.combat.round` | Nouveau round | `combatId`, `round` |
| `rta.combat.turn` | Début de tour | `combatId`, `round`, `turn`, `pass` |
| `rta.combat.end` | Fin du combat | `combatId`, `round` |
| `rta.time.elapsed` | Temps écoulé | `seconds`, `days`, `worldTime` |

<a id="tableaux"></a>
## 6. Lire les tableaux des parcours

Chaque parcours commence par ce qu'il crée et un exemple, puis un tableau de ses questions, dans l'ordre du formulaire :

- **Clé** : l'identifiant de la question, celui qu'utilisent les autres modules et les messages d'erreur ; pour une question d'une liste, `liste.question` ;
- **Question** : le libellé affiché ;
- **Sorte** : la [sorte de question](#questions), « facultative » si on peut la laisser vide, « avec identifiant », et ses limites ;
- **Par défaut** : la réponse déjà remplie (« Nouveau … » : l'option **Créer** est choisie avec ce nom) ;
- **Affichée si** : quand la question apparaît, selon les autres réponses ;
- **À quoi ça sert** : son rôle, et chaque option d'un choix.

## Parcours : Bases

<a id="path-characteristics"></a>
### Caractéristiques (`characteristics`)

**Ce que ça crée :** Une Définition (capacité « nombre ») par caractéristique, dans le type choisi. Avec un modificateur, en plus pour chacune : une Définition « Modificateur : *nom* » dans le type des modificateurs, une Formule du même nom qui calcule le modificateur, et un lien de calcul qui fait de cette Formule la valeur finale du modificateur.

**Exemple :** Force, Dextérité, Constitution… avec **(score − 10) ÷ 2, arrondi en dessous** donne le modificateur à la D&D : 14 → +2, 9 → −1.

| Clé | Question | Sorte | Par défaut | Affichée si | À quoi ça sert |
|---|---|---|---|---|---|
| `type` | Type des caractéristiques | Entrée | Nouveau Type de définition « Caractéristique » | toujours | Le Type de définition qui range les caractéristiques. Choisissez un type existant qui sait porter un nombre, ou laissez « Créer : Type de définition » pour en créer un ici (sa capacité « nombre » est imposée). Les bornes (minimum, maximum) se règlent sur ce type, ou ensuite avec [Bornes d'une valeur](#path-bounds). |
| `items` | Caractéristiques | Liste, au moins 1 | — | toujours | Une ligne par caractéristique. Ajoutez autant de lignes que nécessaire ; l'ordre des lignes est l'ordre des cartes. |
| `items.name` | Nom | Nom | — | toujours | Le nom affiché de la caractéristique. Son identifiant (lu par les Formules) est fabriqué à partir du nom : « Force » donne `force`. |
| `modifier` | Modificateur | Choix | Aucun | toujours | **Aucun** : seulement les scores. **(score − 10) ÷ 2, arrondi en dessous** : un modificateur calculé pour chaque score, (score − 10) ÷ 2 arrondi vers le bas. Pour un autre calcul, créez les caractéristiques sans modificateur puis utilisez [Valeur calculée](#path-derivedValue). |
| `modifierType` | Type des modificateurs | Entrée | Nouveau Type de définition « Modificateur » | Modificateur : (score − 10) ÷ 2, arrondi en dessous | Le Type de définition des modificateurs créés. Par défaut un nouveau type « Modificateur » ; vous pouvez choisir un type existant qui porte un nombre. |

<a id="path-skills"></a>
### Compétences (`skills`)

**Ce que ça crée :** Une Définition (nombre, le rang) par compétence dans le type choisi, et pour chacune une Formule « Bonus : *nom* » qui calcule le bonus de jet. Cette Formule n'est liée à rien : un Test l'utilise quand vous la choisissez comme bonus (question « Bonus ajouté au jet » de [Jet ou test](#path-test)).

**Exemple :** Mêlée liée à Force avec **Caractéristique + rang** : bonus = Force + rang de Mêlée.

| Clé | Question | Sorte | Par défaut | Affichée si | À quoi ça sert |
|---|---|---|---|---|---|
| `type` | Type des compétences | Entrée | Nouveau Type de définition « Compétence » | toujours | Le Type de définition des compétences : un type existant qui porte un nombre, ou un nouveau type créé ici (« Compétence » par défaut). |
| `items` | Compétences | Liste, au moins 1 | — | toujours | Une ligne par compétence. |
| `items.name` | Nom | Nom | — | toujours | Le nom de la compétence ; son identifiant est fabriqué à partir du nom. |
| `items.linked` | Caractéristique liée | Entrée, facultative | — | toujours | La caractéristique (ou toute valeur chiffrée) ajoutée au rang dans le bonus. Laissez vide pour une compétence qui ne dépend d'aucune caractéristique : le bonus est alors le rang seul. |
| `bonus` | Bonus du jet | Choix | Caractéristique + rang | toujours | Comment se calcule le bonus. **Caractéristique + rang** : valeur liée + rang. **Caractéristique + rang × facteur** : valeur liée + rang × « Facteur du rang » (rang × 2 à la Pathfinder, par exemple). **Rang seul** : seulement le rang, même si une caractéristique est liée. |
| `factor` | Facteur du rang | Formule | 1 | Bonus du jet : Caractéristique + rang × facteur | Le multiplicateur du rang. Un nombre ou un calcul complet (un Paramètre, le niveau…), écrit avec l'éditeur de calcul. |

<a id="path-derivedValue"></a>
### Valeur calculée (`derivedValue`)

**Ce que ça crée :** Si la valeur est nouvelle, une Définition (nombre). Puis une Formule avec le calcul (une Formule identique déjà présente est réutilisée) et un lien de calcul qui fait de cette Formule la valeur finale de la Définition : elle se recalcule toute seule.

**Exemple :** Défense = 10 + Agilité ; Initiative = Agilité + Perception.

| Clé | Question | Sorte | Par défaut | Affichée si | À quoi ça sert |
|---|---|---|---|---|---|
| `target` | Valeur | Choix | Une nouvelle valeur | toujours | **Une nouvelle valeur** : l'assistant crée la valeur. **Une valeur existante** : le calcul s'applique à une valeur déjà là (par exemple une caractéristique qui doit se calculer). |
| `name` | Nom | Nom | — | Valeur : Une nouvelle valeur | Le nom de la nouvelle valeur. |
| `type` | Type de la valeur | Entrée | Nouveau Type de définition « Valeur calculée » | Valeur : Une nouvelle valeur | Le Type de définition de la nouvelle valeur : existant (qui porte un nombre) ou créé ici (« Valeur calculée » par défaut). |
| `existing` | Valeur existante | Entrée | — | Valeur : Une valeur existante | La valeur existante qui recevra le calcul. Une valeur qui a déjà un lien de calcul garde son premier calcul : vérifiez dans l'éditeur. |
| `expression` | Calcul | Formule | — | toujours | Le calcul, construit avec l'éditeur visuel : nombres, Paramètres, références à d'autres valeurs (Référence), Formules, opérations (+, −, ×, ÷, min, max, si…). |
| `binding` | Nom du lien de calcul (facultatif) | Nom, facultative | — | toujours | Facultatif : le nom du lien de calcul. Sans nom, le lien prend le nom de la valeur. Utile seulement si vous voulez retrouver ce lien sous un nom précis dans le configurateur. |

<a id="path-bounds"></a>
### Bornes d'une valeur (`bounds`)

**Ce que ça crée :** Rien de nouveau, sauf une Formule « Maximum : *nom* » (ou « Minimum : *nom* ») quand la borne est un calcul. C'est le seul parcours qui **modifie un réglage existant** : il remplace le minimum ou le maximum (`valueBounds`) du type ou des valeurs choisis. L'aperçu le montre en « avant → après ».

**Exemple :** Caractéristiques plafonnées à 5 pour les PJ seulement : **Toutes les valeurs d'un type** « Caractéristique », **Maximum**, « Nouvelle borne » 5, « Seulement quand (sinon la borne actuelle reste) » « Sorte d'Acteur : joué par un joueur (PJ) ». Les PNJ gardent l'ancien maximum.

| Clé | Question | Sorte | Par défaut | Affichée si | À quoi ça sert |
|---|---|---|---|---|---|
| `target` | Ce qui est borné | Choix | Toutes les valeurs d'un type | toujours | **Toutes les valeurs d'un type** : la borne vaut pour toutes les valeurs du type (toutes les caractéristiques). **Certaines valeurs** : seulement les valeurs choisies, qui ont alors leur propre borne, prioritaire sur celle du type. |
| `type` | Type de valeurs | Entrée | — | Ce qui est borné : Toutes les valeurs d'un type | Le Type de définition (qui porte un nombre) dont la borne change. |
| `definitions` | Valeurs | Entrées, au moins 1 | — | Ce qui est borné : Certaines valeurs | Les valeurs (une ou plusieurs) dont la borne change. |
| `bound` | Borne | Choix | Maximum | toujours | **Maximum** ou **Minimum** : la borne remplacée. Pour régler les deux, appliquez le parcours deux fois. |
| `value` | Nouvelle borne | Formule | — | toujours | La nouvelle borne : un nombre, ou un calcul (un Paramètre, le niveau × 2…). Un nombre est écrit tel quel ; un calcul devient une Formule. |
| `when` | Seulement quand (sinon la borne actuelle reste) | Condition, facultative | — | toujours | Facultatif : une Condition. Si elle est donnée, la nouvelle borne ne vaut que quand elle est vraie, et l'ancienne borne (celle de la valeur, sinon celle de son type, sinon aucune) reste pour tous les autres cas. L'opérande « Sorte d'Acteur » permet de viser les PJ, un type d'Acteur ou un Type de contenu. |

<a id="path-resource"></a>
### Ressource (`resource`)

**Ce que ça crée :** Une Définition avec une jauge (capacité « jauge », emplacement `points`) : minimum, maximum, valeur de départ. Quand le maximum est un calcul, une Formule « Maximum : *nom* ».

**Exemple :** Points de vie maximum = 10 + Constitution × 2, entiers, pleins au départ.

| Clé | Question | Sorte | Par défaut | Affichée si | À quoi ça sert |
|---|---|---|---|---|---|
| `name` | Nom | Nom | — | toujours | Le nom de la ressource (Points de vie, Mana, Munitions…). |
| `type` | Type de la ressource | Entrée | Nouveau Type de définition « Ressource » | toujours | Le Type de définition : un type existant qui porte une jauge, ou un nouveau (« Ressource » par défaut). |
| `maximum` | Maximum | Choix | Un nombre | toujours | **Un nombre** : un maximum constant, donné dans la question suivante. **Un calcul** : un maximum calculé (une caractéristique, le niveau…). |
| `maxValue` | Maximum | Nombre | — | Maximum : Un nombre | Le maximum constant. |
| `maxFormula` | Calcul du maximum | Formule | — | Maximum : Un calcul | Le calcul du maximum, avec l'éditeur visuel. |
| `minimum` | Minimum | Nombre | 0 | toujours | La valeur la plus basse de la jauge (0 le plus souvent ; négatif pour des PV qui descendent sous zéro). |
| `initial` | Au départ | Choix | Pleine | toujours | **Pleine** : la jauge commence au maximum (PV). **Vide** : elle commence au minimum (fatigue, stress, corruption). |
| `integer` | Nombres entiers seulement | Oui / non | Oui | toujours | Coché : la jauge ne prend que des nombres entiers. Décochez pour autoriser des décimales. |
| `scale` | Échelle de description (facultative) | Entrée, facultative | — | toujours | Facultatif : une échelle descriptive ([Échelle descriptive](#path-scale)) qui affiche des mots (Indemne, Blessé…) à la place du nombre pour ceux qui ne voient pas la valeur. |
| `description` | Description (facultative) | Texte, facultative | — | toujours | Facultatif : le texte d'aide affiché avec la ressource. |

<a id="path-test"></a>
### Jet ou test (`test`)

**Ce que ça crée :** Un Test, son Jet (un Jet identique déjà présent est réutilisé, sinon un Jet nommé d'après les dés), ses Formules (bonus « Bonus : *nom* », difficulté « Difficulté : *nom* »), ses Résultats (« Réussite », « Échec », « Critique », « Échec critique », nommés « Nom : Réussite »… avec leurs Conditions) et, si demandé, une Action « Lancer : *nom* » qui lance le test depuis la feuille.

**Exemple :** Jet de compétence : 1d20 + « Bonus : Mêlée », difficulté demandée à chaque jet, critique sur 20 naturel, échec critique sur 1.

| Clé | Question | Sorte | Par défaut | Affichée si | À quoi ça sert |
|---|---|---|---|---|---|
| `name` | Nom | Nom | — | toujours | Le nom du test. |
| `roll` | Jet existant (sinon des dés) | Entrée, facultative | — | toujours | Facultatif : un Jet existant (avec ses variantes, par exemple un avantage). Laissez vide pour donner simplement des dés. |
| `dice` | Dés lancés | Dés | — | selon « Jet existant (sinon des dés) » | Les dés lancés, en notation Foundry : `1d20`, `3d6`, `1d100`, `2d6kh1`… Affichée quand aucun « Jet existant (sinon des dés) » n'est choisi. |
| `bonus` | Bonus ajouté au jet | Formule, facultative | — | toujours | Facultatif : un bonus ajouté au total des dés, par exemple la Formule « Bonus : Mêlée » créée par [Compétences](#path-skills), ou une valeur. |
| `target` | Difficulté | Choix | Demandée à chaque jet | toujours | À quoi le total est comparé. **Demandée à chaque jet** : le joueur saisit la difficulté à chaque jet (l'Action reçoit une question « Difficulté »). **Un nombre fixe** : toujours le même nombre. **Un calcul (la défense de la cible…)** : un calcul, souvent une valeur de la cible (sa Défense). **Le jet opposé de la cible** : la cible fait un autre Test et son total sert de difficulté. **Aucune (le total compte seul)** : pas de difficulté, le total compte seul (initiative, dégâts). |
| `targetValue` | Difficulté | Nombre | — | Difficulté : Un nombre fixe | La difficulté fixe. |
| `askedDefault` | Difficulté proposée | Nombre, facultative | — | Difficulté : Demandée à chaque jet | Facultatif : la difficulté proposée dans la question posée au joueur. |
| `targetFormula` | Calcul de la difficulté | Formule | — | Difficulté : Un calcul (la défense de la cible…) | Le calcul de la difficulté. Pour lire une valeur de la cible, utilisez une Référence « lue sur : la cible ». |
| `opposed` | Jet opposé | Entrée | — | Difficulté : Le jet opposé de la cible | Le Test fait par la cible ; il ne doit pas lui-même être opposé. |
| `inputs` | Valeurs lues avant le jet | Liste, facultative | — | toujours | Facultatif : des valeurs que le Test lit avant de lancer les dés, disponibles dans ses calculs sous la Valeur du contexte `variables.test.inputs.<identifiant>`. |
| `inputs.name` | Nom | Nom, avec identifiant | — | toujours | Le nom de la valeur ; l'identifiant, facultatif, est celui que les calculs lisent (sinon fabriqué à partir du nom). |
| `inputs.valueType` | Sorte de valeur | Choix | Nombre | toujours | La sorte de valeur : **Nombre**, **Nombre entier**, **Oui ou non**, **Texte** ou **Une Définition** (une Définition, par exemple la compétence choisie). |
| `inputs.from` | Prise de | Choix | Un calcul | toujours | D'où vient la valeur : **Un calcul**, **Une Définition** (une référence à une Définition) ou **Une valeur fixe** (une valeur fixe). |
| `inputs.formula` | Calcul | Formule | — | Prise de : Un calcul | Le calcul qui donne la valeur ; il devient une Formule. |
| `inputs.definition` | Définition | Entrée | — | Prise de : Une Définition | La Définition passée au Test. |
| `inputs.value` | Valeur | Texte | — | Prise de : Une valeur fixe | La valeur fixe, écrite comme du texte (`3`, `true`, `feu`) et convertie selon « Sorte de valeur ». |
| `inputs.default` | Valeur proposée (facultative) | Texte, facultative | — | Sorte de valeur : Nombre, Nombre entier, Oui ou non ou Texte | Facultatif : la valeur utilisée quand la source ne donne rien. |
| `inputs.required` | Obligatoire | Oui / non | Oui | toujours | Coché : le Test échoue avec un message si la valeur manque. |
| `outcomes` | Résultats existants, dans l'ordre (sinon créés ici) | Entrées, facultative | — | toujours | Facultatif : des Résultats déjà créés (avec [Résultat de test](#path-outcome)), essayés dans l'ordre ; le premier dont la Condition est vraie l'emporte. Si vous en choisissez, l'assistant ne crée pas Réussite / Échec / critiques. |
| `fallback` | Résultat quand aucun ne s'applique | Entrée, facultative | — | selon « Résultats existants, dans l'ordre (sinon créés ici) » | Le Résultat retenu quand aucun des « Résultats existants, dans l'ordre (sinon créés ici) » ne s'applique. Affichée quand des résultats existants sont choisis. |
| `success` | Réussi quand le total est | Choix | Égal ou supérieur à la difficulté | selon « Difficulté » et « Résultats existants, dans l'ordre (sinon créés ici) » | Quand le test réussit, en comparant le total à la difficulté (la marge = total − difficulté) : **Égal ou supérieur à la difficulté**, **Supérieur à la difficulté**, **Égal ou inférieur à la difficulté** (jets sous une compétence, à la Appel de Cthulhu), **Inférieur à la difficulté**. Affichée quand il y a une difficulté et pas de résultats existants. |
| `critical` | Critique sur un dé naturel de | Nombre entier, facultative | — | selon « Résultats existants, dans l'ordre (sinon créés ici) » | Facultatif : la valeur du dé naturel (avant bonus) qui donne une réussite critique, par exemple 20. Le Résultat « Critique » passe avant la réussite. Affichée sans résultats existants. |
| `criticalCompare` | Critique quand le dé fait | Choix | Ce nombre ou plus | selon « Critique sur un dé naturel de » | **Ce nombre ou plus** (19-20 avec 19) ou **Ce nombre ou moins** (jets sous un seuil). Affichée quand « Critique sur un dé naturel de » est rempli. |
| `fumble` | Échec critique sur un dé naturel de | Nombre entier, facultative | — | selon « Résultats existants, dans l'ordre (sinon créés ici) » | Facultatif : la valeur du dé naturel qui donne un échec critique, par exemple 1. |
| `fumbleCompare` | Échec critique quand le dé fait | Choix | Ce nombre ou moins | selon « Échec critique sur un dé naturel de » | **Ce nombre ou moins** (1 avec 1) ou **Ce nombre ou plus** (96-100 avec 96 au d100). |
| `action` | Ajouter un bouton pour lancer ce jet | Oui / non | Oui | toujours | Coché : une Action « Lancer : *nom* » lance ce test depuis la feuille (et pose la question de difficulté si elle est demandée). Décochez pour un test qui ne sert qu'à d'autres règles (une attaque, l'initiative). |
| `description` | Description (facultative) | Texte, facultative | — | toujours | Facultatif : le texte d'aide du test. |

<a id="path-attack"></a>
### Attaque (`attack`)

**Ce que ça crée :** Une Action d'attaque : elle lance le jet pour toucher puis, sur chaque résultat qui touche, un Effet « Dégâts : *nom* » qui retire les dégâts à la ressource de la cible. Les dés de dégâts deviennent un Jet « Dés : *nom* » ; le bonus une Formule ; le doublement sur critique la Formule « Multiplicateur de critique » (2 sur un résultat « critical », sinon 1), qui double le nombre de dés. Si vous créez le jet ici, il n'a pas de bouton à lui.

**Exemple :** Coup d'épée : jet 1d20 + bonus contre la Défense de la cible, dégâts 1d8 + 2 sur la Vitalité, doublés sur un critique.

| Clé | Question | Sorte | Par défaut | Affichée si | À quoi ça sert |
|---|---|---|---|---|---|
| `name` | Nom | Nom | — | toujours | Le nom de l'attaque (le bouton sur la feuille). |
| `test` | Jet pour toucher | Entrée | Nouveau Jet ou test « Attaque » | toujours | Le jet pour toucher : un Test existant, ou un nouveau créé ici avec les questions de [Jet ou test](#path-test) (par défaut une difficulté calculée, sans bouton propre). |
| `hits` | Résultats qui touchent | Entrées, facultative | — | selon « Jet pour toucher » | Facultatif, avec un Test existant : les Résultats qui infligent les dégâts. Vide : tous ses résultats sauf ceux dont la clé est `failure` ou `fumble`. |
| `damage` | Dés de dégâts | Dés | — | toujours | Les dés de dégâts (`1d8`, `2d6`…). Ils peuvent lire le Contenu utilisé (`@content.degats`) et les questions de l'Action (`@input.id`). |
| `damageBonus` | Bonus aux dégâts | Formule, facultative | — | toujours | Facultatif : un bonus ajouté aux dés (la Force, un nombre). |
| `damageTarget` | Ressource qui perd les dégâts | Entrée | — | toujours | La ressource (une jauge) de la cible qui perd les dégâts, par exemple les Points de vie. Vous pouvez la créer ici ([Ressource](#path-resource)). |
| `criticalDouble` | Doubler les dés sur un critique | Oui / non | Oui | toujours | Coché : sur un résultat dont la clé est `critical`, le nombre de dés est doublé (2d8 au lieu de 1d8 ; le bonus n'est pas doublé). |
| `factor` | Facteur de dégâts (résistance…) | Entrée, facultative | — | toujours | Facultatif : une Formule qui multiplie les dégâts après le bonus, arrondi vers le bas : par exemple « Facteur de dégâts : Feu » créé par [Types de dégâts](#path-damageTypes) (0 immunité, ½ résistance, 2 vulnérabilité). |
| `minimum` | Dégâts minimum | Nombre | 0 | toujours | Les dégâts ne descendent jamais sous ce nombre (0 évite qu'un malus soigne). |

<a id="path-state"></a>
### État (`state`)

**Ce que ça crée :** Une Définition « état » (actif ou non). Avec des effets sur des valeurs : une Condition « *nom* actif » et un Modificateur « *nom* : *valeur* » par ligne, qui ne s'applique que tant que l'état est actif, quelle que soit la façon dont il a été infligé. Avec des changements du système : des Active Effects Foundry gérés par le module. Selon les cases : une Action « Infliger : *nom* » (avec une Durée, réutilisée si une Durée identique existe) et une Action « Retirer : *nom* ».

**Exemple :** Empoisonné : 3 rounds, −2 en Force tant qu'il dure, infligé à la cible.

| Clé | Question | Sorte | Par défaut | Affichée si | À quoi ça sert |
|---|---|---|---|---|---|
| `name` | Nom | Nom | — | toujours | Le nom de l'état (Empoisonné, Étourdi, Béni…). |
| `type` | Type de l'état | Entrée | Nouveau Type de définition « État » | toujours | Le Type de définition : un type existant qui porte un état, ou un nouveau (« État » par défaut). |
| `duration` | Durée | Choix | Jusqu'à ce qu'on le retire | toujours | Combien de temps dure l'état quand l'Action « Infliger : *nom* » l'inflige : **Jusqu'à ce qu'on le retire**, **Des rounds**, **Des tours**, **Des minutes**, **Des heures**, **Des jours** (en temps du monde), ou **Jusqu'à un évènement**. |
| `amount` | Combien | Nombre entier, au moins 1 | 1 | Durée : Des rounds, Des tours, Des minutes, Des heures ou Des jours | Le nombre de rounds, tours, minutes, heures ou jours. |
| `event` | Évènement qui le retire | Évènement | — | Durée : Jusqu'à un évènement | L'évènement qui met fin à l'état : un évènement du module (fin du combat…) ou un Type d'évènement du Ruleset. |
| `stacking` | S'il est déjà présent | Choix | Repartir pour toute la durée | toujours | Si l'état est déjà présent quand on l'inflige : **Repartir pour toute la durée** (la durée repart), **Cumuler** (une pile de plus), **Ajouter une copie à part** (une seconde copie avec sa propre durée), **Ne rien faire**. |
| `modifiers` | Effets sur des valeurs tant qu'il dure | Liste, facultative | — | toujours | Facultatif : des valeurs changées tant que l'état est actif. |
| `modifiers.target` | Valeur | Entrée | — | toujours | La valeur chiffrée changée (sa valeur finale). |
| `modifiers.operation` | Changement | Choix | Retirer | toujours | **Retirer**, **Ajouter**, **Multiplier par**, **Fixer à**, **Plafonner à** (la valeur ne dépasse pas ce nombre), **Au moins** (la valeur ne descend pas sous ce nombre). |
| `modifiers.amount` | De combien | Formule | 1 | toujours | Le nombre ou le calcul du changement. |
| `systemChanges` | Changements des données du système tant qu'il dure | Liste, facultative | — | toujours | Facultatif : des données du système de jeu de Foundry (dnd5e, pf2e…) changées tant que l'état est actif, par des Active Effects que le module crée et retire lui-même. |
| `systemChanges.key` | Chemin de la donnée (system.abilities.str.value) | Texte | — | toujours | Le chemin de la donnée dans l'Acteur du système, par exemple `system.abilities.str.value` (Force en dnd5e). Une ligne sans chemin est ignorée. |
| `systemChanges.type` | Mode | Choix | Ajouter | toujours | Le mode de l'Active Effect : **Ajouter**, **Multiplier**, **Remplacer**, **Monter au moins à** (la donnée vaut au moins la valeur), **Descendre au plus à** (au plus la valeur). |
| `systemChanges.value` | Valeur | Texte | — | toujours | La valeur appliquée ; un nombre est enregistré comme nombre, sinon comme texte. |
| `role` | Qui est visé | Choix | La cible | toujours | Qui reçoit et perd l'état avec les Actions créées : **La cible** ou **Soi-même**. |
| `applyAction` | Ajouter un bouton pour l'infliger | Oui / non | Oui | toujours | Coché : une Action « Infliger : *nom* » inflige l'état avec la durée et le cumul choisis. |
| `removeAction` | Ajouter un bouton pour le retirer | Oui / non | Oui | toujours | Coché : une Action « Retirer : *nom* » retire l'état. |
| `description` | Description (facultative) | Texte, facultative | — | toujours | Facultatif : le texte d'aide de l'état. |

<a id="path-cost"></a>
### Coût (`cost`)

**Ce que ça crée :** Un Effet « Dépenser *n* : *nom* » (retire le montant à la ressource de celui qui agit), ajouté aux coûts de l'Action ; si l'Action est refusée faute de ressource, une Condition « Assez de *nom* (*n*) » ajoutée à ses conditions. L'Action existante est complétée, rien de ce qu'elle fait n'est changé.

**Exemple :** Tir à l'arc qui coûte 1 Munition, refusé quand le carquois est vide.

| Clé | Question | Sorte | Par défaut | Affichée si | À quoi ça sert |
|---|---|---|---|---|---|
| `action` | Action qui coûte | Entrée | — | toujours | L'Action qui coûte : une Action existante, ou une nouvelle créée ici avec [Action](#path-action). |
| `resource` | Ressource dépensée | Entrée | — | toujours | La ressource (une jauge) dépensée par celui qui agit : existante ou créée ici avec [Ressource](#path-resource). |
| `amount` | Combien | Nombre, au moins 0 | 1 | toujours | La quantité dépensée à chaque usage. |
| `required` | Refuser l'Action s'il n'en reste pas assez | Oui / non | Oui | toujours | Coché : l'Action n'est pas possible quand la ressource est sous le montant. Décoché : elle reste possible et la ressource descend jusqu'à son minimum. |

<a id="path-consumable"></a>
### Consommable (`consumable`)

**Ce que ça crée :** Une Définition à jauge (emplacement `doses`, de 0 au nombre de doses, pleine au départ), une Condition « Reste une dose : *nom* », un Effet « Une dose : *nom* » (−1 dose), un Effet « Effet : *nom* » sur la valeur choisie, et une Action « Utiliser : *nom* » qui réunit tout : possible seulement s'il reste une dose, elle retire une dose et produit l'effet sur celui qui l'utilise.

**Exemple :** Potion de soin, 3 doses : chaque usage ajoute 2d4 + 2 aux Points de vie.

| Clé | Question | Sorte | Par défaut | Affichée si | À quoi ça sert |
|---|---|---|---|---|---|
| `name` | Nom | Nom | — | toujours | Le nom du consommable. |
| `type` | Type du consommable | Entrée | Nouveau Type de définition « Consommable » | toujours | Le Type de définition : un type existant qui porte une jauge, ou un nouveau (« Consommable » par défaut). |
| `doses` | Doses | Nombre entier, au moins 1 | — | toujours | Le nombre de doses (ou charges) au départ, qui est aussi le maximum. |
| `effectTarget` | Valeur changée par l'usage | Entrée | — | toujours | La valeur changée par l'usage, sur celui qui l'utilise : une jauge (ses points), une valeur (sa base) ; vous pouvez créer une ressource ici. |
| `operation` | Changement | Choix | Ajouter | toujours | **Ajouter** (soin, recharge), **Retirer**, ou **Fixer à**. |
| `amount` | De combien | Formule | — | toujours | Le montant : un nombre ou un calcul. Pour des dés, utilisez l'opérande « Dés du jet » de l'éditeur de calcul ou un Effet créé avec [Effet](#path-effect). |

<a id="path-level"></a>
### Niveau et expérience (`level`)

**Ce que ça crée :** Une Définition niveau (nombre) dont la valeur finale est calculée par une Formule à partir de l'expérience (lien de calcul). Si l'expérience est créée ici, une Définition « Expérience ». Avec le bouton : un Effet et une Action « Gagner : *nom* » qui demande un montant (« Montant ») et l'ajoute à l'expérience.

**Exemple :** Un niveau tous les 1000 XP : 0-999 → niveau 1, 1000-1999 → niveau 2… Ou une table 0 → 1, 300 → 2, 900 → 3.

| Clé | Question | Sorte | Par défaut | Affichée si | À quoi ça sert |
|---|---|---|---|---|---|
| `name` | Nom | Nom | Niveau | toujours | Le nom du niveau (« Niveau » par défaut). |
| `type` | Type du niveau | Entrée | Nouveau Type de définition « Progression » | toujours | Le Type de définition du niveau : existant (qui porte un nombre) ou créé ici (« Progression » par défaut). |
| `experience` | Expérience | Entrée | Nouveau Valeur « Expérience » | toujours | La valeur d'expérience qui fait monter le niveau : existante ou créée ici (« Expérience » par défaut, avec [Valeur](#path-value)). |
| `rule` | Règle | Choix | Un niveau tous les N points | toujours | **Un niveau tous les N points** : niveau = arrondi bas (XP ÷ N) + 1. **Une table de seuils** : le plus haut seuil atteint donne le niveau. |
| `perLevel` | Points par niveau | Nombre, au moins 1 | — | Règle : Un niveau tous les N points | Les points d'expérience par niveau (N). |
| `thresholds` | Seuils | Liste, au moins 1 | — | Règle : Une table de seuils | Les seuils de la table, une ligne par niveau, dans n'importe quel ordre. |
| `thresholds.level` | Niveau | Nombre entier | — | toujours | Le niveau atteint. |
| `thresholds.experience` | Expérience requise | Nombre | — | toujours | L'expérience requise pour ce niveau. En dessous du plus petit seuil, le niveau est celui du plus petit seuil. |
| `award` | Ajouter un bouton pour donner de l'expérience | Oui / non | Oui | toujours | Coché : une Action « Gagner : *nom* » pour donner de l'expérience depuis la feuille. |

<a id="path-encumbrance"></a>
### Encombrement (`encumbrance`)

**Ce que ça crée :** Une Formule « Capacité de charge » et une Condition (nommée « Surchargé » par défaut) vraie quand la charge dépasse strictement la capacité. Si la charge est créée ici, une Définition « Charge ». Les malus viennent ensuite : un [État](#path-state), un [Avantage et bonus de situation](#path-advantage) ou des Modificateurs qui utilisent cette Condition.

**Exemple :** Surchargé quand la Charge dépasse Force × 5.

| Clé | Question | Sorte | Par défaut | Affichée si | À quoi ça sert |
|---|---|---|---|---|---|
| `name` | Nom | Nom | Surchargé | toujours | Le nom de la Condition. |
| `load` | Charge portée | Entrée | Nouveau Valeur « Charge » | toujours | La valeur qui mesure ce qui est porté : existante ou créée ici (« Charge » par défaut). |
| `capacity` | Calcul de la capacité | Formule | — | toujours | Le calcul de la capacité de charge (Force × 5, un Paramètre…). |

## Parcours : Systèmes de jeu

<a id="path-advantage"></a>
### Avantage et bonus de situation (`advantage`)

**Ce que ça crée :** Rien de nouveau, sauf parfois un Jet. Pour **Avantage (autres dés)** ou **Désavantage (autres dés)**, une variante est ajoutée au Jet de chaque test : tant que la Condition est vraie, ce Jet lance les autres dés (attention, un Jet partagé par d'autres tests change pour eux aussi). Pour **Un dé en plus**, **Un bonus fixe** ou **Un malus fixe**, chaque test reçoit un « jet en plus » ajouté au total (ou retiré pour un malus) tant que la Condition est vraie.

**Exemple :** Avantage à la D&D : quand « Caché » est vrai, le jet d'attaque lance `2d20kh` au lieu de `1d20`. Bonus de situation : +2 quand la cible est à terre.

| Clé | Question | Sorte | Par défaut | Affichée si | À quoi ça sert |
|---|---|---|---|---|---|
| `tests` | Jets concernés | Entrées, au moins 1 | — | toujours | Les tests concernés (au moins un). |
| `when` | Quand | Entrée | — | toujours | La Condition qui déclenche l'effet : existante ou créée ici avec [Condition](#path-condition). |
| `effect` | Effet | Choix | Avantage (autres dés) | toujours | **Avantage (autres dés)** et **Désavantage (autres dés)** : d'autres dés à la place des dés de base (vous écrivez lesquels). **Un dé en plus** : un dé ajouté au total (`1d4` d'une inspiration). **Un bonus fixe** / **Un malus fixe** : un nombre ajouté ou retiré. |
| `dice` | Dés lancés à la place | Dés | — | Effet : Avantage (autres dés) ou Désavantage (autres dés) | Les dés lancés à la place quand la Condition est vraie, par exemple `2d20kh` (garder le meilleur) pour un avantage, `2d20kl` pour un désavantage. |
| `extraDice` | Dé ajouté | Dés | — | Effet : Un dé en plus | Le dé ajouté au total, par exemple `1d6`. |
| `amount` | Valeur | Nombre entier, au moins 1 | — | Effet : Un bonus fixe ou Un malus fixe | Le bonus ou le malus, un nombre entier positif (le sens vient de « Effet »). |

<a id="path-damageTypes"></a>
### Types de dégâts (`damageTypes`)

**Ce que ça crée :** Pour chaque type de dégâts, les états cochés (« Immunité : *nom* », « Résistance : *nom* », « Vulnérabilité : *nom* ») dans le type choisi, et une Formule « Facteur de dégâts : *nom* » lue sur la cible : 0 si elle est immunisée, ½ si elle résiste (sans être vulnérable), 2 si elle est vulnérable (sans résister), sinon 1. Une attaque applique ce facteur en le choisissant comme « Facteur de dégâts (résistance…) » ([Attaque](#path-attack)).

**Exemple :** Feu, Froid, Poison : un monstre « Résistance : Feu » ne prend que la moitié des dégâts d'une attaque de feu.

| Clé | Question | Sorte | Par défaut | Affichée si | À quoi ça sert |
|---|---|---|---|---|---|
| `type` | Type des résistances | Entrée | Nouveau Type de définition « Résistance aux dégâts » | toujours | Le Type de définition des états créés : existant (qui porte un état) ou nouveau (« Résistance aux dégâts » par défaut). |
| `types` | Types de dégâts | Liste, au moins 1 | — | toujours | Une ligne par type de dégâts. |
| `types.name` | Nom | Nom | — | toujours | Le nom du type de dégâts (Feu, Froid…). |
| `immunity` | Immunité (aucun dégât) | Oui / non | Oui | toujours | Coché : crée l'état « Immunité : *nom* » (facteur 0). |
| `resistance` | Résistance (moitié) | Oui / non | Oui | toujours | Coché : crée l'état « Résistance : *nom* » (facteur ½, arrondi vers le bas). |
| `vulnerability` | Vulnérabilité (double) | Oui / non | Oui | toujours | Coché : crée l'état « Vulnérabilité : *nom* » (facteur 2). Résistance et vulnérabilité ensemble s'annulent. |

<a id="path-power"></a>
### Pouvoir ou sort (`power`)

**Ce que ça crée :** Une Action nommée d'après le pouvoir. Selon « Comment il agit » : un Effet « Effet : *nom* » (dés lancés sur la ressource visée), pour un jet de sauvegarde un Effet « Moitié : *nom* » (moitié, Formule « Moitié »), ou l'application d'un état avec sa Durée. Avec un niveau au choix, une question « Niveau » posée à l'usage, lue dans les dés par `@input.level`. Avec un coût, un Effet « Dépenser *n* : *nom* » et une Condition « Assez de *nom* (*n*) ».

**Exemple :** Boule de feu : jet de sauvegarde, 8d6 sur les Points de vie de la cible, moitié sur un échec, 1 emplacement de sort dépensé, lancée au niveau 3 à 9 (`(@input.level + 5)d6`).

| Clé | Question | Sorte | Par défaut | Affichée si | À quoi ça sert |
|---|---|---|---|---|---|
| `name` | Nom | Nom | — | toujours | Le nom du pouvoir (le bouton sur la feuille). |
| `resolution` | Comment il agit | Choix | Jet d'attaque | toujours | Comment le pouvoir agit. **Jet d'attaque** : un Test, les dés de l'effet sur les résultats qui touchent, doublés sur un critique. **Jet de sauvegarde de la cible** : un Test du point de vue du pouvoir (sa réussite veut dire que la cible subit tout), l'effet complet sur ses résultats qui touchent, la moitié sinon si « Moitié des dégâts sur un échec » est coché. **Dégâts automatiques** : les dégâts sans jet. **Soin** : les dés ajoutés à la ressource. **Inflige un état** : un état infligé. **Autre (sans effet chiffré)** : aucun effet chiffré (une Action à compléter dans l'éditeur). |
| `test` | Jet | Entrée | — | Comment il agit : Jet d'attaque ou Jet de sauvegarde de la cible | Le Test (attaque ou sauvegarde) : existant ou créé ici avec [Jet ou test](#path-test). |
| `hits` | Résultats qui touchent | Entrées, facultative | — | selon « Comment il agit » et « Jet » | Facultatif, avec un Test existant : les Résultats qui donnent l'effet complet. Vide : tous sauf `failure` et `fumble`. |
| `dice` | Dés de l'effet | Dés | — | Comment il agit : Jet d'attaque, Jet de sauvegarde de la cible, Dégâts automatiques ou Soin | Les dés de l'effet (`8d6`, `1d8 + 3`). Ils peuvent lire le niveau choisi (`@input.level`) et le Contenu utilisé (`@content.champ`). |
| `target` | Ressource touchée | Entrée | — | Comment il agit : Jet d'attaque, Jet de sauvegarde de la cible, Dégâts automatiques ou Soin | La ressource (jauge) touchée : existante ou créée ici avec [Ressource](#path-resource). |
| `halfOnMiss` | Moitié des dégâts sur un échec | Oui / non | Oui | Comment il agit : Jet de sauvegarde de la cible | Coché : sur un résultat qui ne touche pas, la moitié des dés (arrondie vers le bas). |
| `state` | État infligé | Entrée | — | Comment il agit : Inflige un état | L'état infligé : existant ou créé ici avec [État](#path-state). |
| `duration` | Durée | Choix | Des rounds | Comment il agit : Inflige un état | La durée de l'état : **Jusqu'à ce qu'on le retire**, **Des rounds**, **Des tours**, **Des minutes**, **Des heures**, **Des jours** ou **Jusqu'à un évènement**. Une Durée identique déjà présente est réutilisée. |
| `amount` | Combien | Nombre entier, au moins 1 | 1 | Comment il agit : Inflige un état et Durée : Des rounds, Des tours, Des minutes, Des heures ou Des jours | Le nombre de rounds, tours, minutes, heures ou jours. |
| `event` | Évènement qui le retire | Évènement | — | Comment il agit : Inflige un état et Durée : Jusqu'à un évènement | L'évènement qui met fin à l'état. |
| `role` | Qui est visé | Choix | La cible | toujours | Qui est visé par l'effet ou l'état : **La cible** ou **Soi-même** (un soin sur soi, une bénédiction personnelle). |
| `levels` | Lancé à un niveau choisi | Oui / non | Non | toujours | Coché : le joueur choisit le niveau auquel il lance le pouvoir (une liste de « Niveau le plus bas » à « Niveau le plus haut »). |
| `levelMin` | Niveau le plus bas | Nombre entier | 1 | Lancé à un niveau choisi : Oui | Le niveau le plus bas proposé (et proposé par défaut). |
| `levelMax` | Niveau le plus haut | Nombre entier | — | Lancé à un niveau choisi : Oui | Le niveau le plus haut proposé. |
| `cost` | Ressource dépensée | Entrée, facultative | — | toujours | Facultatif : la ressource dépensée par celui qui lance (mana, emplacements) ; existante ou créée ici. Le pouvoir est refusé s'il n'en reste pas assez. |
| `costAmount` | Coût | Nombre, au moins 0 | 1 | selon « Ressource dépensée » | La quantité dépensée à chaque lancement. |

<a id="path-threshold"></a>
### Seuil automatique (`threshold`)

**Ce que ça crée :** Une Condition (le seuil atteint), une Action « Infliger : *nom* » qui inflige l'état à celui qui franchit le seuil (sans cumul), avec le retrait une Condition « Fin : *nom* » et une Action « Retirer : *nom* », et un Déclencheur « Vérifier : *nom* » qui lance ces Actions à l'évènement choisi. Avec « Compter comme hors de combat pour l'initiative », la Condition est enregistrée comme « hors de combat » de l'initiative.

**Exemple :** Inconscient quand la Vitalité est au plus 0, vérifié à chaque début de tour, retiré quand elle remonte.

| Clé | Question | Sorte | Par défaut | Affichée si | À quoi ça sert |
|---|---|---|---|---|---|
| `name` | Nom | Nom | — | toujours | Le nom de la Condition du seuil. |
| `watched` | Valeur surveillée | Entrée | — | toujours | La valeur surveillée : une jauge (ses points), une valeur (sa valeur finale) ou un état (actif ou non). |
| `compare` | Quand elle est | Choix | Au plus | toujours | Le sens du seuil : **Au plus**, **Moins de**, **Au moins**, **Plus de**, **Égal à**. |
| `limit` | Seuil | Nombre | 0 | toujours | Le nombre auquel la valeur surveillée est comparée. |
| `state` | État infligé | Entrée | — | toujours | L'état infligé quand le seuil est atteint : existant ou créé ici avec [État](#path-state). |
| `event` | Vérifier à | Évènement | `rta.combat.turn` | toujours | Quand le seuil est vérifié : `rta.combat.turn` (début de tour) par défaut, ou un autre évènement du module ou du Ruleset. |
| `remove` | Retirer l'état quand le seuil n'est plus atteint | Oui / non | Oui | toujours | Coché : l'état est retiré, à la même vérification, quand le seuil n'est plus atteint. |
| `defeated` | Compter comme hors de combat pour l'initiative | Oui / non | Non | toujours | Coché : la Condition devient le « hors de combat » de l'initiative : le combattant est marqué vaincu dans le suivi de combat tant qu'elle est vraie. Il faut une initiative déjà réglée ([Initiative](#path-initiative)) dont « hors de combat » est encore vide ; sinon l'aperçu signale l'erreur. |

<a id="path-rest"></a>
### Repos et récupération (`rest`)

**Ce que ça crée :** Un Effet « Récupérer : *nom* » par ressource récupérée (sur celui qui se repose) et le retrait des états choisis, dans une nouvelle Action (« Repos » par défaut) ou ajoutés à une Action de repos existante. Avec « Aussi chaque jour de jeu, tout seul » : un Déclencheur « Chaque jour : *nom* » sur le temps qui passe (`rta.time.elapsed`) et une Condition « Un jour est passé », qui lancent le repos chaque fois qu'au moins un minuit passe dans le monde.

**Exemple :** Repos long : Points de vie au maximum, Fatigue remise à 0, état Épuisé effacé, chaque jour de jeu.

| Clé | Question | Sorte | Par défaut | Affichée si | À quoi ça sert |
|---|---|---|---|---|---|
| `mode` | Repos | Choix | Un nouveau repos | toujours | **Un nouveau repos** : crée l'Action de repos. **Compléter un repos existant** : ajoute des récupérations et des états effacés à une Action déjà là, sans rien changer d'autre. |
| `name` | Nom | Nom | Repos | Repos : Un nouveau repos | Le nom du nouveau repos. |
| `action` | Repos existant | Entrée | — | Repos : Compléter un repos existant | L'Action de repos à compléter. |
| `resources` | Ce qui est récupéré | Liste, au moins 1 | — | toujours | Une ligne par valeur récupérée. |
| `resources.resource` | Ressource | Entrée | — | toujours | La valeur récupérée : une jauge ou une valeur. |
| `resources.recovery` | Récupération | Choix | Tout | toujours | **Tout** : la jauge revient à son maximum (seulement une jauge). **Un nombre** : ajoute un nombre. **Un calcul** : ajoute un calcul (niveau + Constitution). **Remettre à** : fixe la valeur (la fatigue à 0). |
| `resources.amount` | Combien | Nombre | 1 | Récupération : Un nombre | Le nombre ajouté. |
| `resources.expression` | Calcul | Formule | — | Récupération : Un calcul | Le calcul ajouté. |
| `resources.resetTo` | Valeur | Nombre | 0 | Récupération : Remettre à | La valeur fixée. |
| `clearStates` | États effacés | Entrées, facultative | — | toujours | Facultatif : les états retirés par le repos. |
| `daily` | Aussi chaque jour de jeu, tout seul | Oui / non | Non | toujours | Coché : le repos se fait aussi tout seul chaque jour de jeu (quand l'heure du monde passe minuit). |

<a id="path-systemRoll"></a>
### Réagir à un jet du système (`systemRoll`)

**Ce que ça crée :** Un Type d'évènement qui suit un hook Foundry du système de jeu (ses champs `total` et `item` quand leurs chemins sont donnés), une Condition « *nom* : réussi » (seulement pour l'objet nommé, seulement si le total atteint la marque) et un Déclencheur « Sur *nom* » qui lance les Actions, automatiquement, pour l'Acteur qui agit. Les cibles du joueur dans Foundry deviennent les cibles des Actions.

**Exemple :** Une arme dnd5e « Lame de vampire » qui inflige « Affaibli » quand elle touche : hook `dnd5e.rollAttack`, Acteur `1.subject`, total `0.0.total`, objet `1.subject.item`, objet nommé « Lame de vampire », total ≥ la CA de la cible (Donnée du système `system.attributes.ac.value` lue sur la cible), Action « Infliger : Affaibli ».

| Clé | Question | Sorte | Par défaut | Affichée si | À quoi ça sert |
|---|---|---|---|---|---|
| `name` | Nom de l'évènement | Nom | Jet du système | toujours | Le nom du Type d'évènement (« Jet du système » par défaut). |
| `hook` | Hook Foundry (dnd5e.rollAttack) | Texte | — | toujours | Le nom du hook Foundry écouté, tel que le système le déclare : `dnd5e.rollAttack`, `dnd5e.rollDamage`, `pf2e…`. Voir la documentation du système. |
| `who` | Entendu sur | Choix | Le client où il arrive (les jets) | toujours | **Le client où il arrive (les jets)** : l'évènement part du client où le hook arrive (celui du joueur qui lance). **Le client du MJ actif seulement** : seulement depuis le client du MJ actif (pour un hook qui arrive sur tous les clients). |
| `selfPath` | Acteur qui agit, chemin (1.subject) | Texte, facultative | — | toujours | Facultatif : où lire l'Acteur qui agit dans les arguments du hook, numérotés depuis 0. Pour `dnd5e.rollAttack` : `1.subject`. Vide : l'Acteur n'est pas connu et le Déclencheur ne s'applique à personne. |
| `totalPath` | Total du jet, chemin (0.0.total) | Texte, facultative | — | toujours | Facultatif : où lire le total du jet, par exemple `0.0.total` (premier argument, premier jet, total). Remplir pour pouvoir donner « Seulement si le total atteint (la CA de la cible : Donnée du système) ». |
| `itemPath` | Objet utilisé, chemin (1.subject.item) | Texte, facultative | — | toujours | Facultatif : où lire l'objet utilisé, par exemple `1.subject.item`. Le module en garde le nom. Remplir pour pouvoir donner « Seulement pour l'objet nommé ». |
| `item` | Seulement pour l'objet nommé | Texte, facultative | — | selon « Objet utilisé, chemin (1.subject.item) » | Facultatif : le Déclencheur ne vaut que pour l'objet de ce nom (exactement). |
| `reach` | Seulement si le total atteint (la CA de la cible : Donnée du système) | Formule, facultative | — | selon « Total du jet, chemin (0.0.total) » | Facultatif : le Déclencheur ne vaut que si le total est au moins ce calcul, par exemple la classe d'armure de la cible avec l'opérande « Donnée du système » lu sur la cible. |
| `actions` | Actions lancées | Entrées, au moins 1 | — | toujours | Les Actions lancées (au moins une), par exemple « Infliger : Affaibli » créée avec [État](#path-state). |
| `description` | Description (facultative) | Texte, facultative | — | toujours | Facultatif : le texte d'aide du Type d'évènement. |

<a id="path-initiative"></a>
### Initiative (`initiative`)

**Ce que ça crée :** Rien dans les listes : le parcours renseigne l'initiative du Ruleset (formulaire du Ruleset, bloc « Combat et ressources partagées »), seulement si elle est encore vide. Avec un départage ou des passes, des Formules « Départage d'initiative » et « Passes d'initiative ». Pour changer une initiative existante, passez par le formulaire du Ruleset.

**Exemple :** Initiative 1d20 + Agilité, départage par la Perception, relancée chaque round.

| Clé | Question | Sorte | Par défaut | Affichée si | À quoi ça sert |
|---|---|---|---|---|---|
| `test` | Jet d'initiative | Entrée | Nouveau Jet ou test « Initiative » | toujours | Le Test dont le total donne l'initiative : existant, ou créé ici (« Initiative » sans difficulté et sans bouton, par défaut). |
| `eachRound` | Relancer à chaque round | Oui / non | Non | toujours | Coché : l'initiative est relancée au début de chaque round. |
| `tieBreak` | Départage des égalités | Formule, facultative | — | toujours | Facultatif : un calcul qui départage les égalités (le plus haut joue d'abord). |
| `passes` | Nombre de passes par round | Formule, facultative | — | toujours | Facultatif : le nombre de passes de chaque combattant par round (autant de passes que d'attaques, par exemple). L'évènement « Début de tour » donne la passe en cours dans `event.payload.pass`. Les passes « tant qu'au-dessus d'un seuil » (Shadowrun) se règlent dans le formulaire du Ruleset. |
| `defeated` | Hors de combat quand | Entrée, facultative | — | toujours | Facultatif : la Condition qui met un combattant hors de combat : tant qu'elle est vraie pour son Acteur, il est marqué vaincu dans le suivi de combat (avec le statut sur son jeton). Existante ou créée ici. |
| `bySide` | Jouer par camp | Oui / non | Non | toujours | Coché : un seul jet par camp ; tous les combattants d'un camp prennent le résultat du premier qui lance. |

<a id="path-creation"></a>
### Création de personnage (`creation`)

**Ce que ça crée :** Un Système de création (« Création de personnage » par défaut) avec ses étapes, ou de nouvelles étapes ajoutées à la fin d'une création existante. Les minimums et maximums calculés deviennent des Formules « Minimum : *nom* », « Maximum : *nom* », « Maximum par valeur : *nom* ». Les Contenus (origines, classes…) doivent déjà exister : ils se créent dans le configurateur ou par import.

**Exemple :** Choisir une Origine, puis ses choix, puis répartir 10 points entre les caractéristiques (au plus 3 par caractéristique), puis vérification.

| Clé | Question | Sorte | Par défaut | Affichée si | À quoi ça sert |
|---|---|---|---|---|---|
| `mode` | Création | Choix | Une nouvelle création | toujours | **Une nouvelle création** : une nouvelle création. **Ajouter des étapes à une création** : ajoute des étapes à la fin d'une création déjà là, sans toucher aux autres. |
| `name` | Nom | Nom | Création de personnage | Création : Une nouvelle création | Le nom de la nouvelle création. |
| `system` | Création existante | Entrée | — | Création : Ajouter des étapes à une création | La création à compléter. |
| `steps` | Étapes | Liste, au moins 1 | — | toujours | Une ligne par étape, dans l'ordre où le joueur les suit. |
| `steps.kind` | Sorte d'étape | Choix | Choisir des contenus | toujours | **Choisir des contenus** : prendre des Contenus parmi ceux proposés (une origine, une classe). **Choix des contenus pris avant** : faire les choix propres aux Contenus pris aux étapes précédentes (sorts d'une classe, compétences d'une origine). **Répartir des points** : répartir des points entre des valeurs. **Choisir des valeurs** : choisir des valeurs dans une liste. **Vérification finale** : vérification finale avant de créer le personnage. |
| `steps.name` | Nom | Nom, avec identifiant | — | toujours | Le nom de l'étape ; l'identifiant, facultatif, est fabriqué à partir du nom. |
| `steps.templates` | Contenus proposés | Entrées, au moins 1 | — | Sorte d'étape : Choisir des contenus | Les Contenus proposés à cette étape (au moins un). |
| `steps.definitions` | Valeurs | Entrées, au moins 1 | — | Sorte d'étape : Répartir des points ou Choisir des valeurs | Les valeurs proposées ou qui reçoivent les points (au moins une). |
| `steps.min` | Au moins | Nombre entier, au moins 0 | 1 | Sorte d'étape : Choisir des contenus, Répartir des points ou Choisir des valeurs | Le minimum : nombre de Contenus ou valeurs à prendre, ou de points à répartir. |
| `steps.max` | Au plus | Nombre entier, au moins 0 | 1 | Sorte d'étape : Choisir des contenus, Répartir des points ou Choisir des valeurs | Le maximum, au même sens. |
| `steps.minFormula` | Minimum calculé (facultatif) | Formule, facultative | — | Sorte d'étape : Choisir des contenus, Répartir des points ou Choisir des valeurs | Facultatif : un minimum calculé, qui remplace le nombre (selon le niveau, l'Intelligence…). |
| `steps.maxFormula` | Maximum calculé (facultatif) | Formule, facultative | — | Sorte d'étape : Choisir des contenus, Répartir des points ou Choisir des valeurs | Facultatif : un maximum calculé, qui remplace le nombre. |
| `steps.perTargetMax` | Au plus par valeur | Nombre entier, facultative, au moins 0 | — | Sorte d'étape : Répartir des points | Facultatif : les points au plus sur une même valeur. |
| `steps.perTargetMaxFormula` | Maximum par valeur, calculé (facultatif) | Formule, facultative | — | Sorte d'étape : Répartir des points | Facultatif : ce maximum par valeur, calculé. |
| `steps.optionCondition` | Options proposées seulement si (facultatif) | Entrée, facultative | — | Sorte d'étape : Choisir des contenus ou Choisir des valeurs | Facultatif : une Condition ; seules les options pour lesquelles elle est vraie sont proposées (les sorts de la classe choisie). |
| `steps.choicesLater` | Les choix de ces Contenus se font à une étape suivante | Oui / non | Oui | Sorte d'étape : Choisir des contenus | Coché : les choix propres à ces Contenus se feront à une étape **Choix des contenus pris avant** plus loin. Décoché : ils se font dans cette étape. |
| `steps.required` | Obligatoire | Oui / non | Oui | Sorte d'étape : Choisir des contenus, Répartir des points ou Choisir des valeurs | Coché : le joueur ne peut pas passer l'étape sans atteindre le minimum. |
| `description` | Description (facultative) | Texte, facultative | — | toujours | Facultatif : le texte d'aide de la création. |

<a id="path-progression"></a>
### Progression (`progression`)

**Ce que ça crée :** Un Système de progression (« Progression » par défaut), ou de nouvelles entrées ajoutées à une progression existante. **Acheter des rangs** : une progression « Progresser : *nom* » par valeur, avec la Formule de coût « Coût de progression » (et « Rang maximum de progression »). **Paliers de niveau** : un palier par ligne, avec une Condition « Niveau *n* » (niveau ≥ N).

**Exemple :** Acheter des rangs de compétence avec l'XP : rang 1 = 1 XP, rang 2 = 2 XP, rang 3 = 4 XP. Ou : au niveau 5, donner « Attaque supplémentaire ».

| Clé | Question | Sorte | Par défaut | Affichée si | À quoi ça sert |
|---|---|---|---|---|---|
| `system` | Compléter une progression existante | Entrée, facultative | — | toujours | Facultatif : une progression existante à compléter. Vide : une nouvelle progression. |
| `name` | Nom | Nom | Progression | selon « Compléter une progression existante » | Le nom de la nouvelle progression. Affichée quand aucune progression existante n'est choisie. |
| `mode` | Sorte de progression | Choix | Acheter des rangs | toujours | **Acheter des rangs** : dépenser une monnaie (XP, points de pratique) pour monter des valeurs d'un rang. **Paliers de niveau** : à certains niveaux, donner des choses ou lancer une Action. |
| `values` | Valeurs qui progressent | Liste, au moins 1 | — | Sorte de progression : Acheter des rangs | Une ligne par valeur qui progresse. |
| `values.value` | Valeur | Entrée | — | toujours | La valeur achetée rang par rang. |
| `values.currency` | Payée avec (si autre) | Entrée, facultative | — | toujours | Facultatif : une monnaie propre à cette valeur ; sinon celle de « Payée avec ». |
| `currency` | Payée avec | Entrée, facultative | — | Sorte de progression : Acheter des rangs | La monnaie payée : une jauge (ses points) ou une valeur (sa base), dépensée par le personnage. Chaque valeur doit avoir une monnaie, ici ou sur sa ligne. |
| `cost` | Coût d'un rang | Choix | Un tableau par rang | Sorte de progression : Acheter des rangs | **Un tableau par rang** : un coût par rang visé. **Un calcul** : un calcul qui lit le rang visé (Valeur du contexte `variables.advance.next`). |
| `costs` | Coût de chaque rang | Liste, au moins 1 | — | Sorte de progression : Acheter des rangs et Coût d'un rang : Un tableau par rang | La table des coûts, une ligne par rang. Un rang absent de la table ne peut pas être acheté. |
| `costs.level` | Rang | Nombre entier | — | toujours | Le rang visé. |
| `costs.cost` | Coût | Nombre, au moins 0 | — | toujours | Ce que coûte ce rang, retiré de la monnaie. |
| `costFormula` | Calcul du coût (lit le rang visé) | Formule | — | Sorte de progression : Acheter des rangs et Coût d'un rang : Un calcul | Le calcul du coût, qui lit le rang visé. |
| `maximum` | Rang maximum (facultatif) | Formule, facultative | — | Sorte de progression : Acheter des rangs | Facultatif : le rang le plus haut qu'on peut acheter (un nombre ou un calcul). |
| `level` | Niveau | Entrée | — | Sorte de progression : Paliers de niveau | La valeur de niveau qui déclenche les paliers : existante ou créée ici avec [Niveau et expérience](#path-level). |
| `milestones` | Paliers | Liste, au moins 1 | — | Sorte de progression : Paliers de niveau | Une ligne par palier. |
| `milestones.level` | Niveau | Nombre entier | — | toujours | Le niveau du palier. |
| `milestones.grants` | Donne | Entrées, facultative | — | toujours | Facultatif : les Définitions données au personnage quand le palier est atteint (un don, un pouvoir). |
| `milestones.action` | Lance l'Action | Entrée, facultative | — | toujours | Facultatif : une Action lancée quand le palier est atteint. |
| `description` | Description (facultative) | Texte, facultative | — | toujours | Facultatif : le texte d'aide de la progression. |

<a id="path-scale"></a>
### Échelle descriptive (`scale`)

**Ce que ça crée :** Une Échelle descriptive, et son lien sur les valeurs et types choisis qui n'en ont pas encore (une échelle déjà liée n'est jamais remplacée). Sur une feuille, ceux qui ne voient pas le nombre voient les mots.

**Exemple :** Santé en pourcentage du maximum : 76-100 « Indemne », 26-75 « Blessé », 1-25 « Grièvement blessé », 0 « Hors de combat ».

| Clé | Question | Sorte | Par défaut | Affichée si | À quoi ça sert |
|---|---|---|---|---|---|
| `name` | Nom | Nom | — | toujours | Le nom de l'échelle. |
| `basis` | Plages en | Choix | Valeur | toujours | **Valeur** : les plages portent sur la valeur elle-même. **Pourcentage du maximum** : sur le pourcentage du maximum d'une jauge. |
| `rows` | Paliers | Liste, au moins 1 | — | toujours | Une ligne par palier. |
| `rows.min` | De | Nombre, facultative | — | toujours | Facultatif : le bas de la plage (inclus). Vide : sans limite basse. |
| `rows.max` | À | Nombre, facultative | — | toujours | Facultatif : le haut de la plage (inclus). Vide : sans limite haute. |
| `rows.words` | Mots | Texte | — | toujours | Les mots affichés pour cette plage. |
| `rows.id` | Identifiant (facultatif) | Texte, facultative | — | toujours | Facultatif : l'identifiant du palier, pour le retrouver dans les calculs ; sinon `row-1`, `row-2`… |
| `definitions` | Valeurs décrites | Entrées, facultative | — | toujours | Facultatif : les valeurs décrites par l'échelle. |
| `types` | Types décrits | Entrées, facultative | — | toujours | Facultatif : les types dont toutes les valeurs sont décrites par l'échelle. |
| `description` | Description (facultative) | Texte, facultative | — | toujours | Facultatif : le texte d'aide de l'échelle. |

<a id="path-contentType"></a>
### Type de contenu (`contentType`)

**Ce que ça crée :** Un Type de contenu avec ses champs. Les Contenus eux-mêmes (une épée, le sort Boule de feu) se créent ensuite dans le configurateur ou par import, puis se donnent aux Acteurs.

**Exemple :** Arme : objet, champs Dégâts (texte, `1d8`), Portée (nombre entier), Compétence (une Définition du type Compétence).

| Clé | Question | Sorte | Par défaut | Affichée si | À quoi ça sert |
|---|---|---|---|---|---|
| `name` | Nom | Nom | — | toujours | Le nom du type (Arme, Sort, Origine…). |
| `storage` | Dans Foundry | Choix | Un objet | toujours | **Un objet** : chaque Contenu est un Objet Foundry (équipement, sorts). **Un acteur** : un Acteur (familier, monture, véhicule). |
| `stackable` | Empilable (quantité) | Oui / non | Non | toujours | Coché : un Acteur peut en avoir plusieurs, comptés par une quantité (flèches, potions). Décoché : chaque Contenu est unique. |
| `fields` | Champs | Liste, facultative | — | toujours | Facultatif : les champs de chaque Contenu de ce type, lus par les dés (`@content.<identifiant>`) et l'opérande « Champ du Contenu ». |
| `fields.name` | Nom | Nom, avec identifiant | — | toujours | Le nom du champ ; l'identifiant (lu par les calculs) est fabriqué à partir du nom (« Dégâts » → `degats`) ou donné. |
| `fields.valueType` | Sorte de valeur | Choix | Nombre | toujours | **Nombre**, **Nombre entier**, **Oui ou non**, **Texte**, ou **Une Définition** (une Définition, par exemple la compétence d'une arme). |
| `fields.referenceType` | Définitions de ce type | Entrée, facultative | — | Sorte de valeur : Une Définition | Facultatif : limite les Définitions acceptées à ce type. |
| `fields.many` | Plusieurs valeurs | Oui / non | Non | toujours | Coché : le champ prend une liste de valeurs. |
| `fields.required` | Obligatoire | Oui / non | Non | toujours | Coché : un Contenu doit le remplir. |
| `fields.nullable` | Peut rester vide | Oui / non | Non | toujours | Coché : le champ peut rester vide (aucune valeur). |
| `availability` | Utilisable seulement si (facultatif) | Entrée, facultative | — | toujours | Facultatif : une Condition ; les Contenus de ce type ne sont utilisables que quand elle est vraie. |
| `description` | Description (facultative) | Texte, facultative | — | toujours | Facultatif : le texte d'aide du type. |

<a id="path-permission"></a>
### Permissions (`permission`)

**Ce que ça crée :** Une Permission par entrée choisie (« Permission : *nom* »), refusée par défaut sauf ses règles. Une Action : seuls les rôles choisis peuvent la lancer. Une valeur ou un type : tout le monde la lit, seuls les rôles choisis la modifient. Un Type de contenu : son propriétaire utilise un Contenu, seuls les rôles choisis en donnent ou en changent.

**Exemple :** Les caractéristiques modifiables par le MJ seulement ; l'Action « Donner de l'XP » réservée au MJ.

| Clé | Question | Sorte | Par défaut | Affichée si | À quoi ça sert |
|---|---|---|---|---|---|
| `kind` | Ce qui est réservé | Choix | Utiliser des Actions | toujours | **Utiliser des Actions** : lancer des Actions. **Modifier des valeurs** : modifier certaines valeurs. **Modifier les valeurs d'un type** : modifier toutes les valeurs d'un type. **Donner des Contenus d'un type** : donner ou changer les Contenus d'un type. |
| `actions` | Actions | Entrées, au moins 1 | — | Ce qui est réservé : Utiliser des Actions | Les Actions réservées. |
| `definitions` | Valeurs | Entrées, au moins 1 | — | Ce qui est réservé : Modifier des valeurs | Les valeurs réservées. |
| `types` | Types | Entrées, au moins 1 | — | Ce qui est réservé : Modifier les valeurs d'un type | Les types dont les valeurs sont réservées. |
| `contentTypes` | Types de Contenus | Entrées, au moins 1 | — | Ce qui est réservé : Donner des Contenus d'un type | Les Types de contenu dont l'attribution est réservée. |
| `who` | Réservé à | Choix | Le MJ et ses assistants | toujours | **Le MJ** ; **Le MJ et ses assistants** (le MJ et les assistants MJ) ; **Les joueurs de confiance aussi** (en plus, les joueurs de confiance de Foundry). |
| `name` | Nom (facultatif, pour une seule entrée) | Nom, facultative | — | toujours | Facultatif : le nom de la Permission, utilisé seulement quand une seule entrée est choisie ; sinon chacune s'appelle « Permission : *nom* ». |
| `description` | Description (facultative) | Texte, facultative | — | toujours | Facultatif : le texte d'aide des Permissions. |

## Parcours : Briques

<a id="path-definitionType"></a>
### Type de définition (`definitionType`)

**Ce que ça crée :** Un Type de définition avec une capacité (permise, par défaut et obligatoire) et ses champs. Des bornes calculées deviennent des Formules « Minimum : *nom* » / « Maximum : *nom* ».

**Exemple :** Type « Compétence » : un nombre, de 0 à 5, avec un champ « Caractéristique liée » (une Définition).

| Clé | Question | Sorte | Par défaut | Affichée si | À quoi ça sert |
|---|---|---|---|---|---|
| `name` | Nom | Nom | — | toujours | Le nom du type. |
| `capability` | Ce que ses valeurs sont | Choix | Un nombre | toujours | Ce que sont les valeurs de ce type : **Un nombre** (caractéristiques, compétences), **Une jauge** (une jauge avec minimum et maximum : PV, mana), **Un état actif ou non** (un état actif ou non : Empoisonné). D'autres capacités s'ajoutent dans l'éditeur du type. |
| `minimum` | Valeur minimum | Formule, facultative | — | Ce que ses valeurs sont : Un nombre | Facultatif : la valeur la plus basse de toutes les valeurs du type (un nombre ou un calcul). |
| `maximum` | Valeur maximum | Formule, facultative | — | Ce que ses valeurs sont : Un nombre | Facultatif : la valeur la plus haute. Pour une borne qui ne vaut que dans un cas (les PJ), utilisez ensuite [Bornes d'une valeur](#path-bounds). |
| `fields` | Champs | Liste, facultative | — | toujours | Facultatif : des champs que chaque Définition de ce type remplit (une description courte, une caractéristique liée…). |
| `fields.name` | Nom | Nom, avec identifiant | — | toujours | Le nom du champ ; l'identifiant est fabriqué à partir du nom ou donné. |
| `fields.valueType` | Sorte de valeur | Choix | Nombre | toujours | **Nombre**, **Nombre entier**, **Oui ou non**, **Texte**, ou **Une Définition** (une Définition). |
| `fields.referenceType` | Définitions de ce type | Entrée, facultative | — | Sorte de valeur : Une Définition | Facultatif : limite les Définitions acceptées à ce type. |
| `fields.many` | Plusieurs valeurs | Oui / non | Non | toujours | Coché : le champ prend une liste de valeurs. |
| `fields.required` | Obligatoire | Oui / non | Non | toujours | Coché : chaque Définition doit le remplir. |
| `fields.nullable` | Peut rester vide | Oui / non | Non | toujours | Coché : le champ peut rester vide. |
| `description` | Description (facultative) | Texte, facultative | — | toujours | Facultatif : le texte d'aide du type. |

<a id="path-value"></a>
### Valeur (`value`)

**Ce que ça crée :** Une Définition (nombre) dans le type choisi, avec les valeurs de ses champs.

**Exemple :** Chance, Expérience, Charge, Points de destin.

| Clé | Question | Sorte | Par défaut | Affichée si | À quoi ça sert |
|---|---|---|---|---|---|
| `name` | Nom | Nom | — | toujours | Le nom de la valeur. |
| `type` | Type | Entrée | Nouveau Type de définition « Valeur » | toujours | Le Type de définition : existant (qui porte un nombre) ou nouveau (« Valeur » par défaut). |
| `scale` | Échelle de description (facultative) | Entrée, facultative | — | toujours | Facultatif : une échelle descriptive qui affiche des mots à la place du nombre. |
| `data` | Valeurs des champs du type | Liste, facultative | — | toujours | Facultatif : les valeurs des champs définis sur le type. |
| `data.field` | Champ (identifiant) | Texte | — | toujours | L'identifiant du champ du type (tel qu'affiché dans l'éditeur du type). |
| `data.entry` | Définition | Entrée, facultative | — | toujours | Facultatif : pour un champ « Une Définition », la Définition choisie. |
| `data.value` | Valeur | Texte, facultative | — | selon « Définition » | La valeur, écrite comme du texte et convertie selon la sorte du champ (nombre, oui/non, texte). Affichée quand aucune Définition n'est choisie. |
| `description` | Description (facultative) | Texte, facultative | — | toujours | Facultatif : le texte d'aide de la valeur. |

<a id="path-parameter"></a>
### Paramètre (`parameter`)

**Ce que ça crée :** Un Paramètre du Ruleset : un réglage nommé une fois, le même pour tous, lu par les calculs avec l'opérande « Paramètre ».

**Exemple :** Difficulté standard = 15 ; Points de création = 25 ; Règle optionnelle activée = oui.

| Clé | Question | Sorte | Par défaut | Affichée si | À quoi ça sert |
|---|---|---|---|---|---|
| `name` | Nom | Nom | — | toujours | Le nom du Paramètre. |
| `valueType` | Sorte de valeur | Choix | Nombre entier | toujours | **Nombre**, **Nombre entier**, **Oui ou non** ou **Texte**. |
| `number` | Valeur | Nombre | — | Sorte de valeur : Nombre ou Nombre entier | La valeur, pour un nombre. |
| `flag` | Valeur | Oui / non | Non | Sorte de valeur : Oui ou non | La valeur, pour un oui ou non (coché = oui). |
| `text` | Valeur | Texte | — | Sorte de valeur : Texte | La valeur, pour un texte. |
| `description` | Description (facultative) | Texte, facultative | — | toujours | Facultatif : le texte d'aide du Paramètre. |

<a id="path-formula"></a>
### Formule (`formula`)

**Ce que ça crée :** Une Formule. Si un calcul identique (même résultat, même expression) existe déjà, il est réutilisé au lieu d'être doublé, sauf si vous donnez un identifiant ou une description.

**Exemple :** « Bonus de Force » = arrondi bas ((Force − 10) ÷ 2).

| Clé | Question | Sorte | Par défaut | Affichée si | À quoi ça sert |
|---|---|---|---|---|---|
| `name` | Nom | Nom | — | toujours | Le nom de la Formule ; l'identifiant, facultatif, est celui que les autres règles citent. |
| `resultType` | Résultat | Choix | Nombre | toujours | Ce que donne le calcul : **Nombre**, **Nombre entier**, **Oui ou non**, **Texte**, ou **Une Définition** (une Définition, pour choisir une valeur selon la situation). Une Formule qui lit une valeur du contexte (une question d'Action) doit souvent être **Nombre** : **Nombre entier** refuse un résultat non entier à la publication. |
| `expression` | Calcul | Formule | — | toujours | Le calcul, avec l'éditeur visuel. |
| `description` | Description (facultative) | Texte, facultative | — | toujours | Facultatif : le texte d'aide ; une Formule décrite est toujours nouvelle. |

<a id="path-condition"></a>
### Condition (`condition`)

**Ce que ça crée :** Une Condition. Une Condition identique déjà présente est réutilisée, sauf avec un identifiant ou une description.

**Exemple :** « A assez de mana » : Mana ≥ 3 ; « Est un PJ » : Sorte d'Acteur = joué par un joueur.

| Clé | Question | Sorte | Par défaut | Affichée si | À quoi ça sert |
|---|---|---|---|---|---|
| `name` | Nom | Nom | — | toujours | Le nom de la Condition ; l'identifiant, facultatif, est celui que les autres règles citent. |
| `expression` | Vraie quand | Condition | — | toujours | Le test vrai ou faux, avec l'éditeur visuel : comparaisons (=, ≠, <, ≤, >, ≥), et, ou, non, toujours vrai… |
| `description` | Description (facultative) | Texte, facultative | — | toujours | Facultatif : le texte d'aide ; une Condition décrite est toujours nouvelle. |

<a id="path-roll"></a>
### Jet (`roll`)

**Ce que ça crée :** Un Jet (des dés), avec ses variantes. Des dés simples sans nom ni variante réutilisent un Jet identique déjà présent.

**Exemple :** Jet d'attaque `1d20`, et `2d20kh` quand « Avantage » est vrai.

| Clé | Question | Sorte | Par défaut | Affichée si | À quoi ça sert |
|---|---|---|---|---|---|
| `name` | Nom (facultatif) | Nom, facultative | — | toujours | Facultatif : le nom du Jet. Sans nom, le Jet s'appelle comme ses dés. |
| `formula` | Dés | Dés | — | toujours | Les dés, en notation Foundry. Ils peuvent lire un champ du Contenu utilisé (`@content.degats`) et une question de l'Action (`@input.niveau`), ainsi que les lettres des dés spéciaux ([Dé spécial](#path-die)). |
| `variants` | Autres dés selon une Condition | Liste, facultative | — | toujours | Facultatif : d'autres dés lancés à la place quand une Condition est vraie ; la première vraie l'emporte. |
| `variants.condition` | Quand | Entrée | — | toujours | La Condition de la variante : existante ou créée ici. |
| `variants.formula` | Dés | Dés | — | toujours | Les dés lancés quand elle est vraie. |
| `description` | Description (facultative) | Texte, facultative | — | toujours | Facultatif : le texte d'aide du Jet. |

<a id="path-outcome"></a>
### Résultat de test (`outcome`)

**Ce que ça crée :** Un Résultat de test, reconnu par sa Condition. Les Tests l'utilisent dans l'ordre choisi sur chacun (« Résultats existants, dans l'ordre (sinon créés ici) » de [Jet ou test](#path-test)).

**Exemple :** « Réussite exceptionnelle », clé `exceptional`, quand la marge ≥ 10.

| Clé | Question | Sorte | Par défaut | Affichée si | À quoi ça sert |
|---|---|---|---|---|---|
| `name` | Nom | Nom | — | toujours | Le nom du Résultat, affiché dans le chat. |
| `resultKey` | Clé du résultat (lue par les calculs) | Texte | — | toujours | La clé lue par les règles : `success`, `failure`, `critical`, `fumble` ou la vôtre. Les Actions s'y réfèrent (« Selon le résultat du jet ») et les calculs la lisent dans `variables.test.outcome.resultKey`. Une attaque créée par l'assistant touche sur tous les résultats sauf `failure` et `fumble`, et double sur `critical`. |
| `condition` | Obtenu quand | Entrée, facultative | — | toujours | Facultatif : quand le Résultat est obtenu, souvent une comparaison de `variables.test.margin` (total − difficulté) ou de `variables.test.natural` (le dé naturel). Sans Condition, il ne vaut que comme résultat par défaut d'un Test. |
| `description` | Description (facultative) | Texte, facultative | — | toujours | Facultatif : le texte d'aide du Résultat. |

<a id="path-duration"></a>
### Durée (`duration`)

**Ce que ça crée :** Une Durée, que les Actions choisissent quand elles infligent un état.

**Exemple :** « 1 minute » = 10 rounds ; « Jusqu'à la fin du combat ».

| Clé | Question | Sorte | Par défaut | Affichée si | À quoi ça sert |
|---|---|---|---|---|---|
| `name` | Nom | Nom | — | toujours | Le nom de la Durée. |
| `duration` | Dure | Choix | Des rounds | toujours | **Jusqu'à ce qu'on le retire** ; **Des rounds** ; **Des tours** ; **Des minutes**, **Des heures**, **Des jours** (temps du monde) ; **Jusqu'à un évènement**. |
| `amount` | Combien | Nombre entier, au moins 1 | 1 | Dure : Des rounds, Des tours, Des minutes, Des heures ou Des jours | Le nombre de rounds, tours, minutes, heures ou jours. |
| `event` | Évènement | Évènement | — | Dure : Jusqu'à un évènement | L'évènement qui met fin à l'état. |
| `description` | Description (facultative) | Texte, facultative | — | toujours | Facultatif : le texte d'aide de la Durée. |

<a id="path-effect"></a>
### Effet (`effect`)

**Ce que ça crée :** Un Effet : un changement qu'une Action produit. Selon les réponses, un Jet « Dés : *nom* », des Formules « Bonus : *nom* », « Multiplicateur : *nom* », « Facteur : *nom* », « Cible : *nom* » ou « Montant : *nom* ».

**Exemple :** « Dégâts d'épée » : retirer 1d8 + Force aux Points de vie de la cible. « Munition » : retirer 1 au champ « Munitions » de l'arme utilisée.

| Clé | Question | Sorte | Par défaut | Affichée si | À quoi ça sert |
|---|---|---|---|---|---|
| `name` | Nom | Nom | — | toujours | Le nom de l'Effet. |
| `writes` | Ce qui change | Choix | Une Définition | toujours | **Une Définition** : une valeur, une jauge ou un état d'un Acteur. **Un champ du Contenu utilisé** : un champ du Contenu utilisé par l'Action (les munitions d'une arme). |
| `target` | Valeur changée | Entrée | — | Ce qui change : Une Définition | La Définition changée : une jauge (ses points), une valeur (sa base) ou un état. |
| `chosenBy` | Définition choisie par un calcul (facultatif) | Formule, facultative | — | Ce qui change : Une Définition | Facultatif : une Formule de résultat « Une Définition » qui choisit, au moment de l'usage, la Définition changée à la place de « Valeur changée » (la compétence testée, la caractéristique choisie dans une question de l'Action). |
| `field` | Champ (identifiant) | Texte | — | Ce qui change : Un champ du Contenu utilisé | L'identifiant du champ du Contenu (par exemple `munitions`). |
| `role` | Qui est visé | Choix | La cible | toujours | Sur qui : **La cible** ou **Soi-même**. |
| `operation` | Changement | Choix | Retirer | toujours | **Retirer**, **Ajouter**, **Fixer à** ou **Multiplier par**. |
| `operand` | De combien | Choix | Un nombre | toujours | Le montant : **Un nombre**, **Un calcul**, **Des dés** (lancés à chaque usage) ou **Un jet existant** (un Jet existant, avec ses variantes). |
| `amount` | Montant | Nombre | 1 | De combien : Un nombre | Le nombre retiré, ajouté, fixé ou multiplié. |
| `expression` | Calcul | Formule | — | De combien : Un calcul | Le calcul. Un nombre, un Paramètre, une Référence ou une Formule sont utilisés tels quels ; un autre calcul devient une Formule. |
| `dice` | Dés | Dés | — | De combien : Des dés | Les dés (`1d8`, `2d6+@content.bonus`). |
| `roll` | Jet | Entrée | — | De combien : Un jet existant | Le Jet : existant ou créé ici avec [Jet](#path-roll). |
| `bonus` | Bonus ajouté (facultatif) | Formule, facultative | — | De combien : Des dés ou Un jet existant | Facultatif : un bonus ajouté au total des dés. |
| `multiplier` | Multiplicateur des dés (facultatif) | Formule, facultative | — | De combien : Des dés ou Un jet existant | Facultatif : multiplie le nombre de dés (2 sur un critique : 1d8 devient 2d8). |
| `factor` | Facteur appliqué au total (facultatif) | Formule, facultative | — | De combien : Des dés ou Un jet existant | Facultatif : multiplie le total (dés + bonus), arrondi vers le bas (½ pour une résistance). |
| `minimum` | Au moins | Nombre, facultative | — | De combien : Des dés ou Un jet existant | Facultatif : le montant ne descend jamais sous ce nombre. |
| `description` | Description (facultative) | Texte, facultative | — | toujours | Facultatif : le texte d'aide de l'Effet. |

<a id="path-action"></a>
### Action (`action`)

**Ce que ça crée :** Une Action (un bouton de jeu) qui réunit des entrées déjà créées : ses questions, conditions, coûts, Test, Effets, états infligés ou retirés, et ce que fait chaque résultat du Test. Créez d'abord les Effets, Tests et états avec leurs parcours.

**Exemple :** « Tir » : question « Nombre de balles » (1 à 3), possible si Munitions ≥ 1, coût « Une munition », Test « Tir », sur une réussite l'Effet « Dégâts », sur un critique en plus l'Action « Blessure grave ».

| Clé | Question | Sorte | Par défaut | Affichée si | À quoi ça sert |
|---|---|---|---|---|---|
| `name` | Nom | Nom | — | toujours | Le nom de l'Action (le bouton sur la feuille). |
| `inputs` | Questions posées à l'usage | Liste, facultative | — | toujours | Facultatif : des questions posées au joueur quand il utilise l'Action ; les réponses se lisent dans les calculs (Valeur du contexte `variables.input.<identifiant>`) et les dés (`@input.<identifiant>`). |
| `inputs.name` | Question | Nom, avec identifiant | — | toujours | Le texte de la question ; l'identifiant, facultatif, est celui que les calculs lisent (sinon fabriqué à partir du texte : « Nombre de balles » → `nombre_de_balles`). |
| `inputs.valueType` | Réponse | Choix | Nombre | toujours | La sorte de réponse : **Nombre**, **Nombre entier**, **Oui ou non**, **Texte**, ou **Une Définition** (une Définition à choisir). |
| `inputs.definitionType` | Définitions de ce type | Entrée | — | Réponse : Une Définition | Pour **Une Définition** : le type dont le joueur choisit une Définition. |
| `inputs.default` | Réponse par défaut | Texte, facultative | — | Réponse : Nombre, Nombre entier, Oui ou non ou Texte | Facultatif : la réponse proposée, convertie selon la sorte de réponse. |
| `inputs.required` | Obligatoire | Oui / non | Oui | toujours | Coché : le joueur doit répondre. |
| `inputs.options` | Choix proposés (facultatifs) | Liste, facultative | — | Réponse : Nombre, Nombre entier, Oui ou non ou Texte | Facultatif : une liste de réponses à choisir au lieu d'un champ libre. |
| `inputs.options.label` | Libellé | Texte | — | toujours | Le texte affiché pour ce choix. |
| `inputs.options.value` | Valeur | Texte | — | toujours | La valeur enregistrée pour ce choix, convertie selon la sorte de réponse. |
| `conditions` | Possible seulement si | Entrées, facultative | — | toujours | Facultatif : les Conditions qui doivent toutes être vraies pour utiliser l'Action. |
| `costs` | Coûts | Entrées, facultative | — | toujours | Facultatif : des Effets payés à l'usage, avant le reste (dépenser une munition, du mana). |
| `test` | Jet | Entrée, facultative | — | toujours | Facultatif : le Test lancé par l'Action. |
| `effects` | Effets | Entrées, facultative | — | toujours | Facultatif : les Effets de l'Action. Avec un Test, ils s'appliquent sur les résultats sans ligne dans « Selon le résultat du jet », ou sur ceux dont la ligne ne les remplace pas. |
| `applyStates` | États infligés | Liste, facultative | — | toujours | Facultatif : les états infligés par l'Action. |
| `applyStates.state` | État | Entrée | — | toujours | L'état infligé. |
| `applyStates.duration` | Durée (facultative) | Entrée, facultative | — | toujours | Facultatif : sa Durée (existante ou créée ici avec [Durée](#path-duration)). Vide : jusqu'à ce qu'on le retire. |
| `applyStates.stacking` | S'il est déjà là | Choix | Relancer sa durée | toujours | S'il est déjà là : **Relancer sa durée**, **Ajouter une pile**, **En ajouter un autre** ou **Ne rien faire**. |
| `removeStates` | États retirés | Entrées, facultative | — | toujours | Facultatif : les états retirés par l'Action. |
| `role` | Qui est visé | Choix | La cible | toujours | Qui reçoit les états infligés et retirés : **La cible** ou **Soi-même**. (Chaque Effet a son propre « Qui est visé ».) |
| `results` | Selon le résultat du jet | Liste, facultative | — | selon « Jet » | Facultatif, avec un Test : ce que fait chaque résultat. Affichée quand un « Jet » est choisi. |
| `results.outcome` | Résultat | Entrée, facultative | — | toujours | Facultatif : le Résultat concerné. Vide : donnez une clé de résultat. |
| `results.resultKey` | Résultat | Texte | — | selon « Résultat » | La clé de résultat concernée (`success`, `critical`…), quand aucun Résultat n'est choisi. |
| `results.replace` | Remplace les Effets de l'Action | Oui / non | Oui | toujours | Coché : pour ce résultat, les Effets de la ligne remplacent ceux de l'Action (aucun Effet listé = aucun Effet, utile pour un échec). Décoché : les Effets de l'Action s'appliquent. |
| `results.effects` | Effets | Entrées, facultative | — | Remplace les Effets de l'Action : Oui | Facultatif : les Effets appliqués pour ce résultat. |
| `results.actions` | Actions enchaînées | Entrées, facultative | — | toujours | Facultatif : des Actions enchaînées pour ce résultat (une table de critiques, une blessure grave). |
| `targeting` | Plusieurs cibles | Choix | Une seule cible | toujours | Avec plusieurs cibles : **Une seule cible** (seulement la cible principale), **Un jet par cible** (le Test, les Effets et les suites sont faits pour chaque cible ; coûts et conditions une seule fois), **Un jet pour toutes** (comme pour chaque cible, mais les dés des Effets sont lancés une seule fois pour toutes, bonus et facteurs comptés par cible : une boule de feu). |
| `description` | Description (facultative) | Texte, facultative | — | toujours | Facultatif : le texte d'aide de l'Action. |

<a id="path-counter"></a>
### Compteur (`counter`)

**Ce que ça crée :** Une Définition (nombre) dans le type choisi. Avec le bouton : un Effet et une Action « +1 : *nom* » (+1 sur soi). Avec une remise à zéro : un Effet, une Action et un Déclencheur « Remise à zéro : *nom* » qui fixent la valeur à l'évènement choisi.

**Exemple :** « Attaques du round » : +1 à chaque attaque, remis à 0 à chaque nouveau round ; une Condition « Attaques du round < 2 » limite ensuite l'Action.

| Clé | Question | Sorte | Par défaut | Affichée si | À quoi ça sert |
|---|---|---|---|---|---|
| `name` | Nom | Nom | — | toujours | Le nom du compteur. |
| `type` | Type du compteur | Entrée | Nouveau Type de définition « Compteur » | toujours | Le Type de définition : existant (qui porte un nombre) ou nouveau (« Compteur » par défaut). |
| `increment` | Ajouter un bouton +1 | Oui / non | Oui | toujours | Coché : une Action « +1 : *nom* » sur la feuille. |
| `resetOn` | Remettre à zéro à | Évènement, facultative | — | toujours | Facultatif : l'évènement qui remet le compteur à sa valeur de départ (nouveau round, début de tour, temps qui passe…). |
| `resetTo` | Valeur de départ | Nombre | 0 | selon « Remettre à zéro à » | La valeur remise à cet évènement. |

<a id="path-trigger"></a>
### Déclencheur (`trigger`)

**Ce que ça crée :** Un Déclencheur qui lance des Actions à un évènement. Les Déclencheurs d'un même évènement passent dans l'ordre de leurs cartes.

**Exemple :** Régénération : à chaque début de tour, l'Action « +1 PV » pour chaque acteur qui a l'état « Régénère ».

| Clé | Question | Sorte | Par défaut | Affichée si | À quoi ça sert |
|---|---|---|---|---|---|
| `name` | Nom | Nom | — | toujours | Le nom du Déclencheur. |
| `event` | Quand | Évènement | `rta.combat.round` | toujours | L'évènement écouté : `rta.combat.start` (début du combat), `rta.combat.round` (nouveau round), `rta.combat.turn` (début de tour), `rta.combat.end` (fin du combat), `rta.time.elapsed` (temps écoulé), ou un Type d'évènement du Ruleset. |
| `conditions` | Seulement si | Entrées, facultative | — | toujours | Facultatif : des Conditions qui doivent toutes être vraies au moment de l'évènement. |
| `actions` | Actions lancées | Entrées, au moins 1 | — | toujours | Les Actions lancées, dans l'ordre (au moins une). |
| `holder` | Pour qui | Choix | Chaque acteur concerné | toujours | Qui entend l'évènement : **Chaque acteur concerné** (chaque Acteur concerné : les combattants, celui dont c'est le tour), **Le combat** (le combat, une fois), **Le monde** (le monde, une fois : le temps qui passe). |
| `mode` | Comment | Choix | Tout seul | toujours | **Tout seul** : les Actions se lancent seules. **Proposé au joueur** : le joueur concerné reçoit une proposition (réaction) qu'il accepte ou non. |
| `actingRole` | Qui agit | Choix | Celui qui porte le déclencheur | toujours | Qui fait les Actions : **Celui qui porte le déclencheur** ou **La cible de l'évènement**. |
| `description` | Description (facultative) | Texte, facultative | — | toujours | Facultatif : le texte d'aide du Déclencheur. |

<a id="path-table"></a>
### Table aléatoire (`table`)

**Ce que ça crée :** Une Table aléatoire, son Jet « Dés : *nom* », une Formule « Bonus : *nom* » si un bonus est donné et, si demandé, une Action « Lancer : *nom* » qui tire sur la table.

**Exemple :** Localisation (1d10) : 1-2 Tête, 3-4 Bras, 5-10 Torse ; chaque ligne lance l'Action de sa blessure.

| Clé | Question | Sorte | Par défaut | Affichée si | À quoi ça sert |
|---|---|---|---|---|---|
| `name` | Nom | Nom | — | toujours | Le nom de la table. |
| `dice` | Dés | Dés | — | toujours | Les dés tirés (`1d100`, `2d6`). |
| `bonus` | Bonus au tirage | Formule, facultative | — | toujours | Facultatif : un bonus ajouté au tirage (la marge de réussite, un niveau). |
| `rows` | Lignes | Liste, au moins 1 | — | toujours | Une ligne par résultat de la table. |
| `rows.label` | Texte | Texte | — | toujours | Le texte du résultat, affiché dans le chat. |
| `rows.min` | De | Nombre entier, facultative | — | toujours | Facultatif : le plus petit tirage de la ligne (inclus). |
| `rows.max` | À | Nombre entier, facultative | — | toujours | Facultatif : le plus grand tirage de la ligne (inclus). Une ligne sans « De » ni « À » ne sort jamais au hasard. |
| `rows.actions` | Actions lancées | Entrées, facultative | — | toujours | Facultatif : les Actions lancées quand la ligne sort. |
| `action` | Ajouter un bouton pour tirer | Oui / non | Oui | toujours | Coché : une Action « Lancer : *nom* » pour tirer sur la table depuis la feuille. |

<a id="path-die"></a>
### Dé spécial (`die`)

**Ce que ça crée :** Un Dé spécial à faces personnalisées et ses compteurs (un par mot de « Compte comme »). Une formule de dés le lance avec sa lettre (`3db`).

**Exemple :** Dé de compétence (lettre `b`) : faces vides, « Succès », « Succès ×2 », « Avantage » ; le jet compte les succès et les avantages.

| Clé | Question | Sorte | Par défaut | Affichée si | À quoi ça sert |
|---|---|---|---|---|---|
| `name` | Nom | Nom | — | toujours | Le nom du dé. |
| `letter` | Lettre dans les formules | Texte | — | toujours | La lettre utilisée dans les formules de dés (`1dX`), mise en minuscule. Choisissez une lettre que Foundry n'utilise pas déjà. |
| `faces` | Faces | Liste, au moins 2 | — | toujours | Une ligne par face (au moins deux). |
| `faces.label` | Face | Texte | — | toujours | Le texte ou symbole de la face, affiché dans le résultat. |
| `faces.value` | Valeur | Nombre, facultative | — | toujours | Facultatif : la valeur numérique de la face, ajoutée au total. |
| `faces.counter` | Compte comme | Texte, facultative | — | toujours | Facultatif : le compteur que la face fait monter (« Succès », « Avantage ») ; les faces qui partagent ce mot partagent le compteur. |
| `faces.count` | Combien | Nombre entier | 1 | selon « Compte comme » | Combien la face ajoute à ce compteur. |

<a id="modules"></a>
## 8. Pour les autres modules

L'assistant est aussi une API : `describeAssistantCatalog`, `describeAssistantPath`, `planAssistant`, `applyAssistant` et les panneaux `registerAssistantPanel`. Les clés de ce guide sont celles de l'API, et les réponses s'écrivent comme le décrit `answerFormats` du catalogue. Voir [docs/architecture.md](architecture.md), section « Ruleset assistant for other modules ».

<a id="maintenance"></a>
## 9. Tenir ce guide à jour

Ce guide existe en français (ce fichier) et en anglais ([assistant-guide.md](assistant-guide.md)). Le test `tests/assistant-docs.test.mjs` échoue quand un parcours ou une question n'est pas documenté dans les deux langues, quand un libellé, une sorte, une valeur par défaut ou une condition d'affichage a changé dans le module sans que le guide suive, quand une option d'un choix n'est pas expliquée, ou quand le guide parle d'un parcours ou d'une question qui n'existe plus. `node qa/assistant-doc-skeleton.mjs fr` (ou `en`) affiche les sections à reprendre, prêtes à coller, en gardant les explications déjà écrites.

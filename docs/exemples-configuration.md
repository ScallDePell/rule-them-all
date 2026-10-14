# Rule Them'All : exemples de configuration

Ce document complète le [guide du MJ](guide-mj.md). Pour chaque famille du Configurateur, il donne trois exemples tirés de jeux de rôle différents, avec les réglages à faire pas à pas. Les noms de champs sont ceux qu'affiche l'éditeur.

Les exemples ne reproduisent pas les livres : ils montrent comment traduire une règle. Les valeurs exactes (tables, coûts, libellés) sont à reprendre de vos propres ouvrages. Ils ont été vérifiés contre le code du module, pas encore joués dans Foundry.

Sommaire :
- [Définitions](#section-définitions) et [Contenus](#section-contenus)
- [Règles (calculs et jets)](#règles-calculs-et-jets)
- [Règles (effets, actions, dés)](#règles-effets-actions-dés)
- [Orchestration](#orchestration)
- [Systèmes](#systèmes) et [Organisation](#organisation)

## Section Définitions

### Types de définition

#### Les caractéristiques de L'Appel de Cthulhu (en pourcentage, de 0 à 99)

Dans L'Appel de Cthulhu 7e, FOR, CON, DEX, APP, POU, TAI, INT et ÉDU sont des valeurs en pourcentage qu'aucun investigateur ne peut dépasser.

1. Dans la section Définitions, ouvrez la rubrique Types de définition et cliquez sur Créer.
2. Dans Nom, saisissez « Caractéristique ». Dans Description, écrivez une aide courte : elle s'affichera dans l'éditeur de chaque caractéristique.
3. Dans Capacités, réglez Valeur sur Requise et laissez Réserve, Collection et État sur Indisponible.
4. Dans Valeur minimale, choisissez Nombre et saisissez 0. Dans Valeur maximale, choisissez Nombre et saisissez 99.
5. Dans Champs, cliquez sur Ajouter un champ : Nom « Abréviation », Type de valeur string, Cardinalité un, Obligatoire coché.
6. Cliquez sur Enregistrer et quitter. Une nouvelle rubrique « Caractéristique » apparaît sous Types de définition.

Les valeurs Difficile (la moitié) et Extrême (le cinquième) ne se règlent pas ici : ce sont deux Formules, dans la famille Formules de la section Règles.

#### Les compétences de Fate et leur échelle d'adjectifs

Dans Fate, une compétence à +3 se dit « Bon » et une à +4 « Excellent » : la feuille montre l'adjectif plutôt que le chiffre.

1. Préparez d'abord l'échelle dans la famille Échelles descriptives (section Règles) : un palier par adjectif, par exemple De 0 À 0 avec la Description « Médiocre », De 1 À 1 « Moyen », De 2 À 2 « Correct », De 3 À 3 « Bon », De 4 À 4 « Excellent », De 5 À 5 « Superbe ».
2. Revenez dans Définitions, rubrique Types de définition, et cliquez sur Créer. Dans Nom, saisissez « Compétence ».
3. Dans Échelle descriptive, choisissez l'échelle que vous venez de créer.
4. Dans Capacités, réglez Valeur sur Requise.
5. Dans Valeur minimale, choisissez Nombre et saisissez 0 : une compétence absente vaut Médiocre.
6. Cliquez sur Enregistrer et quitter.

Chaque compétence du type hérite de l'échelle. Une compétence peut en choisir une autre dans son propre champ Échelle descriptive, qui propose sinon « Celle de son type ».

#### Les états de D&D 5e (Aveuglé, À terre, Empoigné…)

Dans D&D 5e, un état est présent ou absent, sans valeur chiffrée, et ses conséquences s'appliquent tant qu'il dure.

1. Dans Types de définition, cliquez sur Créer et saisissez « État » dans Nom.
2. Dans Capacités, réglez État sur Requise. Laissez Valeur, Réserve et Collection sur Indisponible.
3. Si vous voulez repérer les états d'un coup d'œil dans le Configurateur, cochez Personnaliser à côté de Couleur de la sous-section et choisissez une couleur.
4. Cliquez sur Enregistrer et quitter, puis créez dans la nouvelle rubrique « État » une Définition par état : Aveuglé, À terre, Empoigné, Entravé, etc.

Un état est posé par une Action (champ États appliqués, famille Actions de la section Règles). Ses effets chiffrés, comme un malus aux attaques, sont des Modificateurs (famille Modificateurs) que l'Action attache à l'état.

### Définitions

#### La Soif de Vampire la Mascarade V5 (de 0 à 5, départ à 1)

Dans Vampire V5, la Soif est une jauge de 0 à 5 ; un vampire nouvellement créé commence à 1.

1. Il faut un type de définition dont la Réserve est Requise, par exemple un type « Ressource ».
2. Dans la section Définitions, ouvrez la rubrique « Ressource » et cliquez sur Créer. Dans Nom, saisissez « Soif ».
3. Réserve apparaît sous Capacités obligatoires (imposées par le type). Dans la partie Réserves, cliquez sur Ajouter une réserve.
4. Remplissez ID du slot « soif », Libellé « Soif » et Type de valeur integer.
5. Dans Minimum, choisissez Nombre et saisissez 0. Dans Maximum, choisissez Nombre et saisissez 5. Dans Valeur de départ, choisissez Nombre et saisissez 1.
6. Laissez Sous le minimum et Au-dessus du maximum sur Ramener à la borne : une Soif qui monterait à 6 reste à 5.
7. Cliquez sur Enregistrer et quitter.

Le test d'Éveil, qui fait monter la Soif, est une Action qui modifie la valeur actuelle de cette réserve (famille Actions).

#### Le sac de Mörk Borg (Force + 8 objets)

Dans Mörk Borg, on porte sans gêne Force + 8 objets, et jamais plus du double.

1. Créez d'abord, dans la famille Formules (section Règles), une Formule « Charge maximale » qui calcule 2 × (Force + 8).
2. Il faut aussi un type de contenu « Équipement » (section Contenus) et un type de définition dont la Collection est Requise, par exemple « Inventaire ».
3. Dans la rubrique « Inventaire », cliquez sur Créer et saisissez « Sac » dans Nom.
4. Dans la partie Collections, cliquez sur Ajouter une collection. Saisissez « objets » dans ID du slot et choisissez Contenu possédé dans Mode d’entrée.
5. Dans Types de contenu autorisés, cochez « Équipement ».
6. Dans Formula de capacité, choisissez « Charge maximale ». Laissez Entrées maximum vide : la Formule suffit à fixer la limite.
7. Cliquez sur Enregistrer et quitter.

La gêne au-delà de Force + 8 est une Condition (famille Conditions) qui compare le nombre d'objets de la collection (sa sortie Nombre) à Force + 8.

#### Les Arts martiaux de Cyberpunk RED (DEX, coût doublé)

Dans Cyberpunk RED, chaque compétence s'ajoute à une Stat, et quelques-unes, comme les Arts martiaux, coûtent le double à améliorer.

1. Le type « Compétence » porte deux champs, ajoutés dans son éditeur avec Ajouter un champ. Le premier : Nom « Stat », Type de valeur reference, Cible de référence Définition, Type de définition « Stat ». Le second : Nom « Coût doublé », Type de valeur boolean, Valeur par défaut false.
2. Dans la section Définitions, ouvrez la rubrique « Compétence » et cliquez sur Créer.
3. Dans Nom, saisissez « Arts martiaux ». Le champ Type de définition, en lecture seule, rappelle « Compétence ».
4. Les champs du type s'affichent dans le formulaire : dans Stat, choisissez « DEX » ; dans Coût doublé, choisissez oui.
5. Laissez Activé coché, puis cliquez sur Enregistrer et quitter.

La Formule du jet de compétence (Stat + compétence + 1d10) et le coût de progression lisent ces champs ; elles se règlent dans les familles Formules et Tests, et dans un Système de progression.

## Section Contenus

### Types de contenu

#### Les consommables de Pathfinder 2 (potions, munitions)

Dans Pathfinder 2, on possède souvent plusieurs exemplaires d'un même consommable, comme trois potions de soins identiques.

1. Dans la section Contenus, ouvrez la rubrique Types de contenu et cliquez sur Créer. Dans Nom, saisissez « Consommable ».
2. Dans Stockage Foundry, choisissez Objet, puis le sous-type voulu dans Sous-type Foundry Item s'il y en a plusieurs.
3. Dans Mode d’exécution par défaut, choisissez Cumulable : un personnage pourra acquérir le même consommable plusieurs fois.
4. Dans Champs, ajoutez avec Ajouter un champ : « Niveau » (integer), « Prix en po » (number), « Encombrement » (string) et « Traits » (string, Cardinalité plusieurs).
5. Cliquez sur Enregistrer et quitter. Une rubrique « Consommable » apparaît sous Types de contenu.

#### Les vaisseaux de Traveller (stockés comme Acteurs)

Dans Traveller, un vaisseau a sa propre fiche et son propre jeton sur la carte, comme un personnage.

1. Dans Types de contenu, cliquez sur Créer et saisissez « Vaisseau » dans Nom. Ajoutez une Image si vous le souhaitez, avec Choisir / Remplacer.
2. Dans Stockage Foundry, choisissez Acteur.
3. Dans Sous-type Foundry Actor, choisissez le sous-type d'acteur prévu par le système Foundry utilisé (obligatoire s'il y en a plusieurs).
4. Laissez Mode d’exécution par défaut sur Unique.
5. Dans Champs, ajoutez « Tonnage », « Indice de saut », « Indice de manœuvre », « Coque » et « Blindage », tous en integer.
6. Cliquez sur Enregistrer et quitter.

#### Les sorts de Shadowrun (réservés aux Éveillés)

Dans Shadowrun, seul un personnage qui possède l'attribut Magie peut lancer un sort.

1. Créez d'abord, dans la famille Conditions (section Règles), une Condition « Personnage éveillé » qui vérifie que la Magie est supérieure à 0.
2. Dans Types de contenu, cliquez sur Créer et saisissez « Sort » dans Nom. Gardez Stockage Foundry sur Objet.
3. Dans Disponibilité, choisissez « Personnage éveillé ». Tant que cette Condition est fausse, les Actions d'un sort ne peuvent pas être utilisées.
4. Dans Champs, ajoutez « Catégorie », « Type (physique ou mana) », « Portée » et « Durée » en string, et « Drain » en integer.
5. Cliquez sur Enregistrer et quitter.

La Condition de Disponibilité peut aussi lire les champs du sort lui-même.

### Contenus

#### La potion de soins inférieure de Pathfinder 2

Dans Pathfinder 2, une potion de soins inférieure (niveau 1, 4 po) rend 1d8 points de vie à qui la boit.

1. Il faut le type « Consommable » vu plus haut et une Action « Boire une potion de soins » qui rend 1d8 PV (famille Actions).
2. Dans la section Contenus, ouvrez la rubrique « Consommable » et cliquez sur Créer.
3. Dans Nom, saisissez « Potion de soins inférieure », et une Description si vous le souhaitez.
4. Laissez Mode d’exécution sur « Comme son type (Cumulable) ».
5. Remplissez les champs du type : Niveau 1, Prix en po 4, Encombrement « L », Traits « consommable », « guérison », « potion » (une valeur par ligne).
6. Dans Relations, cliquez sur Ajouter une relation, choisissez l'Opération Attribuer à l’acquisition et l'Objet lié « Boire une potion de soins ».
7. Cliquez sur Enregistrer et quitter.

Pour que l'achat coûte de l'or, choisissez dans Action d’acquisition une Action « Acheter » qui retire les 4 po ; sinon laissez « Aucune Action : ajout direct ».

#### L'archétype Maître de guerre de D&D 5e (trois manœuvres au choix)

Dans D&D 5e, le guerrier Maître de guerre reçoit des dés de supériorité et choisit trois manœuvres dans une liste.

1. Les manœuvres (Riposte, Attaque menaçante, Désarmement, Feinte, Parade…) sont des Actions, et les dés de supériorité une Définition à Réserve.
2. Dans la rubrique du type de contenu « Archétype », cliquez sur Créer et saisissez « Maître de guerre » dans Nom.
3. Dans Relations, ajoutez une relation avec l'Opération Attribuer à l’acquisition et l'Objet lié « Dés de supériorité ».
4. Dans Choix d’acquisition, cliquez sur Ajouter un choix. Saisissez « Manœuvres » dans Nom, 3 dans Minimum et 3 dans Maximum.
5. Dans Opération, choisissez Attribuer à l’acquisition. Dans Objet lié, cochez toutes les manœuvres proposées (le champ de recherche aide à les trouver).
6. Cliquez sur Enregistrer et quitter.

Quand un personnage acquiert l'archétype, le joueur coche exactement trois manœuvres, qui deviennent ses Actions.

#### Le Permis B de Real World Fantasy (Véhicules légers à 1)

Dans Real World Fantasy, un personnage qui a le permis B part avec au moins 1 en Véhicules légers.

1. Dans la rubrique du type de contenu « Acquis de création », cliquez sur Créer et saisissez « Permis B » dans Nom.
2. Dans Description, notez « À partir de 19 ans : au moins 1 en Véhicules légers. »
3. Dans Relations, cliquez sur Ajouter une relation. Choisissez l'Opération Attribuer à l’acquisition et l'Objet lié « Véhicules légers ».
4. Ouvrez Paramètres avancés (JSON) sous la relation et saisissez `{"initial": {"value.base": 1}}` : la maîtrise arrive avec une valeur de base de 1.
5. Cliquez sur Enregistrer et quitter.

Avec `{"add": {"value.base": 1}}` à la place, l'acquisition ajoute 1 à la valeur, que le personnage ait déjà la maîtrise ou non. C'est ce que font les choix de compétences des Parcours de RWF.

## Règles (calculs et jets)

Dans toutes les familles de cette section, on ouvre la famille dans la rubrique Règles, on clique sur **Créer**, on remplit l'éditeur puis on clique sur **Enregistrer**. Chaque élément porte un **Nom** et une case **Activé**, cochée par défaut.

Les Formules et les Conditions se construisent dans un éditeur visuel. Chaque opérande choisit sa nature dans une liste : **Valeur littérale**, **Paramètre**, **Formule**, **Référence**, **Valeur du contexte**, **Dés du jet**, **Distance** ou **Acteurs à proximité**. Une Référence se présente sous la forme « Nom · capacité · sortie », par exemple « Discrétion · value · value.final ». Pour un calcul en plusieurs étapes, on crée une Formule par étape et on la reprend comme opérande **Formule** dans la suivante.

### Paramètres

Un Paramètre est une constante du Ruleset. On la change à un seul endroit, et toutes les règles qui la lisent suivent.

#### La base des valeurs passives de D&D 5e

En D&D 5e, une valeur passive (la Perception passive, par exemple) vaut 10 plus le bonus de la compétence.

1. Dans **Paramètres**, cliquez sur **Créer**.
2. **Nom** : « Base des valeurs passives ».
3. **Type de valeur** : `integer`.
4. **Valeur** : `10`.
5. Enregistrez. Le Paramètre sera lu par la Formule de la Perception passive (voir l'exemple de D&D 5e dans Sorties dérivées).

#### Les diviseurs de réussite de L'Appel de Cthulhu

Dans L'Appel de Cthulhu, une réussite difficile demande un jet sous la moitié de la compétence, une réussite extrême sous le cinquième.

1. Créez un premier Paramètre. **Nom** : « Diviseur difficile », **Type de valeur** : `integer`, **Valeur** : `2`.
2. Créez un second Paramètre. **Nom** : « Diviseur extrême », **Type de valeur** : `integer`, **Valeur** : `5`.
3. Ces deux Paramètres servent dans les Formules de seuil (voir l'exemple de L'Appel de Cthulhu dans Formules).

#### Le seuil de réussite de Savage Worlds

Dans Savage Worlds, un jet réussit à 4 ou plus, et chaque tranche de 4 au-dessus donne une prouesse.

1. Dans **Paramètres**, cliquez sur **Créer**.
2. **Nom** : « Seuil de Savage Worlds ».
3. **Type de valeur** : `integer`.
4. **Valeur** : `4`.
5. Enregistrez. Le même Paramètre sert deux fois : comme cible du Test, au travers d'une Formule **Valeur unique** qui le lit, et dans la Condition de la prouesse (voir l'exemple de Savage Worlds dans Résultats).

### Formules

Une Formule calcule une valeur. On choisit une **Opération** (Valeur unique, Additionner, Soustraire, Multiplier, Diviser, Minimum, Maximum, Somme, Moyenne), puis on ajoute autant d'opérandes que nécessaire avec **Ajouter un opérande**.

#### La valeur cible d'un test de Warhammer Fantasy 4e

Dans Warhammer Fantasy 4e, on lance 1d100 sous la compétence, augmentée ou réduite par la difficulté (de +40 à −30).

1. Dans **Formules**, cliquez sur **Créer**. **Nom** : « Cible de Corps à corps ».
2. **Type de résultat** : `integer`.
3. **Opération** : **Additionner**.
4. Opérande 1 : **Référence**, puis « Corps à corps · value · value.final ».
5. Cliquez sur **Ajouter un opérande**. Opérande 2 : **Valeur du contexte**, chemin `variables.input.difficulte`.
6. Enregistrez. La difficulté est une entrée que le joueur choisit au moment d'agir : elle se déclare sur l'Action (famille Actions). La Formule sert ensuite de **Cible** dans le Test.

#### Les seuils difficile et extrême de L'Appel de Cthulhu

Le seuil extrême est la compétence divisée par 5, le seuil difficile la compétence divisée par 2.

1. Dans **Formules**, cliquez sur **Créer**. **Nom** : « Seuil extrême ».
2. **Type de résultat** : `number`.
3. **Opération** : **Diviser**.
4. Opérande 1 : **Valeur du contexte**, chemin `variables.test.target` (la cible du Test en cours, donc la compétence testée).
5. Opérande 2 : **Paramètre**, « Diviseur extrême ».
6. Enregistrez, puis faites de même pour « Seuil difficile » avec le Paramètre « Diviseur difficile ».
7. La division peut donner un nombre à virgule (63 / 5 = 12,6). Ce n'est pas gênant : un jet de dé est entier, donc « jet inférieur ou égal à 12,6 » revient à « jet inférieur ou égal à 12 ».

#### La réserve de dés de Shadowrun

Dans Shadowrun, on lance autant de d6 que l'attribut plus la compétence.

1. Dans **Formules**, cliquez sur **Créer**. **Nom** : « Réserve d'attaque ».
2. **Type de résultat** : `integer`.
3. **Opération** : **Additionner**.
4. Opérande 1 : **Référence**, « Agilité · value · value.final ».
5. Opérande 2 : **Référence**, « Armes à feu · value · value.final ».
6. Enregistrez. Créez de la même façon « Réserve de défense » (Réaction + Intuition). Le Test lira ces Formules dans une entrée, et le Jet en tirera le nombre de dés (voir l'exemple de Shadowrun dans Tests).

### Sorties dérivées

Une Sortie dérivée branche une Formule sur une sortie de Définition. La valeur n'est plus saisie : elle est calculée pour chaque Acteur qui la lit, et les Effets ne peuvent plus l'écrire. Les Modificateurs s'appliquent toujours sur une valeur finale dérivée.

#### La Perception passive de D&D 5e

La Perception passive vaut 10 plus le bonus de Perception. Ici, la Définition « Perception » porte déjà le bonus complet de la compétence.

1. Créez la Définition « Perception passive » avec la capacité valeur (famille Définitions).
2. Dans **Formules**, créez « Calcul de la Perception passive » : **Opération** **Additionner**, opérande 1 **Paramètre** « Base des valeurs passives », opérande 2 **Référence** « Perception · value · value.final ».
3. Dans **Sorties dérivées**, cliquez sur **Créer**. **Nom** : « Perception passive calculée ».
4. **Formule** : « Calcul de la Perception passive ».
5. **Sortie cible** : « Perception passive · value · value.final ».
6. Enregistrez. La feuille affiche désormais la Perception passive sans que personne ne la saisisse.

#### La Parade de Savage Worlds

La Parade vaut 2 plus la moitié du dé de Combat (un d8 donne 2 + 4 = 6). Les dés de trait vont du d4 au d12, la moitié tombe donc toujours juste.

1. Dans **Formules**, créez « Moitié du Combat » : **Opération** **Diviser**, opérande 1 **Référence** « Combat · value · value.final », opérande 2 **Valeur littérale** `2`.
2. Créez « Calcul de la Parade » : **Opération** **Additionner**, opérande 1 **Valeur littérale** `2`, opérande 2 **Formule** « Moitié du Combat ».
3. Dans **Sorties dérivées**, cliquez sur **Créer**. **Nom** : « Parade calculée ».
4. **Formule** : « Calcul de la Parade ». **Sortie cible** : « Parade · value · value.final ».
5. Enregistrez. La Robustesse se construit de la même façon, avec la Vigueur et l'armure.

#### La Classe d'armure de Pathfinder 2

Dans Pathfinder 2, la CA vaut 10 plus le modificateur de Dextérité, le bonus de maîtrise de l'armure et le bonus d'objet de l'armure portée.

1. Dans **Formules**, créez « Calcul de la CA » : **Opération** **Additionner**.
2. Opérande 1 : **Valeur littérale** `10`. Opérande 2 : **Référence** « Dextérité · value · value.final ».
3. Opérande 3 : **Référence** « Maîtrise d'armure · value · value.final ». Opérande 4 : **Référence** « Bonus d'armure · value · value.final ».
4. Dans **Sorties dérivées**, cliquez sur **Créer**. **Nom** : « CA calculée ».
5. **Formule** : « Calcul de la CA ». **Sortie cible** : « Classe d'armure · value · value.final ».
6. Enregistrez. Un sort de Bouclier reste possible : c'est un Modificateur (famille Modificateurs), qui s'ajoute à la valeur finale dérivée.

### Conditions

Une Condition est une question à laquelle le moteur répond par vrai ou faux. On choisit une **Comparaison** (Égal, Différent, Supérieur à, Supérieur ou égal, Inférieur à, Inférieur ou égal, Toujours vrai, Toujours faux), puis les deux opérandes à comparer. Pendant un Test, la **Valeur du contexte** donne accès au jet : `variables.test.natural` (le dé naturel), `variables.test.total`, `variables.test.target` (la cible) et `variables.test.margin` (le total moins la cible).

#### Le 20 naturel de D&D 5e

En D&D 5e, un 20 sur le d20 est une réussite critique, quel que soit le total.

1. Dans **Conditions**, cliquez sur **Créer**. **Nom** : « 20 naturel ».
2. **Comparaison** : **Égal**.
3. Opérande 1 : **Valeur du contexte**, chemin `variables.test.natural`.
4. Opérande 2 : **Valeur littérale** `20`.
5. Enregistrez. Créez « 1 naturel » sur le même modèle. Ces Conditions servent aux Résultats du Test.

#### La réussite extrême de L'Appel de Cthulhu

Une réussite extrême demande un jet inférieur ou égal au cinquième de la compétence.

1. Dans **Conditions**, cliquez sur **Créer**. **Nom** : « Jet sous le seuil extrême ».
2. **Comparaison** : **Inférieur ou égal**.
3. Opérande 1 : **Valeur du contexte**, chemin `variables.test.total`.
4. Opérande 2 : **Formule**, « Seuil extrême » (voir l'exemple de L'Appel de Cthulhu dans Formules).
5. Enregistrez, puis créez « Jet sous le seuil difficile » avec la Formule « Seuil difficile ». La Formule est calculée dans le Test en cours, elle lit donc la compétence testée.

#### Le critique de Vampire la Mascarade V5

En V5, deux 10 ou plus parmi les dés lancés forment un critique.

1. Dans **Conditions**, cliquez sur **Créer**. **Nom** : « Paire de 10 ».
2. **Comparaison** : **Supérieur ou égal**.
3. Opérande 1 : **Dés du jet**. Dans les listes qui apparaissent, choisissez **Nombre de dés**, laissez le groupe vide (**Tous les groupes**), puis **Égaux à** et la **Valeur de face** `10`.
4. Opérande 2 : **Valeur littérale** `2`.
5. Enregistrez. Si le Jet marque les dés de Faim d'un groupe (par exemple `[faim]` dans la formule de dés), écrire `faim` dans le champ du groupe ne compte que ces dés-là : c'est le critique sanglant.

### Jets

Un Jet est une formule de dés Foundry, vérifiée à l'enregistrement. Elle peut lire `@test.<id>` (une entrée du Test), `@input.<id>` (une entrée de l'Action) et `@content.<champ>` (l'arme ou le pouvoir utilisé). Les **Variantes** remplacent la formule tant que leur Condition est vraie, et la première variante vraie l'emporte.

#### La réserve de d10 de Vampire la Mascarade V5

En V5, on lance une réserve de d10 et chaque 6 ou plus compte comme un succès.

1. Dans **Jets**, cliquez sur **Créer**. **Nom** : « Réserve V5 ».
2. **Formule de dés** : `(@test.reserve)d10cs>=6`.
3. Enregistrez. Le total du jet est alors le nombre de succès.
4. La valeur `reserve` vient d'une entrée du Test qui utilise ce Jet (section **Entrées** du Test, avec l'**ID de l'entrée** `reserve`). Voir l'exemple de Shadowrun dans Tests, qui procède de la même façon.

#### L'avantage et le désavantage de D&D 5e

Avec l'avantage, on lance deux d20 et on garde le meilleur ; avec le désavantage, le moins bon. Les deux ensemble s'annulent.

1. Créez deux Conditions : « Avantage » (**Valeur du contexte** `variables.input.avantage` **Égal** `1`) et « Désavantage » (même chemin, **Égal** `-1`). La valeur `avantage` est une entrée de l'Action qui vaut 1, -1 ou 0 (famille Actions) : le joueur choisit 0 quand les deux s'appliquent.
2. Dans **Jets**, cliquez sur **Créer**. **Nom** : « d20 ». **Formule de dés** : `1d20`.
3. Dans **Variantes**, cliquez sur **Ajouter une variante**. **Condition** : « Avantage ». **Formule de dés** : `2d20kh1`.
4. Ajoutez une seconde variante. **Condition** : « Désavantage ». **Formule de dés** : `2d20kl1`.
5. Enregistrez. Le dé naturel lu par « 20 naturel » est le dé gardé.

#### Les dés d'action de Blades in the Dark

Dans Blades in the Dark, on lance autant de d6 que la cote d'action et on garde le plus haut. À zéro dé, on lance 2d6 et on garde le plus bas.

1. Créez la Condition « Aucun dé » : **Valeur du contexte** `variables.test.inputs.des` **Égal** **Valeur littérale** `0`.
2. Dans **Jets**, cliquez sur **Créer**. **Nom** : « Dés d'action ». **Formule de dés** : `(@test.des)d6kh1`.
3. Dans **Variantes**, cliquez sur **Ajouter une variante**. **Condition** : « Aucun dé ». **Formule de dés** : `2d6kl1`.
4. Enregistrez. Dans le Test, ajoutez l'entrée `des`, de **Source** **Référence**, qui lit la cote de l'action jouée (par exemple « Escamotage · value · value.final »).

### Résultats

Un Résultat nomme une issue possible d'un Test. Il porte une **Clé de résultat**, que les Actions et les Formules relisent (pour doubler les dégâts sur un critique, par exemple), et une **Condition**. Un Résultat n'a pas d'ordre propre : c'est le Test qui les range, et le premier vrai l'emporte.

#### Les trois issues de Blades in the Dark

Un 6 donne une réussite totale, un 4 ou un 5 une réussite partielle, de 1 à 3 c'est un échec.

1. Créez deux Conditions sur `variables.test.total` : « Au moins 6 » (**Supérieur ou égal** `6`) et « Au moins 4 » (**Supérieur ou égal** `4`).
2. Dans **Résultats**, cliquez sur **Créer**. **Nom** : « Réussite totale », **Clé de résultat** : `totale`, **Condition** : « Au moins 6 ».
3. Créez « Réussite partielle », **Clé de résultat** : `partielle`, **Condition** : « Au moins 4 ».
4. Créez « Échec », **Clé de résultat** : `echec`, sans Condition (première option de la liste).
5. Dans le Test, rangez « Réussite totale » avant « Réussite partielle » et mettez « Échec » en **Résultat par défaut**. Comme un 6 vérifie aussi « Au moins 4 », c'est l'ordre qui fait la différence.

#### Les réussites et échecs automatiques de Warhammer Fantasy 4e

Dans Warhammer Fantasy 4e, un jet de 01 à 05 réussit toujours et un jet de 96 à 00 échoue toujours, quelle que soit la compétence.

1. Créez les Conditions « 05 ou moins » (`variables.test.natural` **Inférieur ou égal** `5`), « 96 ou plus » (`variables.test.natural` **Supérieur ou égal** `96`) et « Sous la cible » (`variables.test.margin` **Inférieur ou égal** `0`).
2. Dans **Résultats**, créez « Réussite automatique », **Clé de résultat** : `reussite`, **Condition** : « 05 ou moins ».
3. Créez « Échec automatique », **Clé de résultat** : `echec`, **Condition** : « 96 ou plus ».
4. Créez « Réussite », **Clé de résultat** : `reussite`, **Condition** : « Sous la cible ». Créez « Échec », **Clé de résultat** : `echec`, sans Condition.
5. Dans le Test, l'ordre est : Réussite automatique, Échec automatique, Réussite, et Échec en **Résultat par défaut**. Les deux réussites partagent la même clé : pour les Actions, c'est la même issue.

#### La prouesse de Savage Worlds

Un jet qui dépasse le seuil de 4 points ou plus donne une prouesse, qui augmente les dégâts ou l'effet.

1. Créez la Condition « Prouesse » : **Valeur du contexte** `variables.test.margin` **Supérieur ou égal** **Paramètre** « Seuil de Savage Worlds ».
2. Créez la Condition « Réussite » : `variables.test.margin` **Supérieur ou égal** **Valeur littérale** `0`.
3. Dans **Résultats**, créez « Prouesse » (**Clé de résultat** `prouesse`, **Condition** « Prouesse ») et « Réussite » (**Clé de résultat** `reussite`, **Condition** « Réussite »).
4. Créez « Échec » (**Clé de résultat** `echec`), sans Condition.
5. Dans le Test (**Cible** : la Formule qui lit le Paramètre « Seuil de Savage Worlds »), l'ordre est Prouesse puis Réussite, avec Échec en **Résultat par défaut**. Une Action peut alors lire la clé `prouesse` pour ajouter 1d6 aux dégâts.

### Tests

Un Test réunit tout : les **Entrées** qu'il lit d'abord, le **Jet**, la **Cible**, le **Calcul** (Formule de bonus, Formule du total, Formule de la marge) et les **Résultats** dans l'ordre. Sans Formule de la marge, la marge vaut le total moins la cible.

#### Un test de compétence de L'Appel de Cthulhu

On lance 1d100 sous la compétence. Un 01 est un critique, un 100 une maladresse, et les seuils difficile et extrême donnent des degrés de réussite.

1. Créez le Jet « d100 » (**Formule de dés** `1d100`), et la Formule « Discrétion » (**Valeur unique**, **Référence** « Discrétion · value · value.final »).
2. Dans **Tests**, cliquez sur **Créer**. **Nom** : « Test de Discrétion ». **Jet** : « d100 ».
3. **Cible** : la Formule « Discrétion ».
4. Dans **Résultats**, utilisez **Ajouter un résultat** dans cet ordre : Critique (`variables.test.natural` égal à 1), Maladresse (`variables.test.natural` égal à 100), Extrême (« Jet sous le seuil extrême »), Difficile (« Jet sous le seuil difficile »), Ordinaire (`variables.test.margin` inférieur ou égal à 0). Faites glisser les lignes pour corriger l'ordre.
5. **Résultat par défaut** : Échec.
6. Enregistrez. Pour une autre compétence, un clic droit sur la carte du Test propose **Dupliquer** : il suffit de changer la Formule de la cible.

#### L'attaque à distance de Shadowrun, en opposition

Dans Shadowrun, l'attaquant lance sa réserve de d6 (5 et 6 sont des succès) contre la réserve de défense de la cible. Il touche s'il obtient plus de succès qu'elle.

1. Créez le Jet « Réserve de d6 » : **Formule de dés** `(@test.reserve)d6cs>=5`.
2. Créez le Test « Défense » : dans **Entrées**, cliquez sur **Ajouter une entrée**, **ID de l'entrée** `reserve`, **Type de valeur** `integer`, **Source** **Formule** « Réserve de défense ». **Jet** : « Réserve de d6 ». **Cible** : **Pas de cible**.
3. Créez le Test « Attaque à distance » avec la même entrée `reserve`, de Source **Formule** « Réserve d'attaque », et le même Jet.
4. **Cible** : **En opposition à Défense**. La cible de l'Action joue alors le Test « Défense » avec ses propres valeurs, et son total devient la cible de l'attaque.
5. Ajoutez le Résultat « Touché » (Condition `variables.test.margin` **Supérieur à** `0`) et mettez « Raté » en **Résultat par défaut**. Une égalité va donc au défenseur.
6. Un Test qui est lui-même en opposition ne peut pas servir de défense.

#### Le dé critique de Cyberpunk RED

Dans Cyberpunk RED, on lance 1d10 + caractéristique + compétence. Un 10 naturel fait lancer un d10 de plus qui s'ajoute ; un 1 naturel fait lancer un d10 qui se retranche.

1. Créez les Jets « d10 » (`1d10`) et « d10 critique » (`1d10`), et les Conditions « 10 naturel » et « 1 naturel » sur `variables.test.natural`.
2. Créez la Formule « Réflexes + Armes de poing » (**Additionner** deux **Références**).
3. Dans **Tests**, cliquez sur **Créer**. **Nom** : « Tir à l'arme de poing ». **Jet** : « d10 ».
4. Dans **Jets supplémentaires**, cliquez sur **Ajouter un jet supplémentaire** : **Condition** « 10 naturel », **Jet** « d10 critique », **Effet sur le total** **Ajoute**.
5. Ajoutez-en un second : **Condition** « 1 naturel », **Jet** « d10 critique », **Effet sur le total** **Retranche**.
6. Dans **Calcul**, **Formule de bonus** : « Réflexes + Armes de poing ». **Cible** : **Valeur fixe**, puis **Valeur** `15` (une tâche difficile).
7. Ajoutez le Résultat « Réussite » (`variables.test.margin` **Supérieur à** `0`, car il faut battre la difficulté), avec « Échec » en **Résultat par défaut**.

## Règles (effets, actions, dés)

### Effets

Un Effet change une seule valeur modifiable d'une Définition : il la définit, lui ajoute, lui retire, la multiplie ou l'inverse. Dans la liste **Cible**, chaque valeur apparaît sous la forme « Nom · capacité · sortie », par exemple « Points de vie · pool · pool.current ». Un Effet ne fait rien seul : une Action le lance, comme effet ou comme coût.

#### Les dégâts d'arme de D&D 5e (critique et résistance)

Une épée longue inflige 1d8 + Force ; sur un critique on lance deux fois plus de dés, et une créature résistante n'en subit que la moitié.

1. Ouvrez **Règles > Effets**, créez un Effet et nommez-le « Dégâts d'épée longue ».
2. **Cible** : « Points de vie · pool · pool.current ». **S'applique à** : Cible.
3. **Opération** : Soustraire. **Source de valeur** : Jet de dés.
4. **Jet** : le Jet « 1d8 » (famille Jets).
5. **Multiplicateur de dés** : une Formule qui vaut 2 quand le résultat du Test est le critique, sinon 1 (famille Formules). Seuls les dés sont doublés, pas le bonus.
6. **Bonus au jet** : la Formule « Modificateur de Force ».
7. **Facteur après le jet** : une Formule qui vaut 0,5 si la cible résiste aux dégâts tranchants, sinon 1. Le résultat est arrondi à l'inférieur.
8. **Résultat minimal** : 0, pour qu'un gros malus ne transforme jamais les dégâts en soins.

#### Le rafraîchissement des points de Fate dans Fate

Au début d'une session, chaque personnage remonte ses points de Fate à sa valeur de Rafraîchissement.

1. Créez un Effet « Rafraîchir les points de Fate ».
2. **Cible** : « Points de Fate · pool · pool.current ». **S'applique à** : Soi.
3. **Opération** : Définir.
4. **Source de valeur** : Référence, puis **Référence** : « Rafraîchissement · value · value.final ». L'Effet lit la valeur finale, bonus compris.
5. Laissez **Definition choisie par** sur « La cible ci-dessus ».
6. Cochez cet Effet dans les **Effets** d'une Action « Début de session » (famille Actions), que le MJ lance sur chaque personnage.

#### La Chaleur de la bande dans Blades in the Dark

Un coup bruyant ajoute 2 de Chaleur, une jauge qui appartient à la bande et pas à un personnage.

1. Dans l'éditeur du Ruleset, rubrique **Ressources partagées**, cochez la Définition « Chaleur » sous **Ressources du monde**. Elle existe alors une seule fois pour toute la table.
2. Créez un Effet « Coup bruyant : +2 Chaleur ».
3. **Cible** : « Chaleur · pool · pool.current ». **S'applique à** : Monde.
4. **Opération** : Additionner. **Source de valeur** : Valeur littérale, **Valeur** : 2.
5. Si la Chaleur est une réserve bornée de 0 à 9, l'excédent est ramené à 9 : c'est le réglage par défaut **Au-dessus du maximum** « Ramener à la borne » de la réserve.
6. Cochez l'Effet dans l'Action « Payer le coup » (famille Actions).

### Actions

Une Action est ce qu'on déclenche depuis une feuille : elle vérifie ses **Conditions**, paie ses **Effets de coût**, fait son **Test (facultatif)**, puis applique ses **Effets**. Si une Condition est fausse, rien n'est écrit.

#### La Boule de feu de D&D 5e

Toutes les créatures de la zone subissent les mêmes 8d6 de feu, chacune fait sa propre sauvegarde et n'en subit que la moitié si elle réussit.

1. Créez l'Action « Boule de feu ». Dans **Conditions**, cochez « Reste un emplacement de niveau 3 » (famille Conditions).
2. **Effets de coût** : « Dépenser un emplacement de niveau 3 ». Il est payé une seule fois, même avec plusieurs cibles.
3. **Cibles** : « Chaque cible, mêmes dés ». Le jet de dégâts est partagé, le Test et les Effets se font pour chaque cible.
4. **Test (facultatif)** : « Sauvegarde de Dextérité contre le DD du lanceur » (famille Tests).
5. **Effets** : un Effet « Dégâts de feu » qui retire le Jet « 8d6 » des points de vie, avec un **Facteur après le jet** qui vaut 0,5 quand la sauvegarde est réussie (voir la famille Effets).
6. Laissez **Selon le résultat** sur « Appliquer les effets de l'Action » pour chaque résultat : c'est le facteur qui fait la différence.

#### La Seconde chance de Shadowrun

En dépensant un point d'Atout, le joueur relance tous les dés de sa réserve qui ne sont pas des succès (moins de 5).

1. Créez l'Action « Seconde chance ». **Conditions** : « Il reste de l'Atout ». **Effets de coût** : « Dépenser 1 Atout ».
2. Ouvrez la rubrique **Relance** et cochez **Relance une autre Action**.
3. Laissez **Garder les mêmes dés** décoché : on veut de nouveaux dés.
4. **Dés relancés** : « Seulement certains dés ». **Groupe de dés** : vide (tous les groupes).
5. **Dés qui montrent** : « en dessous de », **Valeur** : 5. **À la place, les fixer à** : « Les relancer ».
6. Dans **Actions qu'elle peut relancer**, cochez les Actions de test de compétence. Les succès déjà obtenus restent sur la table.
7. Pour interdire une deuxième relance, ajoutez une Condition qui lit `variables.reroll.count` (1 pour la première relance).

#### L'action de groupe de Blades in the Dark

Chaque membre de l'équipe lance, on garde le meilleur résultat, et le meneur prend 1 point de stress par membre qui a échoué.

1. Créez l'Action « Action de groupe ». Ouvrez la rubrique **Plusieurs acteurs**.
2. **Test de groupe** : le Test « Jet d'action » (famille Tests), avec ses Résultats réussite, réussite partielle et échec.
3. Cochez **L'acteur qui agit participe**. **Membres** : « Choisis à l'utilisation ».
4. **Test (facultatif)** : un Test « Résultat du groupe » sans Jet, dont la Formule du total lit `variables.group.best`, le meilleur total des membres.
5. **Effets** : « Stress du meneur », un Effet qui ajoute à la réserve de Stress (**S'applique à** : Soi) une Formule lisant `variables.group.outcomes.echec`, le nombre de membres qui ont échoué.

### Modificateurs

Un Modificateur ajuste la valeur finale d'une Définition (sa sortie « value.final ») sans toucher à sa valeur de base. Deux usages existent. Si aucune Action ne l'applique, il vaut partout, tant que ses **Conditions** sont vraies. Si une Action l'applique, il ne vaut que sur le personnage qui l'a reçu, pour la durée choisie dans l'Action.

#### Le sort Bouclier de D&D 5e

Bouclier donne +5 à la Classe d'armure jusqu'au début du prochain tour du lanceur.

1. Ouvrez **Règles > Modificateurs** et créez « Bouclier : +5 CA ».
2. **Cible** : « Classe d'armure · value · value.final ».
3. **Opération** : Ajouter. **Source de valeur** : Valeur littérale, **Valeur** : 5.
4. **Cumul** : « S'applique toujours ».
5. Dans l'Action « Lancer Bouclier » (famille Actions), cochez ce Modificateur sous **Modificateurs appliqués** et choisissez la Durée « Un round » dans **Durée des états** (famille Durées).
6. Le Modificateur va sur la cible de l'Action ; sans jeton ciblé, c'est le lanceur lui-même.

#### Les bonus de statut de Pathfinder 2

Deux bonus de statut ne se cumulent pas : avec Héroïsme (+2) et l'Hymne de courage (+1), seul le +2 compte.

1. Créez le Modificateur « Héroïsme ». **Cible** : « Attaque · value · value.final ». **Opération** : Ajouter, **Valeur** : 2.
2. **Cumul** : « Le plus élevé de son groupe ». **Groupe** : `statut`.
3. Créez « Hymne de courage » de la même façon, avec **Valeur** 1 et le même **Groupe** `statut`.
4. Faites de même pour les bonus de circonstance avec un groupe `circonstance` : les deux groupes s'ajoutent entre eux.
5. Chaque sort les applique par ses **Modificateurs appliqués** (famille Actions).
6. **Ordre d'application** règle le calcul quand une multiplication ou un plafond se mêle aux additions : les plus petits nombres passent d'abord.

#### L'encombrement de Warhammer Fantasy 4e

Un personnage qui porte plus que sa limite d'encombrement perd 1 point de Mouvement.

1. Créez la Condition « Surchargé » (famille Conditions) : la charge portée dépasse la limite calculée.
2. Créez le Modificateur « Surcharge ». **Cible** : « Mouvement · value · value.final ».
3. **Opération** : Soustraire. **Source de valeur** : Valeur littérale, **Valeur** : 1.
4. Dans **Conditions**, cochez « Surchargé ».
5. Ne le mettez dans aucune Action : il s'applique tout seul dès que la Condition est vraie, et disparaît quand le personnage pose son sac.
6. Pour garder un plancher, un second Modificateur avec l'opération « Au moins » et un **Ordre d'application** plus grand empêche le Mouvement de descendre sous le minimum.

### Durées

Une Durée dit combien de temps tient un état ou un Modificateur posé par une Action. On la choisit dans le champ **Durée des états** de l'Action, qui vaut pour tous les états et Modificateurs que cette Action applique. Laissé à « Jusqu'au retrait », l'état reste jusqu'à ce qu'une autre Action le retire.

#### Un round, pour le Bouclier de D&D 5e

Le +5 de Bouclier tombe au round suivant.

1. Ouvrez **Règles > Durées** et créez « Un round ».
2. **Mode** : « Durée fixe ».
3. **Quantité** : 1. **Unité** : Rounds.
4. Un round vaut la durée d'un round dans le monde Foundry : la Durée expire quand l'horloge du combat avance d'un round.
5. Choisissez cette Durée dans le champ **Durée des états** de l'Action « Lancer Bouclier » (famille Actions).

#### L'Invisibilité de Chroniques Oubliées

Le personnage reste invisible jusqu'à ce qu'il attaque.

1. Créez un Type d'événement « Attaque portée » (section Orchestration, famille Types d'événement).
2. Dans chaque Action d'attaque, cochez « Attaque portée » sous **Événements déclenchés**.
3. Créez la Durée « Jusqu'à la prochaine attaque ». **Mode** : « Jusqu'à un événement ». **Type d'événement** : « Attaque portée ».
4. Créez une Définition « Invisible » avec la capacité État (section Définitions).
5. Dans l'Action « Lancer Invisibilité », cochez « Invisible » sous **États appliqués** et choisissez cette Durée dans **Durée des états**.
6. Dès que l'invisible lance une attaque, l'événement met fin à l'état.

#### Gravement blessé dans Cyberpunk RED

Tant qu'il a moins de la moitié de ses points de vie, le personnage subit un malus de −2 à ses actions.

1. Créez la Condition « Sous la moitié des PV » (famille Conditions).
2. Créez la Durée « Tant que gravement blessé ». **Mode** : « Tant qu'une condition est vraie ». **Condition** : « Sous la moitié des PV ».
3. Créez l'état « Gravement blessé » (une Définition avec la capacité État) et le Modificateur « −2 aux actions » (famille Modificateurs).
4. Dans l'Action « Encaisser des dégâts », cochez l'état sous **États appliqués**, le Modificateur sous **Modificateurs appliqués**, puis choisissez cette Durée dans **Durée des états**.
5. La Condition est vérifiée quand l'heure du monde avance ou qu'un événement concerne le personnage : après des soins, l'état tombe à la vérification suivante.

### Dés

Un Dé a ses propres faces. Une **Lettre** le nomme dans les formules de Jet (`2dp` lance deux dés de lettre p). Ses **Compteurs** disent ce que comptent les faces (Succès, Avantage…). Dans une Formule ou une Condition, l'opérande « Dés du jet » puis « Compteur des faces » lit le total d'un compteur sur tous les dés lancés. Les dés qui partagent un même nom de compteur s'additionnent, et un compte négatif annule.

#### Les dés de capacité et de difficulté de Star Wars FFG

Le dé vert apporte des succès et des avantages, le dé violet des échecs et des menaces qui les annulent.

1. Ouvrez **Règles > Dés**, créez « Capacité ». **Lettre** : `a`.
2. **Compteurs** : ajoutez « Succès » et « Avantage ».
3. **Faces** : ajoutez 8 faces. Pour chacune, **Affichée comme** donne le symbole, et les champs Succès et Avantage donnent les comptes : vide, S, S, SS, A, A, SA, AA.
4. Créez « Difficulté », **Lettre** : `v`, avec les mêmes compteurs « Succès » et « Avantage ».
5. Ses 8 faces portent des comptes négatifs : vide, Échec (Succès −1), double Échec (Succès −2), trois faces Menace (Avantage −1), double Menace (Avantage −2), Échec et Menace (les deux à −1).
6. Le Jet (famille Jets) s'écrit par exemple `2da+2dv`, et un Résultat « Réussite » (famille Résultats) demande que le compteur Succès soit au moins à 1.

#### Le dé de stress d'Alien (Year Zero)

On lance des dés de base et des dés de stress ; chaque 6 est un succès, et un 1 sur un dé de stress déclenche la panique.

1. Créez le Dé « Base », **Lettre** `b`, avec un compteur « Succès ». Six faces : seule la sixième compte 1 Succès.
2. Créez le Dé « Stress », **Lettre** `s`, avec les compteurs « Succès » et « Panique ».
3. Sur le Dé de stress, la face 1 compte 1 Panique, la face 6 compte 1 Succès, les autres restent vides.
4. Le Jet s'écrit par exemple `4db+2ds` : les Succès des deux sortes de dés s'additionnent, car le compteur porte le même nom.
5. Une Condition « Panique » (famille Conditions) vérifie que le compteur Panique est au moins à 1 ; un Déclencheur ou un Résultat lance alors le jet de panique.

#### Le dé Marvel du Marvel Multiverse RPG

Le d616 se joue avec trois d6 dont celui du milieu est spécial : son 1 est la face Marvel, qui vaut 6 et peut donner une réussite fantastique.

1. Créez le Dé « Marvel », **Lettre** `m`, avec un compteur « Marvel ».
2. Ajoutez 6 faces. Sur la première, **Affichée comme** : « M », **Valeur** : 6, et le compteur Marvel à 1.
3. Laissez **Valeur** vide sur les faces 2 à 6 : elles valent leur rang (2, 3, 4, 5, 6).
4. Le Jet s'écrit `2d6+1dm` : la face Marvel ajoute bien 6 au total.
5. Le Résultat « Réussite fantastique » (famille Résultats) combine la réussite et un compteur Marvel au moins à 1.

### Tables

Une Table transforme un jet en résultat. On choisit son **Jet**, une **Formule de bonus** facultative, puis on décrit des **Lignes** : chacune couvre une plage (**De**, **À**, vides pour une plage ouverte), porte un **Résultat** et lance ses **Actions lancées**. Une Action tire sur la Table avec son champ **Puis tirer sur la Table**, après ses Effets.

#### Les blessures critiques de Warhammer Fantasy 4e

Un coup critique à la tête se résout sur une table d100 dont certaines lignes font saigner ou assomment la cible.

1. Ouvrez **Règles > Tables** et créez « Blessures critiques : tête ». **Jet** : « 1d100 » (famille Jets). **Formule de bonus** : « Aucun bonus ».
2. Ajoutez une ligne par plage du livre, par exemple **De** 1 **À** 10 avec son **Résultat**, et ainsi de suite jusqu'à 100.
3. Sur chaque ligne, cochez dans **Actions lancées** ce qu'elle provoque, par exemple une Action qui applique l'état « Hémorragie » à la cible.
4. Créez l'Action « Critique à la tête » avec **Puis tirer sur la Table** : cette Table.
5. Dans l'Action d'attaque, sous **Selon le résultat**, le résultat « Critique » coche « Critique à la tête » dans **Puis lancer ces Actions**.
6. Les plages ne doivent pas se chevaucher ; les textes du livre sont à saisir vous-même.

#### Les accès de folie de L'Appel de Cthulhu

Quand un investigateur craque, un d10 désigne la forme de sa folie passagère.

1. Créez la Table « Accès de folie ». **Jet** : « 1d10 ».
2. Ajoutez dix lignes d'une seule valeur (**De** 1 **À** 1, **De** 2 **À** 2…), chacune avec son **Résultat** : amnésie, paranoïa, fuite…
3. Pour les lignes qui ont un effet chiffré, cochez une Action dans **Actions lancées**, par exemple une Action qui applique l'état « Phobie ».
4. Créez l'Action « Folie temporaire » : **Puis tirer sur la Table** : « Accès de folie ».
5. Pour lancer la Table automatiquement, un Déclencheur (section Orchestration) peut lancer « Folie temporaire » quand l'événement « Perte de Santé mentale » arrive.

#### Le paquet de cartes d'initiative de Savage Worlds

Chaque round, on distribue une carte à chaque personnage, et un Joker donne un bonus.

1. Créez la Table « Paquet d'initiative ». **Jet** : « 1d54 » (le champ est obligatoire, mais l'initiative tire directement une ligne).
2. Ajoutez 54 lignes, une par carte, avec une valeur unique qui suit l'ordre des cartes, couleur comprise : du 2 de trèfle (**De** 1 **À** 1) à l'As de pique (52), puis les deux Jokers (53 et 54).
3. Sur les lignes des Jokers, cochez l'Action « Joker » dans **Actions lancées**.
4. Dans l'éditeur du Ruleset, rubrique **Initiative en combat**, choisissez cette Table dans **Jet d'initiative** et cochez **Relancer à chaque round**.
5. Une carte tirée ne revient pas dans le même round, comme un vrai paquet ; l'initiative vaut la borne de sa ligne.

### Échelles descriptives

Une Échelle descriptive remplace un nombre par des mots sur une feuille. On choisit ce que comparent ses plages (**Les plages comparent** : « la valeur » ou « le % du maximum »), puis on décrit ses **Paliers** (**De**, **À**, **Description**). On la lie ensuite à un type de Définition ou à une Définition (champ **Échelle descriptive**), et sur la feuille le bloc de valeur passe en **Affichage** « En description ».

#### L'état de santé de Real World Fantasy

Les autres joueurs ne voient pas la Vitalité d'un personnage, seulement son apparence.

1. Ouvrez **Règles > Échelles descriptives** et créez « État de santé ».
2. **Les plages comparent** : « le % du maximum ».
3. **Paliers** : 100 et plus « Semble en pleine forme », 75 à 99,99 « Un peu blessé », 50 à 74,99 « Blessé », 25 à 49,99 « Mal en point », 0,01 à 24,99 « État critique », jusqu'à 0 « Coma, mort ou stabilisé ».
4. Dans la Définition « Vitalité », champ **Échelle descriptive** : « État de santé ».
5. Sur la feuille, ajoutez un second bloc de Vitalité en **Affichage** « En description », **Visible par** les observateurs : eux lisent les mots, jamais le nombre.

#### L'échelle des adjectifs de Fate

Fate nomme chaque niveau : +4 se dit Excellent, 0 Médiocre, −1 Mauvais.

1. Créez l'Échelle « Échelle de Fate ». **Les plages comparent** : « la valeur ».
2. Un palier par niveau, avec la même valeur dans **De** et **À** : 8 « Légendaire », 7 « Épique », 6 « Fantastique », 5 « Superbe », 4 « Excellent », 3 « Bon », 2 « Correct », 1 « Moyen », 0 « Médiocre », −1 « Mauvais », −2 « Terrible ».
3. Laissez **À** vide sur Légendaire et **De** vide sur Terrible pour couvrir les valeurs extrêmes.
4. Liez l'Échelle au type de Définition « Compétence » : toutes les compétences en profitent. Une Définition peut garder « Celle de son type » ou en choisir une autre.
5. Sur la feuille, le bloc de chaque compétence en **Affichage** « En description » montre « Bon » au lieu de « 3 ».

#### Les caractéristiques de L'Appel de Cthulhu

Pour un PNJ, le MJ décrit la Force ou l'Intelligence en mots plutôt qu'en pourcentage.

1. Créez l'Échelle « Niveau de caractéristique ». **Les plages comparent** : « la valeur ».
2. **Paliers**, par exemple : jusqu'à 15 « Très faible », 16 à 40 « Faible », 41 à 60 « Moyen », 61 à 80 « Élevé », 81 à 95 « Remarquable », 96 et plus « Exceptionnel ».
3. Liez-la au type de Définition « Caractéristique ».
4. Sur la feuille des PNJ, montrez les caractéristiques en **Affichage** « En description » pour les joueurs (**Visible par**) et en nombre pour le MJ seul.
5. Pour l'état d'une jauge comme la Santé mentale, préférez « le % du maximum » : les mots suivent alors le maximum de chaque personnage.

## Orchestration

### Permissions

Une Permission décide qui peut lire, modifier ou exécuter quoi. Le MJ garde toujours tous les droits. Le moteur vérifie la lecture et la modification des Définitions, et l'exécution des Actions. La politique dont la portée est la plus précise décide : une Action ou une Définition précise, puis toutes les Actions ou toutes les Définitions, puis tout le Ruleset.

#### La société secrète de Paranoïa : une information que seul son joueur voit

Dans Paranoïa, chaque Clarificateur cache sa société secrète à ses coéquipiers, qui ne doivent pas la lire même s'ils voient sa feuille.

1. Dans la famille Permissions, créez une entrée et donnez-lui un **Nom**, par exemple « Société secrète cachée ».
2. Dans **Portée**, choisissez « Définition : Société secrète » (la Définition existe déjà dans la famille Définitions).
3. Laissez **Effet par défaut** sur « Refuser » et cochez **Activé**.
4. Sous **Règles**, cliquez sur **Ajouter une règle** : **Effet** « Autoriser », **Opérations** « Lire », **Propriété minimale** « Propriétaire ».
5. Les coéquipiers, qui n'ont que le niveau Observateur sur ce personnage, ne reçoivent plus cette valeur sur la feuille. Comme aucune règle n'autorise « Modifier », le joueur ne peut pas non plus la changer : seul le MJ le peut.

#### Le Mythe de Cthulhu de L'Appel de Cthulhu : une compétence que seul le Gardien fait monter

Le joueur ne s'attribue jamais de points de Mythe de Cthulhu : c'est le Gardien qui les accorde après une lecture ou une rencontre.

1. Créez une Permission nommée « Mythe réservé au Gardien », **Portée** « Définition : Mythe de Cthulhu », **Effet par défaut** « Refuser ».
2. Première règle : **Effet** « Autoriser », **Opérations** « Lire », **Propriété minimale** « Observateur ». Tous ceux qui voient la feuille lisent la valeur, comme d'habitude dans Foundry.
3. Deuxième règle : **Effet** « Refuser », **Opérations** « Modifier », **Rôles** « Joueur » et « Joueur de confiance », **Message en cas de refus** « Seul le Gardien accorde du Mythe de Cthulhu. »
4. Le joueur qui tente de changer la valeur voit ce message. Attention : le refus vaut aussi pour une Action lancée par le joueur qui écrirait dans cette Définition. Le gain de Mythe passe donc par une Action que le Gardien lance lui-même.

#### Secoué dans Savage Worlds : une Condition qui bloque les Actions, sauf une

Un personnage Secoué ne peut rien entreprendre, à part tenter de se reprendre avec un jet d'Âme.

1. Dans la famille Conditions, créez la Condition « Secoué », vraie quand le personnage porte l'état Secoué.
2. Créez une Permission « Secoué n'agit pas », **Portée** « Toutes les Actions », **Effet par défaut** « Autoriser ».
3. Ajoutez une règle : **Effet** « Refuser », **Opérations** « Exécuter », **Condition** « Secoué », **Message en cas de refus** « Vous êtes Secoué : reprenez-vous d'abord. »
4. Créez une seconde Permission « Se reprendre reste possible », **Portée** « Action : Se reprendre », **Effet par défaut** « Autoriser », sans règle.
5. Cette seconde politique vise une Action précise : sa portée est plus précise que « Toutes les Actions », c'est donc elle qui décide pour « Se reprendre ».

### Types d’événement

Un type d'événement décrit un fait du jeu. Une Action l'émet quand on le coche dans ses **Événements déclenchés** (famille Actions), et les Déclencheurs ou les Durées « Jusqu'à un événement » y réagissent. Quand c'est une Action qui l'émet, l'événement porte toujours l'Action utilisée et la clé du Résultat obtenu, et la section **Seulement si** d'un Déclencheur propose « Clé du Résultat ». Chaque champ ajouté sous **Champs du contenu événementiel** reçoit un identifiant tiré de son nom, affiché sur le champ : une Condition ou une Formule le lit dans event.payload.<identifiant>. L'Action qui émet l'événement remplit ces champs dans sa section **Contenu des événements émis**. Les rôles de l'événement sont ceux de l'Action : le Déclencheur choisit qui agit. Le module émet en plus ses propres événements de combat et de temps, sans rien créer.

#### Le repos long de D&D 5e : un événement qui met fin aux effets

Beaucoup d'effets de D&D 5e durent « jusqu'à la fin de votre prochain repos long ».

1. Dans la famille Types d’événement, créez une entrée de **Nom** « Repos long » et cochez **Activé**.
2. Ne mettez aucun champ sous **Champs du contenu événementiel** : le fait suffit.
3. Dans la famille Actions, ouvrez l'Action « Prendre un repos long » et cochez « Repos long » dans **Événements déclenchés**. L'événement concerne le personnage qui se repose.
4. Dans la famille Durées, créez « Jusqu'au repos long » avec le **Mode** « Jusqu'à un événement » et le **Type d’événement** « Repos long ». Chaque état qui utilise cette Durée prend fin quand le personnage se repose.

#### L'échec bestial de Vampire la Mascarade V5 : lire le Résultat dans l'événement

Quand un jet donne un échec bestial, la Bête prend le dessus et le personnage subit une Compulsion.

1. Créez le type d'événement « Jet résolu », sans champ.
2. Cochez « Jet résolu » dans les **Événements déclenchés** de chaque Action qui fait un Test avec des dés de Faim.
3. Dans la famille Résultats, l'échec bestial porte la **Clé de résultat** « echec-bestial ».
4. Créez un Déclencheur sur « Jet résolu » qui lance l'Action « Subir une Compulsion » (voir la famille Déclencheurs). Dans sa section **Seulement si**, choisissez **Champ de l'événement** « Clé du Résultat » et **Vaut** « echec-bestial ».
5. Un seul type d'événement sert ainsi à toutes les Actions et à tous les Résultats, sans créer de Condition.

#### La perte de Santé mentale de L'Appel de Cthulhu : un événement qui porte un nombre

Un investigateur qui perd 5 points de Santé mentale ou plus en un seul jet sombre dans une folie passagère.

1. Créez le type d'événement « Perte de Santé mentale ». Sous **Champs du contenu événementiel**, ajoutez le champ **Nom** « Perte », **Type de valeur** « integer ». Après l'enregistrement, le champ affiche son identifiant : perte.
2. Dans la famille Actions, ouvrez « Jet de Santé mentale » et cochez « Perte de Santé mentale » dans **Événements déclenchés**.
3. La section **Contenu des événements émis** apparaît : pour « Perte », choisissez la Formule « Perte subie », celle que l'Effet de l'Action retire déjà à la Santé mentale. Elle est calculée une fois les Effets appliqués. Un champ peut aussi prendre une **Valeur fixe**.
4. Dans la famille Conditions, créez « Grosse perte », vraie quand la **Valeur du contexte** event.payload.perte est supérieure ou égale à 5.
5. Créez le Déclencheur « Folie passagère » sur « Perte de Santé mentale », avec la Condition « Grosse perte » et l'Action « Folie temporaire » (voir la famille Tables). Pour une valeur exacte, la section **Seulement si** suffit : **Champ de l'événement** « Perte », **Vaut** « 5 ».

#### Les événements du module dans Real World Fantasy : combat et temps qui passe

Dans Real World Fantasy, chaque combattant perd 1 Endurance tous les trois rounds, et chaque journée qui passe rend 1 Vitalité.

1. Rien à créer dans Types d’événement : le module fournit « Début du combat », « Nouveau round », « Début de tour », « Fin du combat » et « Temps écoulé ». Ils apparaissent directement dans le champ **Type d’événement** d'un Déclencheur.
2. « Nouveau round » porte les champs Combat et Round ; « Début de tour » y ajoute Turn et ne concerne que le combattant dont c'est le tour.
3. « Temps écoulé » porte Seconds (le temps écoulé), Days (le nombre de minuits franchis) et World time.
4. Pour l'Endurance, la Condition « Tous les trois rounds » lit event.payload.round et vérifie que le reste de sa division par 3 vaut 0. Le Déclencheur « Essoufflement en combat » écoute « Nouveau round » avec cette Condition.
5. Pour la Vitalité, le Déclencheur « Récupération quotidienne » écoute « Temps écoulé » et lance l'Action « Récupérer ».
6. Pour une simple égalité, inutile de créer une Condition : la section **Seulement si** d'un Déclencheur accepte par exemple **Champ de l'événement** « Round », **Vaut** « 1 ».

### Déclencheurs

Un Déclencheur écoute un type d'événement, vérifie ses Conditions, puis lance ses Actions. Il choisit **Qui agit** (celui qui a causé l'événement, ou celui qui était visé), **Entendu par** (chaque personnage concerné, le combat ou le monde) et **Quand** (automatiquement, ou proposé au joueur dans une fenêtre de réaction).

#### Le sort Bouclier de D&D 5e : une réaction proposée au joueur

Quand une attaque le touche, le magicien peut dépenser sa réaction pour gagner +5 en CA, ce qui peut transformer la touche en échec.

1. Préparez dans la famille Actions l'Action « Bouclier » : dans **Relance**, cochez **Relance une autre Action** et **Garder les mêmes dés**, puis cochez « Attaque » dans **Actions qu'elle peut relancer**. Dans **Modificateurs appliqués**, cochez « Bouclier : +5 CA » ; ses **Effets de coût** dépensent la réaction et un emplacement de niveau 1.
2. L'Action « Attaque » coche le type d'événement « Attaque portée » dans ses **Événements déclenchés**.
3. Dans la famille Déclencheurs, créez « Réagir avec Bouclier » : **Type d’événement** « Attaque portée », **Qui agit** « Celui qui était visé (réaction) », **Entendu par** « Chaque personnage concerné », **Quand** « Proposé à qui agit ».
4. Dans **Seulement si**, choisissez **Champ de l'événement** « Clé du Résultat » et **Vaut** la clé du Résultat de touche, par exemple « touche ». Dans **Conditions**, cochez « Réaction disponible » et « Connaît Bouclier ». Ces Conditions lisent le défenseur comme self.
5. Dans **Actions**, cochez « Bouclier ».
6. En jeu, le joueur du défenseur voit la fenêtre « Réaction » avec un bouton « Bouclier » et un bouton « Laisser passer ». S'il choisit Bouclier, l'attaque est rejouée avec les mêmes dés contre la nouvelle CA.

#### L'Hémorragie de Warhammer Fantasy 4e : un effet automatique à chaque round

Un personnage qui saigne perd 1 point de Blessures à chaque round.

1. Dans la famille Actions, créez « Saigner », dont l'Effet retire 1 aux Blessures du personnage.
2. Dans la famille Conditions, créez « Saigne », vraie quand le personnage porte l'état Hémorragie.
3. Créez le Déclencheur « Hémorragie » : **Type d’événement** « Nouveau round », **Qui agit** « Celui qui a causé l'événement », **Entendu par** « Chaque personnage concerné », **Quand** « Automatiquement ».
4. Dans **Conditions**, cochez « Saigne » ; dans **Actions**, cochez « Saigner ».
5. Au changement de round, le module émet l'événement pour chaque combattant : seuls ceux qui saignent perdent un point, sans que personne ait à cliquer.
6. Pour un effet qui ne touche que le combattant actif, choisissez plutôt « Début de tour ».

#### Le calendrier de Mörk Borg : un compte à rebours tenu par le monde

Dans Mörk Borg, le monde court à sa fin : le MJ décompte en secret les jours avant la prochaine Misère.

1. Dans l'entrée du Ruleset, section **Ressources partagées**, cochez la Définition « Jours avant la Misère » dans **Ressources du monde**. Elle existe une seule fois pour toute la table, hors des personnages.
2. Dans la famille Formules, créez « Jours écoulés », qui lit la **Valeur du contexte** event.payload.days.
3. Dans la famille Effets, créez un Effet qui **S'applique à** « Monde », sur « Jours avant la Misère », avec l'opération « Soustraire » et la Formule « Jours écoulés » ; l'Action « Le temps passe » l'applique.
4. Créez le Déclencheur « Calendrier de Nechrubel » : **Type d’événement** « Temps écoulé », **Entendu par** « Le monde, une fois », **Quand** « Automatiquement », **Actions** « Le temps passe ».
5. Chaque fois que le MJ avance l'horloge du monde de Foundry, le compteur baisse du nombre de minuits franchis, une seule fois et non pour chaque personnage.
6. Pour une ressource propre à chaque combat, cochez-la dans **Ressources de chaque combat**, faites appliquer l'Effet à « Combat en cours » et choisissez **Entendu par** « Le combat, une fois » avec « Début du combat » ou « Nouveau round ».

## Systèmes

### Systèmes de création

#### L'achat de caractéristiques de D&D 5e

Le joueur dispose de 27 points pour acheter ses six caractéristiques, qui partent de 8 : chaque point jusqu'à 13 coûte 1, les points qui mènent à 14 et à 15 coûtent 2.

1. Dans la famille Formules (section Règles), créez « Coût d'un point d'achat ». Elle lit la « Valeur du contexte » `variables.allocation.point`, qui vaut 1 pour le premier point posé sur une caractéristique, 2 pour le deuxième, et ainsi de suite. Elle doit valoir 1 pour les points 1 à 5 et 2 pour les points 6 et 7. Le constructeur visuel ne fait qu'une opération par Formule : enchaînez donc de petites Formules qui calculent 1 + min(1, max(0, point − 5)).
2. Dans Systèmes de création, créez le système, donnez-lui un « Nom », puis cliquez sur « Ajouter une étape ».
3. Première étape, « Socle » : « Nature » content, « Source du Ruleset » Modèles de contenu, et dans « Modèles de contenu autorisés » un contenu qui donne les six caractéristiques à 8. Ce contenu se prépare dans la section Contenus.
4. Deuxième étape, « Caractéristiques » : « Nature » allocation, « Source du Ruleset » Définitions, puis cochez les six caractéristiques dans « Définitions autorisées ».
5. Réglez « Minimum » et « Maximum » sur 27 et « Coût de chaque point » sur la Formule de l'étape 1. Avec un coût, ces deux bornes comptent le coût total et non plus le nombre de points.
6. Réglez « Points par cible, au plus » sur 7 : aucune caractéristique ne peut alors dépasser 15.
7. Dernière étape, « Relecture » : « Nature » review, « Minimum » 0 et « Maximum » 0. Le joueur y relit son personnage avant « Créer le personnage ».

#### L'espèce et les caractéristiques tirées de Warhammer Fantasy 4e

L'espèce se tire sur une table (90 % d'humains, puis halflings, nains et elfes), et chaque caractéristique vaut la base de l'espèce plus 2d10.

1. Dans la section Contenus, donnez au type de contenu « Espèce » un champ numérique « chance ». Chaque espèce y porte son poids (90 pour Humain, 4 pour Halfling, 4 pour Nain, 1 pour chaque elfe) et donne ses caractéristiques à leur base, par exemple 20 pour un humain.
2. Dans la famille Jets (section Règles), créez un Jet « 2d10 ».
3. Étape « Espèce » : « Nature » content, « Source du Ruleset » Modèles de contenu, puis cochez les cinq espèces. Réglez « Minimum » et « Maximum » sur 1.
4. Réglez « Tirage aléatoire » sur « Tiré, modifiable » et écrivez `chance` dans « Chance selon le champ ». Le joueur clique sur « Tirer au hasard » et peut encore changer d'avis. Le bonus d'XP que Warhammer accorde à qui garde son tirage n'est pas calculé par l'étape : il se gère à part.
5. Étape « Caractéristiques » : « Nature » allocation, « Source du Ruleset » Définitions, puis cochez les dix caractéristiques dans « Définitions autorisées ».
6. Réglez « Tirage aléatoire » sur « Tiré, définitif » et « Jet pour chaque Definition » sur le Jet 2d10. Chaque caractéristique reçoit son propre jet, qui s'ajoute à la base donnée par l'espèce. Le joueur ne peut plus le changer, et les bornes « Minimum » et « Maximum » ne s'appliquent pas aux points tirés.

#### La création par carrières de Traveller

Le personnage enchaîne des termes de quatre ans : il choisit une carrière, lance sa survie, et ne commence un nouveau terme que s'il a survécu, avec au plus sept termes.

1. Dans la section Contenus, créez un contenu par carrière (Marine, Marchand, Éclaireur…). Chacun donne ses compétences et porte un champ numérique « survie », le seuil à atteindre.
2. Étape « Carrière » : « Nature » content, « Source du Ruleset » Modèles de contenu, cochez les carrières, puis réglez « Minimum » et « Maximum » sur 1.
3. Étape « Survie » : « Nature » roll et « Jet » 2d6, un Jet créé dans la famille Jets. Ses autres réglages disparaissent : une étape de jet se lance une fois.
4. Dans la famille Conditions, créez « A survécu ». Elle compare deux « Valeur du contexte » : `variables.creation.<identifiant de l'étape Survie>.total` doit être au moins égal à `variables.creation.<identifiant de l'étape Carrière>.fields.survie`.
5. Revenez sur l'étape « Survie », la dernière du bloc, et écrivez 2 dans « Répéter les dernières étapes ». « Carrière » et « Survie » forment alors un terme.
6. Réglez « Nombre de termes au plus » sur 7 et « Un autre terme tant que » sur la Condition « A survécu ».
7. Dans la fenêtre de création, le joueur voit « Terme 1 », puis clique sur « Un terme de plus » tant que la Condition reste vraie. Une étape facultative peut aussi porter une « Condition requise », par exemple une Condition qui lit `variables.term.index` pour n'intervenir qu'à partir du quatrième terme.

### Systèmes de progression

#### L'achat de points d'attribut avec l'XP dans Vampire la Mascarade V5

Monter un attribut coûte cinq fois le nouveau niveau en XP, sans dépasser 5.

1. Il faut une Definition « Expérience » dont la valeur de base ou la réserve sert de monnaie (section Définitions).
2. Dans la famille Formules, créez « Coût d'un attribut », qui multiplie la « Valeur du contexte » `variables.advance.next` (le niveau visé) par 5. Créez aussi une Formule « Cinq » qui vaut simplement 5.
3. Dans Systèmes de progression, créez le système, donnez-lui un « Nom », puis cliquez sur « Ajouter une amélioration ».
4. Remplissez « Libellé » (« Attribut »), puis « Augmente les Definitions du type » : Attribut. Laissez « Augmentée de » à 1.
5. « Payée avec » : l'Expérience. « Coût » : « Coût d'un attribut ». « Valeur maximale » : la Formule « Cinq ».
6. Ajoutez une seconde amélioration « Compétence » sur le type Compétence, avec une Formule de coût qui multiplie par 3.
7. Pour vérifier, ouvrez le Labo runtime, choisissez l'outil Progression et cliquez sur « Acheter ». Un refus explique si l'XP manque ou si la valeur est déjà au maximum.

#### Les points d'amélioration de Cyberpunk RED

Monter une compétence coûte 20 PA fois le niveau visé, et le double pour les compétences difficiles comme Autodéfense ou Pilotage.

1. Créez une Definition « Points d'amélioration » qui sert de monnaie. Rangez les compétences ordinaires dans un type Compétence et les compétences difficiles dans un type Compétence ×2 (section Définitions).
2. Créez deux Formules : l'une multiplie `variables.advance.next` par 20, l'autre par 40.
3. Première amélioration, « Compétence » : « Augmente les Definitions du type » Compétence, « Payée avec » Points d'amélioration, « Coût » la Formule ×20.
4. Seconde amélioration, « Compétence difficile » : « Augmente les Definitions du type » Compétence ×2 et « Coût » la Formule ×40. Pour viser seulement deux ou trois compétences précises, laissez le type vide et cochez-les dans « Ou ces Definitions ».
5. Réglez « Valeur maximale » sur une Formule qui vaut 10 dans les deux améliorations.
6. Le champ « Condition » d'une amélioration peut encore bloquer un achat, par exemple tant qu'une Condition « En période de repos » est fausse.

#### La montée de niveau de D&D 5e

À 300 XP, le guerrier passe niveau 2 et gagne Fougue, et au niveau 4 il choisit une amélioration de caractéristiques ou un don.

1. Dans la famille Conditions, créez « 300 XP ou plus », qui compare l'XP du personnage à 300, puis une Condition par seuil (900, 2 700…).
2. Dans le système de progression, cliquez sur « Ajouter un palier ».
3. « Libellé » : Niveau 2. « Atteint quand » : « 300 XP ou plus ». Dans « Donne », cochez la Definition « Fougue ».
4. Ajoutez un palier « Niveau 4 », « Atteint quand » sur la Condition des 2 700 XP. Dans « Puis lance », choisissez une Action « Amélioration ou don ». Ses choix, qui se règlent dans la famille Actions, laissent le joueur choisir.
5. Chaque palier ne s'applique qu'une fois par personnage. Dans le Labo runtime, « Appliquer les paliers atteints » applique d'un coup tous les paliers dont la Condition est devenue vraie.

### Feuilles

#### Les attributs en pastilles de Vampire la Mascarade V5

Les neuf attributs se lisent en pastilles de 1 à 5, et le joueur clique sur une pastille pour fixer le niveau.

1. Dans Feuilles, créez la feuille : « Nom », « Utilisée pour » Acteurs, puis cochez « Activé ».
2. Dans « Mise en page », ouvrez « Ajouter » et cliquez sur la famille Attributs, sous « Familles de Définitions ». Un bloc « Liste de Definitions » arrive dans la sélection.
3. Cliquez sur la liste et réglez « Colonnes » sur 3 pour obtenir les trois colonnes Physique, Social et Mental.
4. Cliquez sur la valeur de la ligne : « Affiche » La Definition de la ligne, « Laquelle » sa valeur.
5. « Affichage » : Pastilles. Si le type Attribut porte une borne maximale de 5, les pastilles s'arrêtent d'elles-mêmes à 5. Sinon, réglez « Pastilles (sans maximum) » sur 5.
6. « Couleur des pastilles » : Danger, pour un rouge sang. Dans « Sur la feuille », cochez « Saisie libre » : un clic sur une pastille fixe le niveau.
7. Sur la section qui contient la liste, donnez un « Titre » et une « Icône », par exemple `fa-solid fa-droplet`, avec « Libellé affiché » Icône et texte.

#### Les points de vie et l'état « en sang » de D&D 5e

Le joueur et le MJ voient la jauge exacte des points de vie, tandis qu'un autre joueur voit seulement des mots comme « En sang ».

1. Dans la famille Échelles descriptives (section Règles), créez une échelle dont « Les plages comparent » le % du maximum. Ajoutez des paliers avec « De », « À » et « Description » : « Indemne » de 100, « Blessé » de 50 à 99,99, « En sang » de 0,01 à 49,99, « À terre » jusqu'à 0. Choisissez-la dans le champ « Échelle descriptive » de la Definition Points de vie.
2. Sur la feuille, ajoutez une valeur : « Affiche » Une sortie de Definition, « Laquelle » le réservoir actuel des points de vie.
3. « Affichage » : Jauge. « Couleur de la jauge » : Danger, « Dégradé vers » : Réussite.
4. « Sur la feuille » : cochez « Peut être augmentée » et « Peut être diminuée ». La feuille montre alors − et + autour de la jauge.
5. « Visible par » : gardez « Les joueurs (propriétaires) » et « Le MJ », décochez « Les observateurs ».
6. Ajoutez une deuxième valeur sur la même réserve, avec « Affichage » En description et « Visible par » réduit aux « Les observateurs ». Le nombre ne leur est jamais envoyé.
7. Dans la barre d'outils, « Voir comme » Un observateur permet de vérifier ce qu'il verra.

#### La feuille de bande de Blades in the Dark

La bande a sa propre feuille, distincte de celle des scoundrels, et c'est le MJ qui tient sa Chaleur.

1. Créez deux feuilles d'Acteur : « Feuille de scoundrel » et « Feuille de bande ».
2. Sur la feuille de bande, ajoutez une valeur sur la Chaleur (une réserve de maximum 9), avec « Affichage » Pastilles.
3. « Sur la feuille » : cochez « Peut être augmentée » et « Peut être diminuée ». « Modifiée par » : cochez « Le MJ seulement ». Les joueurs voient la Chaleur, mais seul le MJ a les − et +.
4. Ajoutez un « Bouton d'Action » vers une Action « Acquérir un atout » (famille Actions), avec une « Icône » `fa-solid fa-coins`.
5. Dans Foundry, ouvrez l'Acteur de la bande, puis la configuration de la feuille dans son en-tête. Choisissez « Feuille de bande » : chaque feuille activée y est proposée sous son nom.
6. L'entrée générique « Feuille Rule Them'All » prend la première feuille activée qui convient. Pour la bande, choisissez donc la feuille par son nom.

## Organisation

### Catégories

#### Les écoles de magie de D&D 5e

Chaque sort appartient à une école (Abjuration, Évocation, Nécromancie…), ce qui permet de retrouver vite les sorts d'un magicien spécialisé.

1. Dans Catégories, créez une catégorie par école : remplissez « Nom », et si besoin « Description » dans « Notes ».
2. Ouvrez chaque sort, qui est un modèle de contenu (section Contenus). Dans « Catégories », cherchez l'école avec « Rechercher des catégories… » et cochez-la.
3. Dans la liste des sorts, la zone « Filtrer » montre une puce par école, avec une icône de dossier et le nombre de sorts. Cliquez sur « Évocation » pour ne garder que ces sorts, puis sur « Effacer les filtres » pour tout revoir.
4. Une catégorie sert seulement à ranger : aucune Formule ni Condition ne la lit.

#### Les compétences de base et avancées de Warhammer Fantasy 4e

Les compétences de base s'utilisent sans formation, alors que les compétences avancées demandent une formation.

1. Créez deux catégories, « Compétences de base » et « Compétences avancées ».
2. Ouvrez chaque compétence dans la section Définitions et cochez la bonne catégorie dans « Catégories ».
3. Dans la liste des Définitions, les puces de « Filtrer » séparent les deux groupes. C'est pratique pour vérifier qu'aucune compétence n'a été oubliée.
4. Les catégories se posent seulement sur les Définitions et les modèles de contenu, et n'ont pas de couleur. Pour marquer d'autres objets ou colorer, utilisez les Tags.

#### Les familles de cyberware de Cyberpunk RED

Le catalogue de cyberware se range par emplacement : Cybermembres, Neuralware, Cyberoptiques, Mode interne, Mode externe.

1. Créez une catégorie par famille de cyberware.
2. Sur chaque implant (un modèle de contenu), cochez sa famille dans « Catégories ». Un implant peut en avoir plusieurs si besoin.
3. Avec des dizaines d'implants, filtrez par « Neuralware » avant d'ajuster les prix ou la perte d'Humanité d'une seule famille.
4. Si une règle doit dépendre de la famille, par exemple un plafond d'implants neuraux, portez l'information dans un champ du type de contenu (section Contenus). Les Formules lisent les champs, pas les catégories.

### Tags

#### Concentration et Rituel dans D&D 5e

Certains sorts demandent de la concentration, d'autres peuvent se lancer en rituel, et le MJ veut les repérer d'un coup d'œil.

1. Dans Tags, créez « Concentration » et « Rituel ». Donnez à chacun une « Couleur » en cochant « Personnaliser », si le Ruleset autorise les couleurs propres dans la section Organisation.
2. Ouvrez chaque sort concerné et cochez le tag dans « Tags ». Cherchez-le avec « Rechercher des tags… ».
3. Dans la liste des sorts, chaque carte montre ses tags en couleur. Les puces de « Filtrer » permettent de ne garder que les sorts à concentration.
4. Comme une catégorie, un tag ne change pas les règles. Pour qu'un sort à concentration se termine quand on en lance un autre, il faut une vraie règle, avec des Déclencheurs et des Durées.

#### Les grands domaines de Shadowrun

Shadowrun mêle magie, Matrice et riggers, et un même domaine touche des Définitions, des Actions, des Tests et des Effets.

1. Créez les tags « Magie », « Matrice » et « Rigging », chacun avec sa couleur.
2. Sur une Formule, une Condition ou un Test, ouvrez « Notes et étiquettes » et cochez le tag dans « Tags ». Les modèles de contenu ont leur liste « Tags » directement dans l'éditeur.
3. Contrairement aux catégories, les tags se posent sur presque tous les objets du Ruleset. Les catégories et les tags eux-mêmes n'en portent pas.
4. Dans Dépendances (section Outils), « Filtrer par tags » sur « Matrice » ne garde que les objets de ce domaine, ce qui aide à mesurer une refonte.

#### Le contenu tiers de Mörk Borg

Mörk Borg a une immense scène de suppléments tiers, et le MJ veut savoir d'un coup d'œil ce qui vient du livre de base.

1. Créez un tag « Contenu tiers » de couleur vive, et un tag « À relire » pour le travail en cours.
2. Cochez « Contenu tiers » sur chaque classe, arme ou sort venu d'un supplément.
3. Avant une partie « livre de base seulement », filtrez la liste sur « Contenu tiers » pour désactiver ces objets un par un (case « Activé »).
4. Le tag « À relire » sert de liste de tâches. Le Ruleset de Real World Fantasy fait de même avec un tag « Image à produire » sur les contenus sans illustration.


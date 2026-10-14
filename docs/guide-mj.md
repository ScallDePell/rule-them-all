# Rule Them'All : guide du MJ

Rule Them'All est un module Foundry VTT v14. Il permet de décrire les règles d'un jeu de rôle dans un **Ruleset**, puis de les jouer dans n'importe quel monde, quel que soit le système de jeu installé. Le module ne remplace pas le système : il range ses propres données dans les flags des Acteurs et des Objets, et propose ses feuilles à côté de celles du système.

Ce guide suit l'ordre d'une mise en place : installer, construire ou importer un Ruleset, le publier, l'activer, puis jouer.

Des exemples pas à pas, famille par famille et tirés de jeux connus, sont dans [exemples-configuration.md](exemples-configuration.md).

## 1. Installer et ouvrir le module

1. Installez le module, puis activez-le dans le monde (Gérer les modules).
2. Ouvrez **Paramètres du jeu → Configurer les paramètres → Rule Them'All → Ouvrir Rule Them'All**. Seul un MJ peut configurer.

La fenêtre qui s'ouvre est le **Configurateur**. Elle liste les Rulesets du monde, puis donne accès au contenu de celui que vous choisissez.

## 2. Les versions d'un Ruleset

Un Ruleset a une ou plusieurs versions. Chaque version a un statut :

| Statut | Ce qu'on peut faire |
| --- | --- |
| **Brouillon** | Tout modifier. Un brouillon peut être incomplet ; il n'est pas jouable. |
| **Publiée** | Jouable. On peut encore la modifier : la publication garde le même identifiant, les Acteurs restent liés. |
| **Validée** | Figée, en lecture seule. Pour la changer, créez une nouvelle version. |

Les actions sur une version :
- **Publier** vérifie que rien ne manque. La rubrique Général affiche ce qui reste à compléter ; un clic sur un point ouvre le champ à corriger.
- **Activer** choisit la version jouée dans le monde. Une seule version est active à la fois.
- **Exporter** télécharge la version en JSON ; **Importer** (depuis la liste des Rulesets) la recharge dans un autre monde.
- **Créer une nouvelle version** repart d'une version existante.

### Passer les Acteurs sur une nouvelle version

Quand vous remplacez une version par une autre (par exemple en important RWF 1.3.0 à la place de 1.2.0) :
1. importez la nouvelle version, publiez-la si besoin, puis activez-la ;
2. ouvrez chaque Acteur : sa feuille propose **Passer sur …** dans son en-tête. Le module garde ce que la nouvelle version définit encore, retire le reste et accorde ce que les Contenus détenus accordent désormais ;
3. supprimez l'ancienne version une fois les Acteurs passés.

Si vous supprimez l'ancienne version d'abord, la feuille de l'Acteur l'indique et propose le même bouton.

## 3. Construire un Ruleset

Le Configurateur range le Ruleset en rubriques. Chaque élément est une carte : un clic l'ouvre, un **clic droit** propose Éditer, Dupliquer (le nom de la copie est demandé) et Supprimer (avec confirmation, et le détail de ce qui l'utilise).

### Définitions
- **Types de définition** : les familles du jeu (caractéristiques, compétences, ressources, états…). Un type fixe les capacités de ses Définitions (une valeur, une réserve, un état…), et peut porter des **bornes de valeur** (minimum et maximum, fixes ou calculés par une Formule).
- **Définitions** : chaque élément d'une famille (Force, Escalade, Points de vie…). Une Définition peut remplacer les bornes de son type.

### Contenus
- **Types de contenu** : armes, pouvoirs, origines, équipements… Un Contenu devient un Objet Foundry quand un Acteur le reçoit.
- **Contenus** : les éléments eux-mêmes. Ils accordent des Définitions, des états, des modificateurs, et peuvent poser des choix à l'acquisition.

### Règles
- **Paramètres** : des constantes du Ruleset (un plafond, un coût).
- **Formules** et **Sorties dérivées** : les calculs (une valeur finale, un bonus, un seuil).
- **Conditions** : des tests vrai/faux (« l'Acteur est un PJ », « la cible est à portée »).
- **Jets**, **Résultats** et **Tests** : comment on lance les dés et comment on lit le résultat (réussite, échec, degrés).
- **Effets**, **Modificateurs** et **Durées** : ce qui change sur un Acteur, et combien de temps.
- **Actions** : ce que l'on fait depuis une feuille (attaquer, lancer un sort, se reposer). Une Action enchaîne Test, Effets, choix après le résultat, relances.
- **Dés** : des dés propres au jeu, lancés par leur lettre (par exemple `2dp`).
- **Tables** : des tirages au hasard.
- **Échelles descriptives** : des mots à la place d'un nombre (« En pleine forme », « Gravement blessé »).

### Orchestration
- **Permissions** : qui peut lire, modifier ou utiliser quoi (MJ, propriétaire, observateur).
- **Types d'événement** et **Déclencheurs** : réagir à ce qui arrive en jeu (début de combat, nouveau round, temps qui passe, résultat d'une Action). Un déclencheur peut proposer une réaction au joueur concerné.

### Systèmes
- **Systèmes de création** : la création de personnage, étape par étape (choix, répartition de points, jet, récapitulatif). Voir la section 5.
- **Systèmes de progression** : l'avancement (dépense d'expérience, paliers).
- **Feuilles** : les feuilles de personnage et d'objet. Voir la section 4.

### Organisation et outils
- **Catégories** et **Tags** : pour classer et filtrer les cartes.
- **Dépendances** : le graphe de ce qui utilise quoi, pratique avant une suppression.
- **Labo runtime** : un bac à sable du MJ pour essayer une Action, un Test ou une Formule sur un Acteur, sur le brouillon, sans toucher au jeu.

## 4. Les feuilles

### Éditeur de feuilles
Dans **Systèmes → Feuilles**, créez une feuille d'Acteur ou d'Objet (pour des Types de contenu précis, ou pour tous). L'éditeur montre la feuille telle qu'en jeu :
- la **palette** à gauche ajoute des blocs (sections, onglets, grilles, listes d'une famille de Définitions, valeurs, jauges, pastilles, boutons d'Action, images, textes) par clic ou glisser-déposer ;
- le **panneau de propriétés** règle le bloc choisi : libellé, icône Font Awesome (texte, icône ou les deux), affichage (champ, jauge, pastilles, description), ce que le joueur peut changer (saisir, augmenter, diminuer), **Visible par** (joueur, observateur, MJ) et **Modifiée par : le MJ seulement**, couleurs, police, marges ;
- **Voir comme** montre la feuille telle que la verra un joueur, un observateur ou le MJ ;
- **Mise en page automatique** repart d'une feuille tirée des Définitions.

### Choisir la feuille d'un Acteur
Chaque feuille activée du Ruleset actif apparaît sous son nom dans **Configuration de la feuille** (en-tête de la fenêtre de l'Acteur ou de l'Objet). Vous pouvez donc avoir plusieurs feuilles de PJ, une feuille de PNJ, une feuille de créature, et choisir pour chaque Acteur, ou par défaut pour un type d'Acteur.

« Feuille Rule Them'All » n'apparaît que là où le Ruleset n'a pas de feuille à lui ; elle construit alors une feuille automatique.

## 5. Créer un personnage

Le bouton de création se trouve dans l'onglet **Acteurs**. Le joueur suit les étapes du Système de création ; sa progression est gardée s'il ferme la fenêtre. Un Acteur vide ouvert avec une feuille Rule Them'All propose aussi la création.

## 6. En jeu

- Les **boutons d'Action** de la feuille lancent l'Action, demandent ses entrées s'il y en a, et postent une carte dans le chat. Les choix après le résultat sont proposés dans une fenêtre.
- Les **valeurs** se changent sur la feuille dans les limites du Ruleset (bornes, permissions). Un joueur qui modifie un Acteur qu'il ne possède pas passe par le MJ connecté.
- Glisser un **Objet** sur la feuille le donne à l'Acteur ; un Contenu du Ruleset pose alors ses choix et accorde ce qu'il accorde. Le retirer reprend ce qu'il avait accordé.
- Le **combat** : l'initiative du Ruleset, ses passes et l'ordre du round sont gérés par le traqueur de combat de Foundry.
- Le **temps du monde** fait expirer les états à durée.

## 7. Mettre à jour le module

Certaines mises à jour changent la façon dont le module range ses données. Le module ne lit alors plus l'ancien format et l'indique au MJ au chargement. Convertissez le monde une fois, dans la console Foundry (F12), en MJ :

```js
const {convertWorld} = await import("/modules/rule-them-all/tools/convert-stored-data.mjs");
await convertWorld();               // vérifie seulement
await convertWorld({write: true});  // télécharge une sauvegarde, puis convertit
```

Rechargez ensuite le monde.

## 8. Pour les autres modules

L'API est disponible sous `game.modules.get("rule-them-all").api` (et `game.ruleThemAll`) :
- `configurator` : lire et modifier les Rulesets ;
- `runtime` : l'état des Acteurs, les Actions, les Tests ;
- `content` : donner et retirer des Contenus ;
- `creation` : les créations de personnage en cours.

Le hook `ruleThemAllReady` signale que tout est prêt.

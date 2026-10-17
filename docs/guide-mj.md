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
- **Tags** : pour classer et filtrer les cartes. Un clic droit sur une carte, puis **Tags…**, coche ses tags ou en crée un nouveau.
- **Dépendances** : le graphe de ce qui utilise quoi, pratique avant une suppression.
- **Labo runtime** : un bac à sable du MJ pour essayer une Action, un Test ou une Formule sur un Acteur, sur le brouillon, sans toucher au jeu.

## 4. Les feuilles

### Éditeur de feuilles
Dans **Systèmes → Feuilles**, créez une feuille d'Acteur ou d'Objet (pour des Types de contenu précis, ou pour tous). L'éditeur montre la feuille telle qu'en jeu. Sa fenêtre est partagée en **trois zones séparées par un trait vertical**, toute la hauteur, chacune avec son propre défilement ; les boutons (Supprimer, Annuler, Appliquer, Enregistrer et quitter) restent en bas :
- **à gauche, les outils**, en trois onglets : **Bloc** (les réglages du bloc choisi), **Ajouter** (la palette) et **Thème** (le thème de la feuille) ;
- **au centre, la feuille** : la ligne repliable **Fiche** (nom, utilisée pour, en-tête, fenêtre, description, fichier, activée ; ouverte à la création, repliée ensuite), puis une barre qui reste en haut quand la feuille défile (barre d'outils, **Voir comme**, **Aperçu** et le bouton **?** de l'aide), puis la feuille elle-même ;
- **à droite, les Calques** : l'arbre des blocs de la feuille.

On fait glisser le trait entre un panneau et la feuille pour régler sa largeur (un double-clic lui rend la sienne), et son bouton cache ou montre le panneau ; ce choix est gardé pour toutes les feuilles. Dans une fenêtre moins large, les Calques passent sous les outils ; dans une fenêtre étroite, tout s'empile en une seule colonne. Une feuille d'une version validée n'a que la zone centrale.

Au survol, un contour léger montre le bloc qu'un clic choisira, sur la feuille et dans les Calques. Un **clic droit** sur un bloc le choisit et propose ses commandes (copier, coller, dupliquer, pinceau, renommer, enregistrer comme modèle, style par défaut, supprimer). Un **double-clic** sur un bloc ouvre l'onglet **Ajouter** pour y ajouter un bloc.
- la **palette** (onglet Ajouter) ajoute des blocs (sections, onglets, grilles, listes d'une famille de Définitions, valeurs, jauges, pastilles, boutons d'Action, Systèmes de progression, images, textes) par clic ou glisser-déposer ; elle indique dans quel bloc le clic ajoute ;
- les **réglages du bloc** (onglet Bloc) commencent par un fil d'Ariane (Feuille › Onglets › Personnage › …) dont chaque étape choisit ce parent, puis se rangent en groupes repliables : **Contenu** (ouvert : libellé, source, ce que le joueur peut changer…), **Affichage** (icône Font Awesome, texte, icône ou les deux, champ, jauge, pastilles, largeur, infobulle…), **Accès** (**Visible par** joueur, observateur, MJ ; **Modifiée par : le MJ seulement** ; **Seulement si**) et **Style** (couleurs, police, marges) ;
- la **barre d'outils**, en groupes : monter et descendre | **copier**, **coller**, **dupliquer** | **pinceau** | supprimer | **annuler** et **rétablir** ; à côté, **Voir comme** montre la feuille telle que la verra un joueur, un observateur ou le MJ ;
- **Copier / coller** : un bloc copié garde ses enfants et son style ; collé, il va dans le bloc choisi si c'est un conteneur qui l'accepte, sinon juste après. Le presse-papiers sert pour toutes les feuilles ouvertes pendant la session, même d'un autre Ruleset : un bloc qui utilise une Définition, une Formule, une Action… absente de ce Ruleset (ou un champ de Contenu sur une feuille d'Acteur) est refusé avec un message ;
- le **pinceau de style** prend le style du bloc choisi ; chaque bloc cliqué ensuite le reçoit (ce que son genre de bloc ne peut pas porter est laissé de côté). Échap ou un nouveau clic sur le pinceau le repose ;
- les **Calques** (zone de droite) listent les blocs en arbre ; deux blocs au même nom affichent ce qui les distingue (« Vitalité · jauge »), et de petits symboles signalent un bloc caché à certains (œil barré), conditionnel (filtre) ou modifié par le MJ seul (cadenas). Un clic choisit un bloc, un double-clic renomme un onglet, une section, une valeur ou un bouton, la flèche replie ce qu'un conteneur contient, et on fait glisser une ligne pour déplacer le bloc (haut ou bas de la ligne : à côté ; milieu d'un conteneur : dedans) ;
- **raccourcis clavier** (hors champ de saisie) : Ctrl+C, Ctrl+V, Ctrl+D (dupliquer), Ctrl+Z, Ctrl+Y ou Ctrl+Maj+Z (rétablir), Suppr, flèches haut et bas (déplacer), F2 (renommer), Échap (ne plus rien choisir) ;
- **Aperçu** (dans la barre au-dessus de la feuille) : fenêtre étroite, taille de la fenêtre de la feuille, ou toute la largeur ;
- **Fenêtre (px)** : la largeur et la hauteur à l'ouverture de la feuille en jeu (vide : taille de Foundry).

Une nouvelle feuille démarre vide.

### En-tête, nom et images
- L'option **En-tête** de la feuille vaut **Standard** (l'image et le nom en haut, comme d'habitude) ou **Aucun** : vous placez alors vous-même les blocs **Nom** et **Portrait** (groupe « Nom et images » de la palette) où vous voulez, avec le style que vous voulez. Sur une feuille d'Acteur, le bloc **Image du token** montre l'image que prend son token sur la scène. Dans l'éditeur, ces deux blocs montrent une silhouette d'exemple.
- En jeu, un **cadenas** dans l'en-tête de la fenêtre verrouille la feuille, comme les feuilles de Foundry. Verrouillée (à l'ouverture), on joue : nom et images ne bougent pas. Déverrouillée, le nom se modifie et le bouton **appareil photo** en bas à droite d'un portrait ouvre le sélecteur de fichiers de Foundry. Les valeurs de la feuille restent utilisables dans les deux cas. Seuls ceux qui peuvent modifier l'Acteur ou l'Objet voient le cadenas.
- Pour l'image du token, cochez **Mettre aussi à jour les tokens déjà posés** dans les réglages du bloc : les tokens de l'Acteur déjà sur les scènes changent avec lui.
- Un Type de contenu ou un Type de définition dont vous décochez **Proposé dans l'éditeur de feuilles** (Créature, PNJ…) n'apparaît plus dans la palette ; les blocs déjà posés continuent de marcher.

### Modèles de blocs
- Choisissez un bloc (une section de caractéristiques, un bloc d'arme…), puis le **signet** à côté de son nom dans ses réglages : **Enregistrer comme modèle** demande un nom. Le modèle appartient au Ruleset : il apparaît dans le groupe **Modèles** de la palette de toutes ses feuilles qui peuvent l'accueillir (un modèle avec une image de token ne va que sur une feuille d'Acteur, un modèle de champs de Contenu que sur une feuille d'Objet ou dans des cartes).
- Un clic sur un modèle l'ajoute dans le bloc choisi, ou faites-le glisser sur la feuille. Le bloc posé est une **copie indépendante** : changer l'un ne change ni le modèle ni les autres copies.
- Les petits boutons d'un modèle dans la palette le **renomment**, l'**exportent** dans un fichier ou le **suppriment**. Un modèle refusé à l'insertion dit ce qui manque (une Définition supprimée, un champ absent de la feuille…).
- Une Définition, une Formule ou une Action utilisée par un modèle ne peut pas être supprimée : le contrôle de suppression cite le modèle, comme pour une feuille.

### Contenus en cartes
Un bloc **Contenus détenus** s'affiche **en liste** ou **en cartes** (réglage **Affichage**). En cartes, chaque Contenu prend :
- **Image, nom et champs choisis** : son image, son nom et les champs que vous cochez dans **Champs affichés** ;
- ou un **modèle de carte** : un modèle de blocs fait de champs de Contenu, de blocs Nom et Portrait (qui montrent alors le Contenu, pas l'Acteur), de textes, d'images. Faites-le sur une feuille d'Objet, enregistrez-le comme modèle, puis choisissez-le dans **Carte**. Un modèle qui dessine des cartes ne peut pas être supprimé tant qu'une feuille l'utilise.
Chaque carte garde ses boutons **Ouvrir** et **Retirer**.

### Thème de la feuille
L'onglet **Thème** des outils habille toute la feuille : **Parchemin**, **Gothique**, **Science-fiction** ou **Sobre** (les couleurs de Foundry, des cadres fins). Pour cette feuille, vous pouvez ensuite changer la couleur de la page, des sections, du texte, des titres, des cadres et des champs (la flèche revient à celle du thème), la police du texte et des titres (les polices de Foundry et celles ajoutées dans ses réglages de polices), et poser un **cadre des sections** en image.

**Vos propres thèmes** : **Enregistrer comme thème** garde l'aspect montré sous un nom, dans le Ruleset. Ce thème apparaît alors dans la liste **Thème** de toutes les feuilles du Ruleset, après ceux du module ; une feuille qui le prend peut encore changer une couleur pour elle seule. Quand une feuille utilise l'un de vos thèmes, trois boutons le **renomment**, l'**exportent** dans un fichier ou le **suppriment** (la feuille garde alors son aspect). Enregistrer sous le nom d'un thème existant le met à jour pour toutes les feuilles qui le prennent. **Importer un thème…** ajoute un thème exporté d'un autre Ruleset. Un thème utilisé par une feuille enregistrée ne peut pas être supprimé, et une feuille exportée emporte le thème qu'elle prend.
Un **cadre image** se pose aussi sur un seul bloc (groupe **Style** de ses réglages) : choisissez l'image, la **découpe des bords** (combien de pixels de chaque bord de l'image forment le cadre, 30 par défaut) et l'**épaisseur** (fin, moyen, large). L'image doit être un cadre dont le centre est vide ou uni.

### Exporter et importer une feuille
La ligne **Fichier** des réglages de la feuille **exporte** la feuille (mise en page, thème, réglages et modèles de cartes qu'elle utilise) dans un fichier JSON, et en **importe** une, par exemple depuis un autre Ruleset. Si le fichier utilise des éléments absents de ce Ruleset, ils sont listés et vous pouvez importer sans les blocs qui les utilisent. Un modèle de blocs s'importe de même depuis le groupe **Modèles** de la palette. Vérifiez la feuille importée puis enregistrez ; **Annuler** rétablit l'ancienne mise en page.

### Mise en page et blocs dynamiques
- **Image de fond** d'une section, d'une grille ou d'un onglet (groupe Style) : **Affichage de l'image** vaut Couvrir, Contenir, Étirer, Taille d'origine ou Mosaïque, et **Position de l'image** Centre, Haut, Bas, Gauche ou Droite.
- **Zone de texte** (groupe Champs) : un texte libre de plusieurs lignes gardé sur l'Acteur (notes, historique). **Texte simple** ou **Texte enrichi** (l'éditeur de Foundry : gras, liens, @UUID, jets en ligne), une hauteur, **Visible par**, et **Modifiée par : le MJ seulement**. L'écriture suit les Permissions du Ruleset comme une valeur. Pas sur une feuille d'Objet ni dans une liste.
- **Séparateur** (groupe Mise en page) : un trait, un ornement ou une image.
- **Plus de réglages** (replié, pour tout bloc) : **Lignes occupées** (dans une grille), **Largeur fixe** (petite, moyenne, grande) et **Info-bulle** : un texte libre, ou pour une valeur, la **Description de la Définition**.
- Une section peut être **Repliable** : son titre la replie en jeu, et chaque joueur retrouve ses sections comme il les a laissées.
- **Superposer les blocs** (section, grille) : les blocs s'empilent au même endroit, en haut, au centre ou en bas, par exemple une valeur posée sur une image.
- **Visible si** : le bloc ne s'affiche que quand une Condition est vraie pour l'Acteur (dans une liste : pour chaque ligne). Dans l'éditeur, un tel bloc apparaît atténué.
- **Insérer une valeur** (bloc Texte) : choisissez une valeur, une Formule ou un Paramètre ; son nom s'ajoute entre accolades, par exemple « Défense {Défense} », et la feuille montre le nombre à sa place. Effacer le nom du texte retire la valeur.
- **Au clic : lancer** (valeur, texte, image, liste) : un clic sur le libellé, le texte, l'image ou le nom d'une ligne lance l'Action choisie, pour ceux qui ont le droit de l'utiliser.
- **Cases** et **Horloge** (groupe Champs) : une valeur affichée en cases à cocher ou en horloge à segments ; leur nombre vient du maximum de la valeur, sinon du réglage du bloc.

### Choisir la feuille d'un Acteur
Chaque feuille activée du Ruleset actif apparaît sous son nom dans **Configuration de la feuille** (en-tête de la fenêtre de l'Acteur ou de l'Objet). Vous pouvez donc avoir plusieurs feuilles de PJ, une feuille de PNJ, une feuille de créature, et choisir pour chaque Acteur, ou par défaut pour un type d'Acteur.

« Feuille Rule Them'All » n'apparaît que là où le Ruleset n'a pas de feuille à lui ; elle construit alors une feuille automatique.

## 5. Créer un personnage

Le bouton de création se trouve dans l'onglet **Acteurs**. Le joueur suit les étapes du Système de création ; sa progression est gardée s'il ferme la fenêtre. Un Acteur vide ouvert avec une feuille Rule Them'All propose aussi la création.

## 6. En jeu

- Les **boutons d'Action** de la feuille lancent l'Action, demandent ses entrées s'il y en a, et postent une carte dans le chat. Les choix après le résultat sont proposés dans une fenêtre.
- Le bloc d'un **Système de progression** montre ce que l'Acteur peut acheter (niveau actuel et visé, coût, monnaie dépensée) avec un bouton par achat, puis ses paliers et le bouton « Appliquer les paliers atteints ». Le joueur achète lui-même, sans passer par le Labo runtime. Quand une permission du Ruleset le laisse acheter pour un Acteur qu'il ne possède pas, l'achat passe par le MJ connecté. Un observateur voit les coûts sans les boutons.
- Les **valeurs** se changent sur la feuille dans les limites du Ruleset (bornes, permissions). Un joueur qui modifie un Acteur qu'il ne possède pas passe par le MJ connecté.
- Glisser un **Objet** sur la feuille le donne à l'Acteur ; un Contenu du Ruleset pose alors ses choix et accorde ce qu'il accorde. Le retirer reprend ce qu'il avait accordé.
- Le **combat** : l'initiative du Ruleset, ses passes et l'ordre du round sont gérés par le traqueur de combat de Foundry.
- Les **ressources partagées** (fiche du Ruleset, bloc « Combat et ressources partagées ») : des valeurs tenues une seule fois pour la partie (réserve du MJ, horloges) ou pour chaque combat (dé d'escalade). Le bouton **Ressources partagées** du traqueur de combat les montre à tous ; le MJ les modifie avec − / +.
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

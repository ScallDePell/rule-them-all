# SRD 5.2 (5e édition, règles 2024) 1.0.0

Ruleset des règles révisées de la 5e édition (2024), tirées du System Reference Document 5.2, pour Rule Them'All. Les textes sont traduits en français. Téléchargez [srd-5.2-ruleset-1.0.0.json](srd-5.2-ruleset-1.0.0.json), puis importez-le dans le configurateur avec le bouton **Importer**. Il arrive comme un nouveau Ruleset, prêt à publier.

Il demande Rule Them'All 1.0.6 ou plus récent, qui donne à un monstre glissé depuis son compendium les valeurs et les objets de son modèle. Il n'a pas de feuille de personnage : la feuille générique « Rule Them'All » affiche ses valeurs, ses actions et sa progression, et vous pouvez dessiner la vôtre dans Configurateur > Feuilles.

## Contenu

| Collection | Nombre |
|---|---|
| Définitions | 662 : 6 caractéristiques avec leurs modificateurs et sauvegardes, 18 compétences, 14 états et l'Épuisement, 13 types de dégâts (résistance, vulnérabilité, immunité), 15 immunités d'état, 32 valeurs dérivées, 22 ressources, 4 tailles de dés de vie, 10 réserves d'emplacements, 12 niveaux de classe, 299 aptitudes de classe, de sous-classe et d'espèce, dons, styles de combat, 37 outils, 19 langues |
| Formules, Conditions, Tests | 299, 462, 46 |
| Actions, Effets, Déclencheurs | 156, 129, 6 |
| Contenus | 1 842 : 339 sorts, 12 classes (et leur version multiclasse), 9 espèces et 24 lignages, 4 historiques, 6 dons d'origine, 38 armes, 13 armures et boucliers, 131 objets, 261 objets magiques, 17 lots d'équipement de départ, 341 créatures avec 440 attaques et 193 capacités à jet de sauvegarde |
| Création, Progression | 1 création en 13 étapes, la progression « Niveaux » (niveaux 1 à 20, multiclasse) |

## Règles couvertes

- **Tests de d20 :** caractéristique, compétence (maîtrise, Expertise, Touche-à-tout), outil, sauvegarde, contre un DD demandé à chaque jet. L'Avantage et le Désavantage viennent des états, des sorts et des aptitudes, plus le choix du MJ à chaque jet (aide, abri, idée astucieuse). −2 par niveau d'Épuisement. Chance du halfelin, Inspiration bardique, Inspiration héroïque (relance).
- **Création :** classe (compétences et équipement de départ ou or), historique (+2/+1 ou +1/+1/+1, don d'origine, compétences, outil, deux langues, équipement), espèce, lignage quand l'espèce en a un, don d'origine en plus pour un humain, puis les caractéristiques : achat de 27 points (le tableau standard 15, 14, 13, 12, 10, 8 coûte exactement 27) ou tirage 4d6 en gardant les trois meilleurs.
- **Niveaux :** l'expérience donne le niveau maximal (300 PX pour le niveau 2, 355 000 pour le 20). « Prendre un niveau » dans la progression ajoute un niveau de classe, puis « Appliquer les étapes atteintes » donne les aptitudes, la sous-classe au niveau 3, l'Amélioration de caractéristique ou un don, l'Expertise, les styles de combat, l'Ordre divin ou primitif. Les points de vie suivent : maximum du dé de vie de la classe de départ au niveau 1, puis la moyenne arrondie au supérieur, + Constitution par niveau. Le bonus de maîtrise passe de +2 à +6.
- **Multiclasse :** ajoutez l'objet « Classe (multiclasse) » au personnage. Il refuse l'ajout si le personnage n'a pas 13 dans la caractéristique principale de la nouvelle classe et de celles déjà prises. Il donne les maîtrises réduites, puis les niveaux se prennent dans la progression. Les emplacements suivent la table du lanceur multiclassé, à part la magie de pacte.
- **Classe d'armure :** armure légère, intermédiaire (Dextérité 2 au plus) ou lourde équipée, sinon 10 + Dextérité ou la Défense sans armure (barbare, moine), Armure du mage, Résilience draconique ; + bouclier, objets magiques, style Défense, sorts (Bouclier, Bouclier de la foi, Hâte, Lenteur, Peau d'écorce). Une armure lourde sans la Force demandée retire 3 m de Vitesse.
- **Attaques :** jet de d20 contre la CA de la cible (+2 ou +5 d'abri), 1 naturel raté, 20 (ou le seuil de Critique amélioré) critique qui double les dés. Arme : Force, Dextérité à distance, la meilleure avec Finesse ; maîtrise de l'arme ; Polyvalente à deux mains ; attaque de la main secondaire avec une arme légère ; styles Archerie, Arme à deux mains, Combat à deux armes ; Attaque sournoise une fois par tour ; Rage, Frénésie, Frappes radieuses, Faveur divine, Marque du chasseur, Maléfice, Tueur de colosses, Ennemi juré. Bottes d'arme automatisées : Renversement, Sape, Ralentissement, Ouverture, Écorchure.
- **Dégâts :** résistance (moitié), vulnérabilité (double), immunité, Rage contre les dégâts contondants, perforants et tranchants, Pétrifié. Les points de vie temporaires absorbent d'abord. À 0 : un personnage tombe Inconscient et fait ses jets contre la mort au début de son tour (10 ou plus, 1 compte double, 20 rend 1 PV, trois réussites stabilisent, trois échecs tuent) ; un monstre meurt. Dégâts massifs. Endurance implacable de l'orc. Médecine pour stabiliser, soins qui réveillent.
- **Concentration :** un sort de concentration la donne au lanceur ; des dégâts demandent une sauvegarde de Constitution (DD 10 ou la moitié des dégâts, 30 au plus) ; tomber à 0 y met fin.
- **Magie :** emplacements de sort par niveau de lanceur, magie de pacte (repos court), DD et attaque des sorts. Chaque sort lance une action selon ce qu'il fait : attaque de sort, sauvegarde (moitié des dégâts quand il le dit), dégâts automatiques, soins, état infligé, ou utilitaire. L'emplacement choisi augmente les dégâts et les soins comme le dit le sort ; les sorts mineurs grandissent aux niveaux 5, 11 et 17. Rituels sans emplacement. Points de sorcellerie et conversion d'emplacements, Restauration arcanique.
- **Ressources de classe :** Rage, Inspiration bardique, Conduit divin, Forme sauvage, Second souffle, Fougue, Inflexible, points de focalisation du moine, Imposition des mains, Ennemi juré, points de sorcellerie, Astuce magique, et les réserves des espèces (Souffle draconique, Poussée d'adrénaline). Chacune revient au repos court ou long comme le dit sa classe.
- **Repos :** repos court (ressources du repos court, dés de vie dépensés un par un : dé + Constitution) et repos long (tous les PV et dés de vie, emplacements, ressources, un niveau d'Épuisement en moins, PV temporaires perdus, Inspiration héroïque du Débrouillard).
- **Initiative :** 1d20 + Dextérité (+ bonus de maîtrise avec Vigilant), Avantage si Invisible, Désavantage si surpris ou Neutralisé ; départage par la Dextérité.
- **Actions de base :** Esquiver, Se désengager, Foncer, Aider, Se cacher (Discrétion DD 15), Agripper et Pousser (sauvegarde contre 8 + Force + maîtrise), Se dégager, Se relever, Stabiliser.
- **Bestiaire :** chaque créature arrive avec les valeurs de son bloc de statistiques (caractéristiques, sauvegardes et compétences maîtrisées, CA, PV, Vitesse, vision dans le noir, bonus de maîtrise), ses résistances et immunités, ses attaques et ses capacités à sauvegarde en objets avec leur action, et ses sorts. Un monstre lance ses sorts sans emplacement. Le texte complet du bloc (traits, actions, actions bonus, réactions, actions légendaires) est dans sa description.
- **Outils du MJ :** infliger des dégâts d'un type, rendre des PV, donner des PV temporaires, infliger ou retirer un état (refusé si la cible y est immunisée), Épuisement (mort au niveau 6), donner des PX, l'Inspiration héroïque, surprendre.

## Laissé au MJ

- **Texte seulement :** les aptitudes, sorts et dons dont l'effet n'est ni des dégâts, ni des soins, ni un état, ni un des bonus listés plus haut. Leur texte complet est sur la Définition ou l'objet.
- **Monstres :** recharge (5–6) et utilisations par jour, Attaques multiples, actions légendaires, Résistance légendaire et réactions ne sont pas décomptées. Une capacité à sauvegarde ne garde que deux types de dégâts.
- **Sorts préparés :** ajoutez les objets de sort au personnage ; le nombre de sorts préparés et de sorts mineurs de chaque classe est une valeur calculée qui sert de repère.
- **Sorts de lignage :** ils arrivent dès la création ; leur description dit à partir de quel niveau ils se lancent.
- **Tirage des caractéristiques :** un tirage sous 8 compte pour 8, parce que le tirage s'ajoute aux 8 du socle.
- **Historique :** le +2 et le +1 doivent aller à deux caractéristiques différentes, et 20 reste le maximum ; la création ne le vérifie pas.
- **Hors règles automatisées :** attaques d'opportunité et autres réactions (lancez l'attaque), déplacement, portée, taille, chute (infliger des dégâts), voyage, lumière et vision, charge transportée.

## Licence

This work includes material from the System Reference Document 5.2 ("SRD 5.2") by Wizards of the Coast LLC, available at https://www.dndbeyond.com/srd. The SRD 5.2 is licensed under the Creative Commons Attribution 4.0 International License, available at https://creativecommons.org/licenses/by/4.0/legalcode.

Les données du SRD viennent de [5e-bits/5e-database](https://github.com/5e-bits/5e-database) (dossier `src/2024`). La traduction française de [sources/fr.json](sources/fr.json) et l'adaptation sont distribuées sous la même licence CC-BY-4.0.

## Régénérer

[outils/build-srd.mjs](outils/build-srd.mjs) produit le Ruleset à partir des fichiers JSON du SRD 5.2 de 5e-bits (qui ne sont pas dans le dépôt) et de la traduction :

```
node outils/build-srd.mjs <dépôt rule-them-all> <dossier des 5e-SRD-*.json> sources/fr.json .
node outils/verify-srd.mjs <dépôt rule-them-all> srd-5.2-ruleset-1.0.0.json
```

`verify-srd.mjs` rejoue la création (achat de points et tirage), les niveaux 1 et 2, la CA, les attaques et critiques, la chute à 0 et les jets contre la mort, les dégâts massifs, les résistances, les sorts et leurs emplacements, les repos, la Rage, l'Attaque sournoise, les soins, la concentration, l'initiative, le souffle et les sorts d'un dragon, les 12 classes du niveau 1 au niveau 20 et les 341 créatures.

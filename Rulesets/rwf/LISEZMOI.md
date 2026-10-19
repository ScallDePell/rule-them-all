# Real World Fantasy 2.6.0

Ruleset complet de Real World Fantasy pour Rule Them'All. Téléchargez [rwf-ruleset-2.6.0.json](rwf-ruleset-2.6.0.json), puis importez-le dans le configurateur avec le bouton **Importer**. Il arrive comme un nouveau Ruleset, prêt à publier. Pour y passer vos personnages d'une version précédente, suivez « Passer les Acteurs sur une nouvelle version » du [guide du MJ](../../docs/guide-mj.md).

Il demande Rule Them'All 1.0.17 ou plus récent : 1.0.9 pour les munitions des armes et les passes de combat, 1.0.10 pour afficher les longues descriptions des états observables, 1.0.17 pour marquer vaincu dans le suivi de combat un combattant à 0 de Vitalité.

## Contenu

| Collection | Nombre |
|---|---|
| Types de définition | 11 |
| Définitions | 90 : 5 caractéristiques, 15 compétences, 7 maîtrises de combat, 11 maîtrises de déplacement, 3 ressources, Protection, Défense, 7 états, 32 pratiques, les statuts Personnage joueur et En combat, 6 compteurs de combat et de poursuite |
| Paramètres, Formules, Conditions | 39, 69, 30 |
| Tests | 16 : caractéristique, compétence ou maîtrise, compétence demandée par le MJ, initiative, attaques, rafale, pouvoir, Se cacher contre Repérer, 6 tests de poursuite |
| Actions, Effets, Déclencheurs | 41, 33, 6 |
| Contenus | 461 : Socle humain, 4 tranches d'âge, 32 Parcours, 35 backgrounds, 46 événements de vie, points martiaux, permis B, 16 armes, 79 équipements, 23 véhicules, 46 pouvoirs, 25 profils PNJ, 79 créatures, 10 animaux, 61 Fantaisies |
| Échelles descriptives | 41 : une par caractéristique, compétence, maîtrise et ressource (états observables) |
| Création, Progression, Feuille | 1 parcours en 14 étapes, la progression par la pratique, la feuille de PJ |

## Règles couvertes

- **Tests :** 1d20 + caractéristique + compétence ou maîtrise contre la DD (13 par défaut, demandée à chaque test). Un 20 naturel est un critique, un 1 une complication.
- **Dés sur la table :** les tests, attaques, pouvoirs et poursuites demandent en option le d20 lancé sur la table, et les attaques et pouvoirs les dégâts lancés. Laissés vides, Foundry lance les dés. Au critique, les dégâts annoncés comptent double.
- **Création :** Socle, tranche d'âge, puis ses effets (une personne âgée répartit +2 sur Esprit et Présence et −2 sur Force, Agilité et Constitution), Parcours, puis un écran pour ses compétences et maîtrises, backgrounds, puis un écran pour leurs compétences, événements de vie, puis un écran pour leurs choix, passé quand aucun n'en propose. Viennent ensuite le point martial, le permis B, et les points libres de caractéristiques et de compétences.
- **Combat :** initiative 1d20 + Agilité + Esprit, relancée à chaque round, Agilité puis Esprit en cas d'égalité. En combat, une maîtrise de 0 à 2 donne une attaque par round, de 3 à 4 deux, à 5 trois. Le round se joue en passes 1, 2, 3 dans le traqueur de combat : chacun joue autant de passes que sa meilleure maîtrise lui donne d'attaques, et une seule attaque, un sprint ou un rechargement par passe, pendant son tour. Défense = 10 + Agilité + Protection, réduite par la perforation, plus la couverture. Un critique double les dés de dégâts et inflige une Blessure. À 0 de Vitalité, le combattant est marqué vaincu dans le suivi de combat, et ne l'est plus s'il remonte au-dessus. Chaque round n'est compté qu'une fois par personnage (compteur « Round compté ») : un round annoncé deux fois ne fait pas perdre deux fois d'Endurance.
- **Munitions :** chaque tir d'une arme à chargeur consomme une munition ; chargeur vide, il faut **Recharger**, qui prend une passe et charge min(chargeur − munitions, réserve). Une arme automatique **tire une rafale** (3 munitions, +2) ou **en full-auto** (une rafale à chaque passe ; à la dernière, une maîtrise qui ne donne qu'1 ou 2 attaques perd 3 munitions de plus par le recul).
- **Santé :** à 0 Vitalité, Hors de combat puis Stabilisé, Coma ou Mort au choix du MJ. 1 Vitalité est récupérée par jour qui passe.
- **Endurance :** un round où l'on attaque au contact (mêlée, mains nues) ou sprinte est un effort physique, comme chaque action de poursuite à pied ; au troisième effort, −1 Endurance. **Reprendre son souffle** (en combat, sans avoir attaqué ni fait d'effort ce round) prend le round et rend ¼ de l'Endurance maximale. Malus physique selon l'Endurance restante. À 0, le personnage est à bout de souffle : il passe automatiquement en **Incapacité physique** (plus de course, de sprint ni d'attaque physique) jusqu'à un long repos.
- **Progression par la pratique :** seul un test de compétence demandé par le MJ rapporte de la pratique. Le MJ le demande avec le module RWF tools, qui lance l'Action « Test demandé par le MJ » sur son client avec le d20 du joueur ; un joueur ne peut pas la lancer lui-même. Une réussite rapporte 1 point de pratique, un critique 2 ; un échec ou un jet libre depuis la feuille ne rapporte rien. Les DD proposés au MJ sont les paramètres marqués « Difficulté de test » (Facile 10, Standard 13, Difficile 16, Extrême 19, Héroïque 22). En combat engagé, chaque attaque réussie compte. La pratique paie le niveau suivant : 5, 10, 20, 40 puis 80 points, divisés par le multiplicateur d'apprentissage de la tranche d'âge. Le reliquat reste acquis, et la valeur plafonne à 5 pour un PJ. Course à pied donne sa pratique à Athlétisme.
- **Poursuites :** chaque poursuivant a son écart avec le fuyard qu'il chasse, de −3 (rattrapé) à +3 (le poursuivant est semé), qui part de 0. Chacun garde sa propre part de l'écart (« Progression de poursuite ») : l'écart entre un poursuivant et sa cible est la part du fuyard plus celle du poursuivant. **Continuer**, **Prise de risque** (−2) ou **Raccourci** (+2) testent la maîtrise du véhicule (ou Course à pied) avec sa maniabilité, à DD 13 : 2 sur un critique, 1 sur une réussite, −1 sur un échec et −2 sur une complication, plus l'avantage de vitesse annoncé. Un fuyard l'ajoute à sa part, et s'éloigne ainsi de tous ses poursuivants ; un poursuivant le retire de la sienne (entrée « Rôle dans la poursuite » à −1), et ne se rapproche que de sa cible. **S'arrêter** fait perdre 1 à celui qui s'arrête. À pied, la vitesse vaut −1 sur l'échelle des véhicules (paramètre « Vitesse de la course à pied » : un vélo vaut 0).
- **Pouvoirs et Fantaisies :** Énergie payée avant le test, pouvoir latent révélé quand l'Esprit atteint son seuil, dégâts réduits par l'armure.
- **États observables :** chaque caractéristique, compétence et maîtrise a une phrase par niveau (0 à 5, de 1 à 5 pour une caractéristique) qui dit ce que l'on perçoit du personnage ; chaque ressource en a une par tranche de son maximum (0 %, 1–25 %, 26–50 %, 51–75 %, 76–99 %, 100 %). Elles viennent du catalogue de l'auteur, [sources/etats-observables.json](sources/etats-observables.json). Occultisme n'y figure pas : sa formulation est proposée dans `outils/build-rwf.mjs`, à remplacer. La feuille les montre dans l'onglet **États observables**, et sous les jauges de Santé ; un observateur lit ces phrases à la place des jauges de Vitalité, d'Endurance et d'Énergie. Un PNJ au-delà de 5 garde la phrase du niveau 5.
- **Plafonds :** un personnage joueur a ses caractéristiques de 1 à 5, ses compétences et maîtrises de 0 à 5. Les PNJ et les créatures n'ont pas de plafond.

## Laissé au MJ

- **Blessure grave sur des dégâts d'au moins 75 % de la Vitalité maximale :** le MJ l'inflige depuis ses actions de la feuille. Le critique, lui, blesse automatiquement.
- **Fin d'une poursuite :** quand l'écart d'un poursuivant atteint −3 (cible rattrapée) ou +3 (il est semé), le MJ annonce l'issue (le HUD Poursuite de RWF tools le fait).
- **Avantage de vitesse :** annoncé à chaque test de poursuite. **Attaque d'opportunité** pendant un rechargement, et vitesse limitée par le terrain : au MJ.

## Régénérer

[outils/build-rwf.mjs](outils/build-rwf.mjs) produit le Ruleset à partir du système RWF v0.1.475 (ses constantes de règles seulement) et du RWF Super Pack v0.4.1, deux archives qui ne sont pas dans le dépôt :

```
node outils/build-rwf.mjs <dépôt rule-them-all> <dossier du système RWF> <dossier du Super Pack> <dossier de sortie>
node outils/verify-rwf.mjs <dépôt rule-them-all> rwf-ruleset-2.6.0.json
node outils/verify-all.mjs <dépôt rule-them-all> rwf-ruleset-2.6.0.json
```

`verify-rwf.mjs` rejoue la création, l'âge, les tests, les armes, les pouvoirs, la pratique, le combat (passes, munitions, rafales, essoufflement, dés annoncés) et les poursuites, et les états observables de la feuille. `verify-all.mjs` acquiert les 461 contenus. Les corrections apportées au Super Pack sont listées dans [build-report.json](build-report.json).

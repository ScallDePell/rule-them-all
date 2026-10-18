# Real World Fantasy 2.1.0

Ruleset complet de Real World Fantasy pour Rule Them'All. Téléchargez [rwf-ruleset-2.1.0.json](rwf-ruleset-2.1.0.json), puis importez-le dans le configurateur avec le bouton **Importer**. Il arrive comme un nouveau Ruleset, prêt à publier. Pour y passer vos personnages de la 2.0.0, suivez « Passer les Acteurs sur une nouvelle version » du [guide du MJ](../../docs/guide-mj.md).

Il demande Rule Them'All 1.0.5 ou plus récent, pour l'étape « Choix des contenus » de la création.

## Contenu

| Collection | Nombre |
|---|---|
| Types de définition | 11 |
| Définitions | 86 : 5 caractéristiques, 15 compétences, 7 maîtrises de combat, 11 maîtrises de déplacement, 3 ressources, Protection, Défense, 7 états, 32 pratiques, les statuts Personnage joueur et En combat, 2 compteurs de combat et de poursuite |
| Paramètres, Formules, Conditions | 35, 58, 19 |
| Tests | 15 : caractéristique, compétence ou maîtrise, compétence demandée par le MJ, initiative, attaques, pouvoir, Se cacher contre Repérer, 6 tests de poursuite |
| Actions, Effets, Déclencheurs | 35, 16, 5 |
| Contenus | 461 : Socle humain, 4 tranches d'âge, 32 Parcours, 35 backgrounds, 46 événements de vie, points martiaux, permis B, 16 armes, 79 équipements, 23 véhicules, 46 pouvoirs, 25 profils PNJ, 79 créatures, 10 animaux, 61 Fantaisies |
| Création, Progression, Feuille | 1 parcours en 14 étapes, la progression par la pratique, la feuille de PJ |

## Règles couvertes

- **Tests :** 1d20 + caractéristique + compétence ou maîtrise contre la DD (13 par défaut, demandée à chaque test). Un 20 naturel est un critique, un 1 une complication.
- **Création :** Socle, tranche d'âge, puis ses effets (une personne âgée répartit +2 sur Esprit et Présence et −2 sur Force, Agilité et Constitution), Parcours, puis un écran pour ses compétences et maîtrises, backgrounds, puis un écran pour leurs compétences, événements de vie, puis un écran pour leurs choix, passé quand aucun n'en propose. Viennent ensuite le point martial, le permis B, et les points libres de caractéristiques et de compétences.
- **Combat :** initiative 1d20 + Agilité + Esprit, relancée à chaque round, Agilité puis Esprit en cas d'égalité. En combat, une maîtrise de 0 à 2 donne une attaque par round, de 3 à 4 deux, à 5 trois (passes 1 / 2 / 3). Un sprint utilise aussi une attaque. Défense = 10 + Agilité + Protection, réduite par la perforation, plus la couverture. Un critique double les dés de dégâts et inflige une Blessure.
- **Santé :** à 0 Vitalité, Hors de combat puis Stabilisé, Coma ou Mort au choix du MJ. 1 Vitalité est récupérée par jour qui passe.
- **Endurance :** essoufflement tous les trois rounds de combat, malus physique selon l'Endurance restante, incapacité physique à 0, long repos.
- **Progression par la pratique :** seul un test de compétence demandé par le MJ rapporte de la pratique. Le MJ le demande avec le module RWF tools, qui lance l'Action « Test demandé par le MJ » sur son client avec le d20 du joueur ; un joueur ne peut pas la lancer lui-même. Une réussite rapporte 1 point de pratique, un critique 2 ; un échec ou un jet libre depuis la feuille ne rapporte rien. Les DD proposés au MJ sont les paramètres marqués « Difficulté de test » (Facile 10, Standard 13, Difficile 16, Extrême 19, Héroïque 22). En combat engagé, chaque attaque réussie compte. La pratique paie le niveau suivant : 5, 10, 20, 40 puis 80 points, divisés par le multiplicateur d'apprentissage de la tranche d'âge. Le reliquat reste acquis, et la valeur plafonne à 5 pour un PJ. Course à pied donne sa pratique à Athlétisme.
- **Poursuites :** une jauge de −3 à +3 par personnage. **Continuer**, **Prise de risque** (−2) ou **Raccourci** (+2) testent la maîtrise du véhicule (ou Course à pied) avec sa maniabilité, à DD 13. La jauge avance de +2 sur un critique, +1 sur une réussite, −1 sur un échec et −2 sur une complication, plus l'avantage de vitesse annoncé. **S'arrêter** retire 1.
- **Pouvoirs et Fantaisies :** Énergie payée avant le test, pouvoir latent révélé quand l'Esprit atteint son seuil, dégâts réduits par l'armure.
- **Plafonds :** un personnage joueur a ses caractéristiques de 1 à 5, ses compétences et maîtrises de 0 à 5. Les PNJ et les créatures n'ont pas de plafond.

## Laissé au MJ

- **Blessure grave sur des dégâts d'au moins 75 % de la Vitalité maximale :** le MJ l'inflige depuis ses actions de la feuille. Le critique, lui, blesse automatiquement.
- **Munitions et rafales :** les armes portent leurs champs Chargeur, Munitions et Réserve, qui se modifient sur la feuille. Ils ne sont pas décomptés automatiquement.
- **Fin d'une poursuite :** quand la jauge atteint ±3, le MJ annonce l'issue.
- **Récupération d'essoufflement sur un round de repos :** non automatisée.

## Régénérer

[outils/build-rwf.mjs](outils/build-rwf.mjs) produit le Ruleset à partir du système RWF v0.1.475 (ses constantes de règles seulement) et du RWF Super Pack v0.4.1, deux archives qui ne sont pas dans le dépôt :

```
node outils/build-rwf.mjs <dépôt rule-them-all> <dossier du système RWF> <dossier du Super Pack> <dossier de sortie>
node outils/verify-rwf.mjs <dépôt rule-them-all> rwf-ruleset-2.1.0.json
node outils/verify-all.mjs <dépôt rule-them-all> rwf-ruleset-2.1.0.json
```

`verify-rwf.mjs` rejoue la création, l'âge, les tests, les armes, les pouvoirs, la pratique, le combat et les poursuites. `verify-all.mjs` acquiert les 461 contenus. Les corrections apportées au Super Pack sont listées dans [build-report.json](build-report.json).

// Character origins (SRD 5.2): feats, the nine species and their lineages, the four backgrounds, languages.
import {add, get, srd, tr, clean, slug, AB, DAMAGE, PIECES, apt, ft, base, pool, ref, lit, fx, sum, max, and, or, not, cf, iff, eq, gt, holds, value,
  D, POOL, F, FR, K, KF, is, E, A, CT, TPL, stateApply, stateApplyF, grant, grantAdd, grantAction, grantItem, intF, txtF, boolF, numF} from "./lib.mjs";
import {SKILL} from "./regles.mjs";
import {saveMappings} from "./combat.mjs";
import {SPELLS} from "./magie.mjs";
import {PROF, LOTS} from "./classes.mjs";

export const FEATS = {};
const PB = value("bonus-maitrise");
const stateGrant = id => grant(id, "definition", id, {"state.active": true});
const skillOptions = ids => ids.map(id => ({id, targetRef: {objectKind: "definition", objectId: id}, operation: "grant", config: {add: {"value.base": 1}}}));
const ALL_SKILLS = () => Object.values(SKILL);

/** Feats as Definitions (held as a state). Run before the classes and the combat rules read them. */
export function feats() {
  for (const f of srd("Feats")) {
    const name = tr("misc.Feats", f.index, "name", f.name), id = `don-${slug(name)}`;
    FEATS[f.index] = id;
    const gain = f.index === "ability-score-improvement" ? "deux" : f.type === "epic-boon" || f.index === "grappler" ? "une" : "aucune";
    D(id, f.type === "fighting-style" ? "style-de-combat" : "don", name, {categorie: f.type, augmentation: gain, plafond: f.type === "epic-boon" ? 30 : 20, immunite: ""},
      {descriptionKey: clean(tr("misc.Feats", f.index, "description", f.description)), tags: [`don-${f.type}`]});
  }
  for (const [type, nameKey] of [["origin", "Don d'origine"], ["general", "Don général"], ["fighting-style", "Style de combat"], ["epic-boon", "Faveur épique"]]) add("tags", {id: `don-${type}`, nameKey, descriptionKey: "", color: null});
  // Grappler: Advantage on attacks against a creature it grapples. Defense: +1 AC in armor (see the AC).
  get("formulas", "si-avantage-attaque-brut").expression.args.push(and(holds(FEATS.grappler), holds("agrippe", "target")));
}

export function origins() {
  /* ---------- Languages ---------- */
  const languages = srd("Languages").map(l => {
    const id = `langue-${slug(tr("misc.Languages", l.index, "name", l.name))}`;
    D(id, "langue", tr("misc.Languages", l.index, "name", l.name), {rare: l.is_rare}, {descriptionKey: l.is_rare ? "Langue rare." : "Langue standard."});
    return {id, rare: l.is_rare, index: l.index};
  });
  const standard = languages.filter(l => !l.rare && !["common", "common-sign-language", "druidic", "thieves-cant"].includes(l.index)).map(l => l.id);

  /* ---------- Feats taken at creation (an Origin feat: backgrounds, the human's Versatile) ---------- */
  CT("don", "Don", "item", {categorie: txtF("categorie", "Catégorie")}, "Un don et ses choix (compétences, sorts).", "unique", "#8f3b6a");
  const spellOptions = (cls, lvl) => srd("Spells").filter(s => s.level === lvl && s.classes.some(c => c.index === cls)).map(s => ({id: SPELLS[s.index], targetRef: {objectKind: "contentTemplate", objectId: SPELLS[s.index]}, operation: "grant", config: {count: 1}}));
  const magicInitiate = cls => [{id: "sorts-mineurs", name: "Deux sorts mineurs", min: 2, max: 2, options: spellOptions(cls, 0)}, {id: "sort-niveau-1", name: "Un sort de niveau 1 (lancé une fois par repos long sans emplacement)", min: 1, max: 1, options: spellOptions(cls, 1)}];
  const featText = index => clean(tr("misc.Feats", index, "description", ""));
  const originFeats = [];
  for (const f of srd("Feats").filter(f => f.type === "origin")) {
    const name = get("definitions", FEATS[f.index]).nameKey;
    if (f.index === "magic-initiate") {
      for (const cls of ["cleric", "druid", "wizard"]) {
        const clsName = tr("misc.Classes", cls, "name", cls), id = `don-initie-a-la-magie-${slug(clsName)}`;
        TPL(id, `${name} (${clsName.toLowerCase()})`, "don", {categorie: "origin"}, {descriptionKey: featText(f.index), relations: [stateGrant(FEATS[f.index])], choiceGroups: magicInitiate(cls)});
        originFeats.push(id);
      }
    } else {
      const choiceGroups = f.index === "skilled" ? [{id: "competences", name: "Trois compétences", min: 3, max: 3, options: skillOptions(ALL_SKILLS())}] : [];
      TPL(FEATS[f.index], name, "don", {categorie: "origin"}, {descriptionKey: featText(f.index), relations: [stateGrant(FEATS[f.index])], choiceGroups});
      originFeats.push(FEATS[f.index]);
    }
  }
  ORIGIN_FEATS.push(...originFeats);

  /* ---------- Species ---------- */
  D("vitesse-de-base", "compteur", "Vitesse de l'espèce (m)", {}, {descriptionKey: "Vitesse donnée par l'espèce, avant les aptitudes."});
  CT("espece", "Espèce", "item", {cle: txtF("cle", "Clé"), taille: txtF("taille", "Taille"), vitesse: numF("vitesse", "Vitesse (m)"), lignage: boolF("lignage", "A un lignage à choisir")}, "L'espèce du personnage : taille, vitesse et traits.", "unique", "#6a8f3b");
  CT("lignage", "Lignage", "item", {espece: txtF("espece", "Espèce"), typeDegats: txtF("typeDegats", "Type de dégâts"), degats: txtF("degats", "Dégâts"), degatsPalier2: txtF("degatsPalier2", "Dégâts au niveau 5"), degatsPalier3: txtF("degatsPalier3", "Dégâts au niveau 11"), degatsPalier4: txtF("degatsPalier4", "Dégâts au niveau 17"),
    sauvegarde: txtF("sauvegarde", "Sauvegarde"), moitie: boolF("moitie", "Moitié sur une réussite"), caracteristiqueDD: txtF("caracteristiqueDD", "Caractéristique du DD"), niveau: intF("niveau", "Niveau (0 : suit le niveau du personnage)"), etat: txtF("etat", "État")},
    "Lignage, ascendance ou héritage choisi avec l'espèce.", "unique", "#5a7f3b");
  const SIZE = {Small: "Petite", Medium: "Moyenne", Large: "Grande"};
  const traitGrant = (index, lineage = false) => {
    const id = apt(index), out = [stateGrant(id)];
    if (index === "darkvision-60") out.push(grantAdd("vision-dans-le-noir", 18));
    if (index === "darkvision-120") out.push(grantAdd("vision-dans-le-noir", lineage ? 18 : 36));
    const res = /(?:lineage|draconic-damage)-resistance-(\w+)$/.exec(index); if (res) out.push(stateGrant(`resistance-${DAMAGE[res[1]]}`));
    if (index === "dwarven-resilience") out.push(stateGrant("resistance-poison"));
    if (index === "wood-elf-speed-increase") out.push(grantAdd("vitesse-de-base", 1.5));
    const spell = /^lineage-spell-(.+)$/.exec(index); if (spell && SPELLS[spell[1]]) out.push(grantItem(`sort-${index}`, SPELLS[spell[1]]));
    if (index === "gnomish-lineage-rock-gnome") out.push(grantItem("sort-prestidigitation", SPELLS.prestidigitation));
    if (index === "gnomish-lineage-forest-gnome") out.push(grantItem("sort-speak-with-animals", SPELLS["speak-with-animals"]));
    if (index === "high-elf-cantrip-versatility") out.push(grantItem("sort-prestidigitation", SPELLS.prestidigitation));
    if (index === "otherworldly-presence") out.push(grantItem("sort-thaumaturgy", SPELLS.thaumaturgy));
    return out;
  };
  for (const s of srd("Species")) {
    const id = slug(tr("misc.Species", s.index, "name", s.name)), size = s.size ?? "Medium";
    const choiceGroups = [];
    if (s.index === "human") choiceGroups.push({id: "doue", name: "Compétent : une compétence", min: 1, max: 1, options: skillOptions(ALL_SKILLS())});
    if (s.index === "elf") choiceGroups.push({id: "sens-aiguises", name: "Sens aiguisés", min: 1, max: 1, options: skillOptions([SKILL.insight, SKILL.perception, SKILL.survival])});
    const traits = (s.traits ?? []).map(t => t.index);
    TPL(`espece-${id}`, tr("misc.Species", s.index, "name", s.name), "espece", {cle: id, taille: s.size_options ? "Petite ou Moyenne" : SIZE[size], vitesse: ft(s.speed), lignage: Boolean(s.subspecies?.length)},
      {descriptionKey: `${tr("misc.Species", s.index, "name", s.name)} : taille ${s.size_options ? "Petite ou Moyenne" : SIZE[size].toLowerCase()}, vitesse ${String(ft(s.speed)).replace(".", ",")} m. Traits : ${traits.map(i => get("definitions", apt(i)).nameKey).join(", ")}.`,
        relations: [grantAdd("vitesse-de-base", ft(s.speed)), ...traits.flatMap(traitGrant)], choiceGroups, tags: ["espece"]});
    SPECIES.push(`espece-${id}`);
    for (const sub of s.subspecies ?? []) {
      const data = srd("Subspecies").find(x => x.index === sub.index), name = tr("misc.Subspecies", sub.index, "name", sub.name);
      const breath = data.traits.find(t => t.index.startsWith("draconic-breath-weapon"));
      const fields = {espece: id, ...(breath ? {typeDegats: DAMAGE[data.damage_type.index], degats: "1d10", degatsPalier2: "2d10", degatsPalier3: "3d10", degatsPalier4: "4d10", sauvegarde: "dexterite", moitie: true, caracteristiqueDD: "constitution", niveau: 0, etat: ""} : {})};
      TPL(`lignage-${slug(name).replace(/^lignage-/, "")}`, name, "lignage", fields, {descriptionKey: data.traits.map(t => `${get("definitions", apt(t.index)).nameKey}${t.level > 1 ? ` (niveau ${t.level})` : ""} : ${get("definitions", apt(t.index)).descriptionKey}`).join("\n\n"),
        relations: [...data.traits.flatMap(t => traitGrant(t.index, true)), ...(breath ? [grantAction("souffle-draconique"), stateGrant("a-un-souffle")] : [])], tags: ["espece"]});
      LINEAGES.push(`lignage-${slug(name).replace(/^lignage-/, "")}`);
    }
  }
  // Breath Weapon: a Dexterity save against 8 + Constitution + proficiency, a number of times equal to the proficiency bonus.
  F("souffle-draconique-maximum", "Souffle draconique (utilisations)", iff(holds("a-un-souffle"), PB, lit(0)));
  D("a-un-souffle", "statut", "Souffle draconique", {immunite: ""}, {descriptionKey: "Le drakéide a une arme de souffle."});
  POOL("souffle-draconique", "ressource", "Souffle draconique", "souffle-draconique-maximum", {}, {descriptionKey: "Autant d'utilisations que le bonus de maîtrise ; récupérées au repos long."});
  PIECES.reposLong.push(["souffle-draconique", "max"]);
  E("depenser-souffle", "Dépense : Souffle draconique", pool("souffle-draconique"), "subtract", {kind: "literal", value: 1}, "self");
  K("souffle-possible", "Souffle draconique", and(is("peut-agir"), gt(ref(pool("souffle-draconique")), lit(0))));
  A("souffle-draconique", "Souffle draconique", {targeting: "each", conditionRefs: ["souffle-possible"], costEffectRefs: ["depenser-souffle"], testRef: "dd-dexterite", outcomeMappings: [...saveMappings.failed, ...saveMappings.saved],
    descriptionKey: "Remplace une attaque : cône de 4,50 m ou ligne de 9 m. Sauvegarde de Dextérité (DD 8 + Constitution + bonus de maîtrise) ; 1d10 dégâts (2d10 au niveau 5, 3d10 au 11, 4d10 au 17), la moitié sur une réussite."});
  // Dwarven Toughness: +1 HP per level. Orc Adrenaline Rush. Human Resourceful: Heroic Inspiration after a Long Rest.
  PIECES.pvMaximum.push(iff(holds(apt("dwarven-toughness")), value("niveau-total"), lit(0)));
  F("adrenaline-maximum", "Poussée d'adrénaline (utilisations)", iff(holds(apt("adrenaline-rush")), PB, lit(0)));
  POOL("poussee-d-adrenaline-utilisations", "ressource", "Poussée d'adrénaline (utilisations)", "adrenaline-maximum", {}, {descriptionKey: "Autant d'utilisations que le bonus de maîtrise ; récupérées au repos court ou long."});
  PIECES.reposCourt.push(["poussee-d-adrenaline-utilisations", "max"]); PIECES.reposLong.push(["poussee-d-adrenaline-utilisations", "max"]);
  E("depenser-adrenaline", "Dépense : Poussée d'adrénaline", pool("poussee-d-adrenaline-utilisations"), "subtract", {kind: "literal", value: 1}, "self");
  F("pv-temporaires-adrenaline", "Poussée d'adrénaline", max(ref(pool("pv-temporaires")), PB));
  E("pv-adrenaline", "Poussée d'adrénaline", pool("pv-temporaires"), "set", {kind: "formula", id: "pv-temporaires-adrenaline"}, "self");
  K("adrenaline-possible", "Poussée d'adrénaline", and(is("peut-agir"), gt(ref(pool("poussee-d-adrenaline-utilisations")), lit(0))));
  A("poussee-d-adrenaline", "Poussée d'adrénaline", {conditionRefs: ["adrenaline-possible"], costEffectRefs: ["depenser-adrenaline"], effectRefs: ["pv-adrenaline"], stateApplications: [stateApply("foncer", "self", {durationRef: "un-round"})], descriptionKey: "Action Bonus : Foncer, et autant de points de vie temporaires que le bonus de maîtrise."});
  get("contentTemplates", "espece-orc").relations.push(grantAction("poussee-d-adrenaline"));
  FR("inspiration-debrouillard", "Débrouillard", iff(holds(apt("resourceful")), lit("inspiration-heroique"), lit(null)));
  PIECES.reposLongEtats.push(stateApplyF("inspiration-debrouillard", "self"));

  /* ---------- Backgrounds ---------- */
  CT("historique", "Historique", "item", {caracteristiques: txtF("caracteristiques", "Caractéristiques"), don: txtF("don", "Don d'origine")}, "Le passé du personnage : +2/+1 ou +1/+1/+1 à trois caractéristiques, un don d'origine, deux compétences, un outil, des langues, l'équipement.", "unique", "#8f6a3b");
  const MI = {acolyte: "cleric", sage: "wizard"};
  for (const b of srd("Backgrounds")) {
    const name = tr("misc.Backgrounds", b.index, "name", b.name), id = `historique-${slug(name)}`;
    const abilities = b.ability_scores.map(a => AB[a.index]);
    const abilityOptions = amount => abilities.map(ab => ({id: ab, targetRef: {objectKind: "definition", objectId: ab}, operation: "grant", config: {add: {"value.base": amount}}}));
    const profs = b.proficiencies.map(p => PROF[p.index]).filter(Boolean);
    const tools = (b.proficiency_choices ?? []).map((c, i) => ({id: `outil-${i + 1}`, name: "Outil", min: c.choose, max: c.choose, options: skillOptions(c.from.options.map(o => PROF[o.item.index]).filter(Boolean))}));
    const featIndex = b.feat.index, cls = MI[b.index];
    const equipment = b.equipment_options?.[0];
    LOTS[`historique-${slug(name)}`] = {options: equipment?.from.options.find(o => o.option_type === "multiple")?.items ?? [], desc: equipment?.desc ?? ""};
    const equipGroup = equipment ? [{id: "equipement", name: "Équipement de départ", min: 1, max: 1, options: equipment.from.options.map(o => o.option_type === "money"
      ? {id: `po-${o.count}`, targetRef: {objectKind: "definition", objectId: "po"}, operation: "grant", config: {add: {"value.base": o.count}}}
      : {id: "lot", targetRef: {objectKind: "contentTemplate", objectId: `lot-historique-${slug(name)}`}, operation: "grant", config: {count: 1}})}] : [];
    TPL(id, name, "historique", {caracteristiques: abilities.map(ab => get("definitions", ab).nameKey).join(", "), don: get("definitions", FEATS[featIndex]).nameKey},
      {descriptionKey: `Caractéristiques : ${abilities.map(ab => get("definitions", ab).nameKey).join(", ")} (+2 à l'une et +1 à une autre, ou +1 aux trois). Don : ${get("definitions", FEATS[featIndex]).nameKey}${cls ? ` (${tr("misc.Classes", cls, "name", cls).toLowerCase()})` : ""}. Compétences : ${profs.map(p => get("definitions", p).nameKey).join(", ")}.`,
        relations: [...profs.map(p => grantAdd(p, 1)), stateGrant(FEATS[featIndex]), stateGrant("langue-commun")],
        choiceGroups: [{id: "plus-deux", name: "+2 à une caractéristique (aucune si +1/+1/+1)", min: 0, max: 1, options: abilityOptions(2)}, {id: "plus-un", name: "+1 (une si +2 a été choisi, sinon les trois)", min: 1, max: 3, options: abilityOptions(1)},
          {id: "langues", name: "Deux langues standard", min: 2, max: 2, options: standard.map(l => ({id: l, targetRef: {objectKind: "definition", objectId: l}, operation: "grant", config: {initial: {"state.active": true}}}))},
          ...tools, ...(cls ? magicInitiate(cls) : featIndex === "skilled" ? [{id: "competences", name: "Trois compétences", min: 3, max: 3, options: skillOptions(ALL_SKILLS())}] : []), ...equipGroup], tags: ["historique"]});
    BACKGROUNDS.push(id);
  }
  add("tags", {id: "historique", nameKey: "Historique", descriptionKey: "", color: null});
}
export const ORIGIN_FEATS = [], SPECIES = [], LINEAGES = [], BACKGROUNDS = [];

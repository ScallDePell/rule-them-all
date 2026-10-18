// The bestiary (SRD 5.2): every monster as an Actor Content with the values of its stat block, its attacks and its
// saving-throw abilities as owned Items, its spells, resistances, immunities and senses.
import {add, get, has, srd, tr, trEntry, clean, slug, ft, ABILITIES, AB, CONDITIONS, DAMAGE, pool, ref, lit, cf, sum, mul, iff, or, not, and, gt, eq, neq,
  F, E, A, K, CT, TPL, grant, grantAction, grantItem, intF, txtF, boolF, numF} from "./lib.mjs";
import {estPJ, SKILL} from "./regles.mjs";
import {SPELLS} from "./magie.mjs";

/** templateId -> {bases: {definitionId: value.base}, states: [definitionId], items: [templateId]}: the final module grants them. */
export const CREATURES = {};
const unique = (collection, id) => { let out = id, n = 2; while (has(collection, out)) out = `${id}-${n++}`; return out; };
const feet = text => { const n = /(\d+)\s*ft/.exec(String(text ?? "")); return n ? ft(Number(n[1])) : 0; };
const metres = n => String(n).replace(".", ",");
const fraction = cr => ({0.125: "1/8", 0.25: "1/4", 0.5: "1/2"})[cr] ?? String(cr);
let gear = null;
const GEAR = () => gear ??= new Map(srd("Equipment").map(e => [e.name.toLowerCase(), e]));
const ABBR = Object.fromEntries(ABILITIES.map(([k, id]) => [k, id]));

export function creatures() {
  CT("creature", "Créature", "actor", {taille: txtF("taille", "Taille"), typeCreature: txtF("typeCreature", "Type"), alignement: txtF("alignement", "Alignement"), facteurDePuissance: txtF("facteurDePuissance", "Facteur de puissance"),
    xp: intF("xp", "PX"), pvDes: txtF("pvDes", "Dés de vie (points de vie)"), vitesses: txtF("vitesses", "Vitesses"), sens: txtF("sens", "Sens"), langues: txtF("langues", "Langues"), equipement: txtF("equipement", "Équipement")},
    "Monstre ou PNJ du bestiaire : ses valeurs sont celles de son bloc de statistiques (statut Personnage joueur décoché).", "unique", "#7a4f8f");
  CT("attaque-de-creature", "Attaque de monstre", "item", {bonusAttaque: intF("bonusAttaque", "Bonus d'attaque"), corpsACorps: boolF("corpsACorps", "Corps à corps"), portee: txtF("portee", "Allonge ou portée"),
    degats: txtF("degats", "Dégâts"), typeDegats: txtF("typeDegats", "Type de dégâts"), degats2: txtF("degats2", "Dégâts supplémentaires"), typeDegats2: txtF("typeDegats2", "Type des dégâts supplémentaires"), etat: txtF("etat", "État infligé au toucher")},
    "Une attaque du bloc de statistiques : son action fait le jet d'attaque et les dégâts.", "unique", "#8f3b3b");
  CT("capacite-de-creature", "Capacité de monstre", "item", {dd: intF("dd", "DD"), sauvegarde: txtF("sauvegarde", "Sauvegarde"), degats: txtF("degats", "Dégâts"), typeDegats: txtF("typeDegats", "Type de dégâts"),
    degats2: txtF("degats2", "Dégâts supplémentaires"), typeDegats2: txtF("typeDegats2", "Type des dégâts supplémentaires"), moitie: boolF("moitie", "Moitié des dégâts si la sauvegarde réussit"), etat: txtF("etat", "État infligé"),
    niveau: intF("niveau", "Niveau (−1 : pas un sort)"), recharge: txtF("recharge", "Recharge ou utilisations")},
    "Une capacité à jet de sauvegarde (souffle, regard, poison…) : chaque cible fait son jet contre le DD.", "unique", "#8f5a3b");

  // A monster's spells: no slot to spend (its uses per day are written on the stat block).
  const slotRule = get("conditions", "emplacement-disponible");
  slotRule.expression = or(not(estPJ()), slotRule.expression);
  slotRule.descriptionKey = "Il reste un emplacement de ce niveau, au moins égal à celui du sort. Un monstre n'en dépense pas : ses utilisations par jour sont sur son bloc de statistiques.";

  // Save abilities: the save, then the damage (and its second type) and the condition on a failure, half on a success when it says so.
  R2();
  for (const [, id, name] of ABILITIES)
    A(`capacite-sauvegarde-${id}`, "Utiliser la capacité", {targeting: "each", conditionRefs: ["peut-attaquer"], testRef: `dd-${id}`, outcomeMappings: [
      {outcomeId: "sauvegarde-ratee", effectRefs: ["degats-reinitialises", "degats-effet", "degats-capacite-2"], actionRefs: ["echec-mort-sur-degats", "subir-degats", "endurance-implacable", "mort-par-degats-massifs", "tomber-a-zero-pj", "tomber-a-zero-creature", "mourir-sur-echecs", "test-de-concentration", "subir-l-etat-de-l-effet"]},
      {outcomeId: "sauvegarde-reussie", effectRefs: ["degats-reinitialises", "degats-effet-moitie", "degats-capacite-2-moitie"], actionRefs: ["echec-mort-sur-degats", "subir-degats", "endurance-implacable", "mort-par-degats-massifs", "tomber-a-zero-pj", "tomber-a-zero-creature", "mourir-sur-echecs", "test-de-concentration"]}],
      descriptionKey: `Chaque cible fait un jet de sauvegarde de ${name} contre le DD de la capacité : dégâts et état si elle échoue, la moitié des dégâts si elle réussit et que la capacité le dit.`});

  for (const m of srd("Monsters")) {
    const t = trEntry("monsters", m.index) ?? {}, name = t.name ?? m.name, base = slug(name);
    const id = unique("contentTemplates", `creature-${base}`);
    const bases = {}, states = [], items = [];
    // Abilities, saves, skills: a save or skill of the stat block is proficiency (or Expertise) over the modifier.
    const pb = m.proficiency_bonus ?? 2;
    for (const [k, ab] of Object.entries(ABBR)) bases[ab] = m[{str: "strength", dex: "dexterity", con: "constitution", int: "intelligence", wis: "wisdom", cha: "charisma"}[k]];
    const mod = ab => Math.floor((bases[ab] - 10) / 2);
    for (const p of m.proficiencies ?? []) {
      const [kind, ...rest] = p.proficiency.index.split("-"), key = rest.join("-");
      if (kind === "saving") { const ab = ABBR[rest[1]]; if (ab) bases[`sauvegarde-${ab}`] = 1; }
      if (kind === "skill" && SKILL[key]) {
        const skill = srd("Skills").find(s => s.index === key), ab = AB[skill.ability_score.index];
        bases[SKILL[key]] = Math.max(1, Math.min(2, Math.round((p.value - mod(ab)) / pb)));
      }
    }
    Object.assign(bases, {"bonus-maitrise": pb, "classe-armure": m.armor_class?.[0]?.value ?? 10, "pv-maximum": m.hit_points, vitesse: feet(m.speed?.walk), "vision-dans-le-noir": feet(m.senses?.darkvision),
      "niveau-total": Math.max(1, Math.floor(m.challenge_rating))});
    for (const v of m.damage_resistances) if (DAMAGE[v]) states.push(`resistance-${DAMAGE[v]}`);
    for (const v of m.damage_immunities) if (DAMAGE[v]) states.push(`immunite-${DAMAGE[v]}`);
    for (const v of m.damage_vulnerabilities) if (DAMAGE[v]) states.push(`vulnerabilite-${DAMAGE[v]}`);
    for (const c of m.condition_immunities) states.push(c.index === "exhaustion" ? "immunite-epuisement" : `immunite-${CONDITIONS[c.index]}`);

    // Attacks and save abilities become owned Items; the rest of the stat block is its text.
    const sections = [["special_abilities", "Traits"], ["actions", "Actions"], ["bonus_actions", "Actions bonus"], ["reactions", "Réactions"], ["legendary_actions", "Actions légendaires"]];
    const text = [];
    for (const [key, title] of sections) {
      const rows = m[key] ?? [];
      if (!rows.length) continue;
      text.push(`**${title}**`);
      rows.forEach((row, i) => {
        const frRow = t[key]?.[i] ?? {}, rowName = frRow.name ?? row.name, desc = clean(frRow.desc ?? row.desc);
        const usage = row.usage?.type === "recharge on roll" ? `Recharge ${row.usage.min_value}${row.usage.min_value < 6 ? "–6" : ""}` : row.usage?.type === "per day" ? `${row.usage.times}/jour` : row.usage?.type === "recharge after rest" ? "Recharge après un repos" : "";
        text.push(`*${rowName}${usage ? ` (${usage})` : ""}.* ${desc}`);
        const dmg = (row.damage ?? []).filter(d => d.damage_dice), item = slug(rowName);
        const condition = /has the (\w+) condition/i.exec(row.desc ?? "")?.[1]?.toLowerCase();
        if (row.attack_bonus !== undefined) {
          const tid = unique("contentTemplates", `${base}-${item}`), melee = /^Melee/i.test(row.desc ?? "");
          TPL(tid, rowName, "attaque-de-creature", {bonusAttaque: row.attack_bonus, corpsACorps: melee || /Melee or Ranged/i.test(row.desc ?? ""),
            portee: (/(reach [\d/ ]+ft\.|range [\d/ ]+ft\.)/.exec(row.desc ?? "")?.[1] ?? "").replace(/(\d+)/g, d => metres(ft(Number(d)))).replace("ft.", "m").replace("reach", "allonge").replace("range", "portée"),
            degats: dmg[0]?.damage_dice?.replace(/ /g, "") ?? "0", typeDegats: DAMAGE[dmg[0]?.damage_type?.index] ?? "contondant", degats2: dmg[1]?.damage_dice?.replace(/ /g, "") ?? "0", typeDegats2: DAMAGE[dmg[1]?.damage_type?.index] ?? "contondant",
            etat: condition && CONDITIONS[condition] && !/saving throw/i.test(row.desc ?? "") ? CONDITIONS[condition] : ""},
            {descriptionKey: desc, relations: [grantAction("attaque-de-creature")], tags: ["monstre"]});
          items.push(tid);
        } else if (row.dc?.dc_type && ABBR[row.dc.dc_type.index] && Number.isFinite(row.dc.dc_value)) {
          const tid = unique("contentTemplates", `${base}-${item}`), ab = ABBR[row.dc.dc_type.index];
          TPL(tid, `${rowName}${usage ? ` (${usage})` : ""}`, "capacite-de-creature", {dd: row.dc.dc_value, sauvegarde: ab, degats: dmg[0]?.damage_dice?.replace(/ /g, "") ?? "0", typeDegats: DAMAGE[dmg[0]?.damage_type?.index] ?? "contondant",
            degats2: dmg[1]?.damage_dice?.replace(/ /g, "") ?? "0", typeDegats2: DAMAGE[dmg[1]?.damage_type?.index] ?? "contondant", moitie: row.dc.success_type === "half", etat: condition && CONDITIONS[condition] ? CONDITIONS[condition] : "", niveau: -1, recharge: usage},
            {descriptionKey: desc, relations: [grantAction(`capacite-sauvegarde-${ab}`)], tags: ["monstre"]});
          items.push(tid);
        }
        if (row.spellcasting) {
          const sc = row.spellcasting, ab = ABBR[sc.ability?.index];
          if (ab) bases["modificateur-incantation"] = mod(ab);
          if (sc.dc) bases["dd-sorts"] = sc.dc;
          if (sc.modifier !== undefined) bases["attaque-sorts"] = sc.modifier;
          for (const s of sc.spells ?? []) if (SPELLS[s.index] && !items.includes(SPELLS[s.index])) items.push(SPELLS[s.index]);
          const list = (sc.spells ?? []).map(s => `${tr("spells", s.index, "name", s.name)}${s.usage?.type === "per day" ? ` (${s.usage.times}/jour)` : ""}`);
          if (list.length) text.push(list.join(", ") + ".");
        }
      });
    }
    const speeds = Object.entries(m.speed ?? {}).filter(([k]) => k !== "hover").map(([k, v]) => `${({walk: "", fly: "vol ", swim: "nage ", climb: "escalade ", burrow: "creusement "})[k] ?? k + " "}${metres(feet(v))} m`).join(", ") + (m.speed?.hover ? " (vol stationnaire)" : "");
    const senses = Object.entries(m.senses ?? {}).filter(([k]) => k !== "passive_perception").map(([k, v]) => `${({darkvision: "vision dans le noir", blindsight: "vision aveugle", truesight: "vision véritable", tremorsense: "perception des vibrations"})[k] ?? k} ${metres(feet(v))} m`)
      .concat(`Perception passive ${m.senses?.passive_perception ?? 10}`).join(", ");
    TPL(id, name, "creature", {taille: t.size ?? m.size, typeCreature: t.type ?? m.type, alignement: t.alignment ?? m.alignment, facteurDePuissance: fraction(m.challenge_rating), xp: m.xp ?? 0,
      pvDes: (m.hit_points_roll ?? m.hit_dice ?? "").replace(/ /g, ""), vitesses: speeds, sens: senses, langues: t.languages ?? m.languages ?? "", equipement: String(m.gear ?? "").split(/,\s*/).filter(Boolean).map(g => { const e = GEAR().get(g.toLowerCase()); return e ? tr("equipment", e.index, "name", g) : g; }).join(", ")},
      {descriptionKey: [`${t.size ?? m.size} ${t.type ?? m.type}, ${t.alignment ?? m.alignment}. FP ${fraction(m.challenge_rating)} (${m.xp ?? 0} PX). CA ${bases["classe-armure"]}, PV ${m.hit_points} (${m.hit_points_roll ?? m.hit_dice}), Vitesse ${speeds}.`, ...text].join("\n\n"), tags: ["monstre"]});
    CREATURES[id] = {bases, states, items};
  }
  add("tags", {id: "monstre", nameKey: "Monstre", descriptionKey: "", color: null});
}

/** The second damage type of a save ability, in full on a failure and halved on a success when it says so. */
function R2() {
  E("degats-capacite-2", "Dégâts supplémentaires de la capacité", {objectKind: "definition", objectId: "degats-a-appliquer", capabilityId: "value", outputId: "value.base"}, "add", {kind: "roll", rollRef: "degats-creature-2", factorFormulaRef: "facteur-degats-2", minimum: 0}, "target");
  F("facteur-degats-2-moitie", "Moitié des dégâts supplémentaires", iff(cf("moitie", false), mul(lit(0.5), {type: "formula", id: "facteur-degats-2"}), lit(0)));
  E("degats-capacite-2-moitie", "Moitié des dégâts supplémentaires", {objectKind: "definition", objectId: "degats-a-appliquer", capabilityId: "value", outputId: "value.base"}, "add", {kind: "roll", rollRef: "degats-creature-2", factorFormulaRef: "facteur-degats-2-moitie", minimum: 0}, "target");
}

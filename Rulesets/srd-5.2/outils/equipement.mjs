// Equipment (SRD 5.2): weapons with their properties and masteries, armor and shields, adventuring gear, tools,
// packs, magic items, the starting equipment of classes and backgrounds, and Armor Class.
import {add, get, has, srd, tr, clean, slug, DAMAGE, PIECES, ft, base, pool, ref, lit, fx, sum, sub, mul, max, min, and, or, not, cf, iff, eq, gt, lt, holds, value,
  F, DERIVE, E, A, K, KF, is, R, CT, TPL, grant, grantAdd, grantAction, grantItem, intF, txtF, boolF, numF} from "./lib.mjs";
import {estPJ} from "./regles.mjs";
import {export_heal} from "./combat.mjs";
import {LOTS, PROF} from "./classes.mjs";

export const EQUIPMENT = {}; // SRD index -> Content Template id
const unique = (collection, id) => { let out = id, n = 2; while (has(collection, out)) out = `${id}-${n++}`; return out; };
const cost = c => c ? `${c.quantity} ${({gp: "po", sp: "pa", cp: "pc", ep: "pe", pp: "pp"})[c.unit] ?? c.unit}` : "";
const weight = w => w ? `${String(Math.round(w * 0.5 * 100) / 100).replace(".", ",")} kg` : "";
const gwf = dice => dice ? dice.replace(/(\d+d\d+)/g, "$1min3") : "";

export function equipment() {
  const common = {cout: txtF("cout", "Prix"), poids: txtF("poids", "Poids"), quantite: intF("quantite", "Quantité"), equipe: boolF("equipe", "Équipé")};
  CT("arme", "Arme", "item", {...common, categorie: txtF("categorie", "Catégorie (courante, guerre)"), corpsACorps: boolF("corpsACorps", "Corps à corps"), degats: txtF("degats", "Dégâts"), degatsDeuxMains: txtF("degatsDeuxMains", "Dégâts à deux mains (Polyvalente)"),
    degatsGAM: txtF("degatsGAM", "Dégâts (style Arme à deux mains)"), degatsDeuxMainsGAM: txtF("degatsDeuxMainsGAM", "Dégâts à deux mains (style Arme à deux mains)"), typeDegats: txtF("typeDegats", "Type de dégâts"),
    finesse: boolF("finesse", "Finesse"), legere: boolF("legere", "Légère"), lourde: boolF("lourde", "Lourde"), deuxMains: boolF("deuxMains", "À deux mains"), allonge: boolF("allonge", "Allonge"), lancer: boolF("lancer", "Lancer"), munitions: boolF("munitions", "Munitions"), chargement: boolF("chargement", "Chargement"),
    botte: txtF("botte", "Botte d'arme"), porteeNormale: numF("porteeNormale", "Portée normale (m)"), porteeLongue: numF("porteeLongue", "Portée longue (m)"), maitriseRequise: txtF("maitriseRequise", "Maîtrise (catégorie)"), maitriseArme: txtF("maitriseArme", "Maîtrise (arme)"), bonusMagique: intF("bonusMagique", "Bonus magique")},
    "Une arme : son action Attaquer fait le jet d'attaque et les dégâts.", "stackable", "#8f3b3b");
  CT("armure", "Armure", "item", {...common, caLegere: intF("caLegere", "CA (armure légère, + Dex)"), caIntermediaire: intF("caIntermediaire", "CA (armure intermédiaire, + Dex max 2)"), caLourde: intF("caLourde", "CA (armure lourde)"), caBouclier: intF("caBouclier", "Bonus de bouclier"),
    desavantageDiscretion: intF("desavantageDiscretion", "Désavantage en Discrétion (1)"), forceMinimum: intF("forceMinimum", "Force minimale"), bonusMagique: intF("bonusMagique", "Bonus magique")}, "Armure ou bouclier : équipé, il compte dans la CA.", "stackable", "#5a5a6a");
  CT("objet", "Objet", "item", {...common, categorie: txtF("categorie", "Catégorie"), soins: txtF("soins", "Soins (potion)")}, "Équipement d'aventurier, outil, paquetage, focaliseur.", "stackable", "#8f7a5a");
  CT("objet-magique", "Objet magique", "item", {...common, rarete: txtF("rarete", "Rareté"), harmonisation: boolF("harmonisation", "Harmonisation requise"), categorie: txtF("categorie", "Catégorie"), bonusCA: intF("bonusCA", "Bonus de CA"), bonusSauvegardes: intF("bonusSauvegardes", "Bonus aux sauvegardes"), soins: txtF("soins", "Soins (potion)")},
    "Objet magique : équipé (et harmonisé s'il le faut), ses bonus de CA et de sauvegarde comptent.", "stackable", "#7a3b8f");
  CT("lot", "Lot d'équipement", "item", {}, "Équipement de départ d'une classe ou d'un historique : ses objets sont ajoutés au personnage.", "unique", "#8f7a5a");

  // Potions: drink (or give) to heal the dice written on them.
  R("soins-de-potion", "Soins de la potion", "@content.soins");
  E("soins-de-potion", "Soins de la potion", pool("pv"), "add", {kind: "roll", rollRef: "soins-de-potion", minimum: 0}, "target");
  A("boire-la-potion", "Boire ou faire boire", {effectRefs: ["soins-de-potion", "reussites-a-zero", "echecs-a-zero"], stateRemovals: export_heal.removals, descriptionKey: "Action Bonus : la cible (soi ou une créature à 1,50 m) récupère les points de vie de la potion. Retirez ensuite la potion."});

  const MASTERY = Object.fromEntries(srd("Weapon-Mastery-Properties").map(m => [m.index, slug(tr("misc.Weapon-Mastery-Properties", m.index, "name", m.name))]));
  for (const e of srd("Equipment")) {
    const cats = e.equipment_categories.map(c => c.index), name = tr("equipment", e.index, "name", e.name);
    const description = clean(tr("equipment", e.index, "description", e.description ?? ""));
    const data = {cout: cost(e.cost), poids: weight(e.weight), quantite: e.quantity ?? 1, equipe: false};
    const id = unique("contentTemplates", slug(name));
    if (cats.includes("weapons")) {
      const props = new Set((e.properties ?? []).map(p => p.index)), melee = cats.includes("melee-weapons");
      const proficiencyByName = {longsword: "longswords", rapier: "rapiers", scimitar: "scimitars", shortsword: "shortswords", whip: "whips", "crossbow-hand": "hand-crossbows"}[e.index];
      Object.assign(data, {categorie: cats.includes("martial-weapons") ? "guerre" : "courante", corpsACorps: melee, degats: e.damage?.damage_dice ?? "1", degatsDeuxMains: e.two_handed_damage?.damage_dice ?? "", degatsGAM: gwf(e.damage?.damage_dice), degatsDeuxMainsGAM: gwf(e.two_handed_damage?.damage_dice),
        typeDegats: DAMAGE[e.damage?.damage_type?.index] ?? "contondant", finesse: props.has("finesse"), legere: props.has("light"), lourde: props.has("heavy"), deuxMains: props.has("two-handed"), allonge: props.has("reach"), lancer: props.has("thrown"), munitions: props.has("ammunition"), chargement: props.has("loading"),
        botte: MASTERY[e.mastery?.index] ?? "", porteeNormale: melee ? ft(e.throw_range?.normal ?? 0) : ft(e.range?.normal ?? 0), porteeLongue: ft(e.range?.long ?? e.throw_range?.long ?? 0),
        maitriseRequise: cats.includes("martial-weapons") ? "armes-de-guerre" : "armes-courantes", maitriseArme: proficiencyByName ? PROF[proficiencyByName] : (cats.includes("martial-weapons") ? "armes-de-guerre" : "armes-courantes"), bonusMagique: 0});
      const traits = [...props].map(p => tr("misc.Weapon-Properties", p, "name", p)).join(", ");
      TPL(id, name, "arme", data, {descriptionKey: [`${data.degats} ${get("definitions", `resistance-${data.typeDegats}`).nameKey.replace(/^Résistance : /, "")}${traits ? `. ${traits}` : ""}${data.botte ? `. Botte : ${tr("misc.Weapon-Mastery-Properties", e.mastery.index, "name", "")}` : ""}.`, description].filter(Boolean).join("\n\n"),
        relations: [grantAction("attaquer-avec-l-arme"), ...(data.legere ? [grantAction("attaquer-main-secondaire")] : [])], tags: ["arme"]});
    } else if (cats.includes("armor")) {
      const ac = e.armor_class, kind = cats.includes("shields") ? "caBouclier" : cats.includes("light-armor") ? "caLegere" : cats.includes("medium-armor") ? "caIntermediaire" : "caLourde";
      Object.assign(data, {caLegere: 0, caIntermediaire: 0, caLourde: 0, caBouclier: 0, [kind]: ac.base, desavantageDiscretion: e.stealth_disadvantage ? 1 : 0, forceMinimum: e.str_minimum ?? 0, bonusMagique: 0});
      TPL(id, name, "armure", data, {descriptionKey: kind === "caBouclier" ? `+${ac.base} à la CA.` : `CA ${ac.base}${kind === "caLegere" ? " + modificateur de Dextérité" : kind === "caIntermediaire" ? " + modificateur de Dextérité (2 au plus)" : ""}${e.str_minimum ? `, Force ${e.str_minimum}` : ""}${e.stealth_disadvantage ? ", Désavantage en Discrétion" : ""}.`, tags: ["armure"]});
    } else {
      const heal = /regains (\d+d\d+ \+ \d+) Hit Points/.exec(e.description ?? "");
      Object.assign(data, {categorie: tr("misc.Equipment-Categories", cats.find(c => c !== "adventuring-gear") ?? cats[0], "name", cats[0]), soins: heal ? heal[1].replace(/ /g, "") : ""});
      const contents = (e.contents ?? []).map(c => `${c.quantity} × ${tr("equipment", c.item.index, "name", c.item.name)}`).join(", ");
      TPL(id, name, "objet", data, {descriptionKey: [description, contents ? `Contient : ${contents}.` : ""].filter(Boolean).join("\n\n"), relations: heal ? [grantAction("boire-la-potion")] : [], tags: ["objet"]});
    }
    EQUIPMENT[e.index] = id;
  }
  // Packs give their contents.
  for (const e of srd("Equipment").filter(e => e.contents?.length)) get("contentTemplates", EQUIPMENT[e.index]).relations.push(...e.contents.filter(c => EQUIPMENT[c.item.index]).map((c, i) => grantItem(`contenu-${i + 1}`, EQUIPMENT[c.item.index], c.quantity)));
  for (const [id, nameKey] of [["arme", "Arme"], ["armure", "Armure"], ["objet", "Objet"], ["objet-magique", "Objet magique"]]) add("tags", {id, nameKey, descriptionKey: "", color: null});

  /* ---------- Magic items ---------- */
  const RARITY = {Common: "Commun", Uncommon: "Peu commun", Rare: "Rare", "Very Rare": "Très rare", Legendary: "Légendaire", Artifact: "Artefact", Varies: "Variable"};
  const healing = {"potion-of-healing": "2d4+2", "potion-of-healing-greater": "4d4+4", "potion-of-healing-superior": "8d4+8", "potion-of-healing-supreme": "10d4+20"};
  for (const m of srd("Magic-Items")) {
    if (EQUIPMENT[m.index]) continue;
    const name = tr("magic-items", m.index, "name", m.name), text = `${m.desc}`;
    const bonus = /\+(\d)/.exec(m.name)?.[1];
    const ac = m.index.startsWith("armor-") || m.index.startsWith("shield-") ? Number(bonus ?? 0) : /\+1 bonus to Armor Class and saving throws/.test(text) ? 1 : 0;
    const saves = /\+1 bonus to Armor Class and saving throws/.test(text) ? 1 : 0;
    const soins = healing[m.index] ?? "";
    const id = unique("contentTemplates", slug(name));
    TPL(id, name, "objet-magique", {cout: "", poids: "", quantite: 1, equipe: false, rarete: RARITY[m.rarity?.name] ?? m.rarity?.name ?? "", harmonisation: Boolean(m.attunement), categorie: tr("misc.Equipment-Categories", m.equipment_category.index, "name", m.equipment_category.name), bonusCA: ac, bonusSauvegardes: saves, soins},
      {descriptionKey: clean(tr("magic-items", m.index, "desc", m.desc)) + (m.index.startsWith("weapon-") ? `\n\nPour une arme magique, mettez aussi +${bonus} dans le champ « Bonus magique » de l'arme.` : ""), relations: soins ? [grantAction("boire-la-potion")] : [], tags: ["objet-magique"]});
    EQUIPMENT[`magic:${m.index}`] = id;
  }

  /* ---------- Starting equipment: the "A" package of each class and background ---------- */
  for (const [owner, lot] of Object.entries(LOTS)) {
    const id = owner.startsWith("historique-") ? `lot-${owner}` : `lot-${owner}`;
    const items = lot.options.filter(o => o.option_type === "counted_reference" && EQUIPMENT[o.of.index]);
    const gold = lot.options.filter(o => o.option_type === "money").reduce((n, o) => n + o.count, 0);
    TPL(id, `Équipement de départ : ${owner.startsWith("historique-") ? get("contentTemplates", owner).nameKey : `${lot.name} (${lot.letter})`}`, "lot", {},
      {descriptionKey: `${lot.desc}`.replace(/^Choose A or B: /, ""), relations: [...items.map((o, i) => grantItem(`objet-${i + 1}`, EQUIPMENT[o.of.index], o.count)), ...(gold ? [grantAdd("po", gold)] : [])]});
  }

  /* ---------- Armor Class ---------- */
  const agg = (contentTypeId, field, operation = "max") => ({type: "contentAggregate", operation, contentTypeId, field, whereField: "equipe"});
  const dex = value("mod-dexterite"), light = agg("armure", "caLegere"), medium = agg("armure", "caIntermediaire"), heavy = agg("armure", "caLourde");
  F("ca-avec-armure", "CA avec l'armure portée", max(iff(gt(light, lit(0)), sum(light, dex), lit(0)), iff(gt(medium, lit(0)), sum(medium, min(dex, lit(2))), lit(0)), heavy), "Légère : base + Dextérité ; intermédiaire : base + Dextérité (2 au plus) ; lourde : base.");
  F("ca-sans-armure", "CA sans armure", max(sum(lit(10), dex), ...PIECES.caSansArmure), "10 + Dextérité, ou Défense sans armure, Armure du mage, Résilience draconique.");
  F("ca-du-personnage", "CA du personnage", sum(iff(fx("si-armure-portee"), fx("ca-avec-armure"), fx("ca-sans-armure")), agg("armure", "caBouclier"), agg("armure", "bonusMagique", "sum"), agg("objet-magique", "bonusCA", "sum"),
    iff(and(holds("don-defense"), fx("si-armure-portee")), lit(1), lit(0))), "Armure ou CA sans armure, + bouclier, + bonus magiques, + style Défense.");
  get("definitions", "classe-armure").descriptionKey += " Pour un personnage : armure équipée (ou CA sans armure) + bouclier + objets magiques équipés + Défense ; sorts (Bouclier, Bouclier de la foi, Hâte, Lenteur, Peau d'écorce) et bonus manuel.";
  // Heavy armor without the Strength it asks for: −3 m of Speed.
  PIECES.vitesse.push(iff(lt(value("force"), agg("armure", "forceMinimum")), lit(-3), lit(0)));
}
/** AC: built once every module has added its pieces. */
export function armorClass() {
  const derived = iff(estPJ(), fx("ca-du-personnage"), ref(base("classe-armure")));
  DERIVE("classe-armure", max(sum(derived, value("bonus-ca"), ...PIECES.caBonus), ...PIECES.caMinimum));
}

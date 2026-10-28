/* The assistant's guides (docs/assistant-guide.md in English, docs/assistant-guide.fr.md in French) against the paths:
   what each path section and each question row must say, from the assistant's catalog and the interface words.
   Used by tests/assistant-docs.test.mjs (the check) and qa/assistant-doc-skeleton.mjs (the rows to paste). */
import fs from "node:fs";
import {ASSISTANT_PATHS, ASSISTANT_GROUPS} from "../../src/configurator/assistant-paths.mjs";
import {describeAssistantCatalog} from "../../src/configurator/assistant-engine.mjs";

export const GUIDES = Object.freeze({en: "docs/assistant-guide.md", fr: "docs/assistant-guide.fr.md"});

const WORDS = {
  en: {
    header: "| Key | Question | Kind | Default | Shown when | What it is for |",
    kinds: {name: "Name", text: "Text", number: "Number", integer: "Whole number", boolean: "Yes / no", choice: "Choice", dice: "Dice", formula: "Formula", condition: "Condition", entry: "Entry", entries: "Entries", list: "List", event: "Event"},
    optional: "optional", withId: "with id", atLeast: n => `at least ${n}`, atMost: n => `at most ${n}`,
    yes: "Yes", no: "No", none: "—", always: "always", fromAnswers: "from the answers", create: (path, name) => name ? `New ${path} “${name}”` : `New ${path}`,
    is: (label, values) => `${label}: ${values}`, or: " or ", and: " and ", dependsOn: labels => `depends on ${labels}`, quote: text => `“${text}”`
  },
  fr: {
    header: "| Clé | Question | Sorte | Par défaut | Affichée si | À quoi ça sert |",
    kinds: {name: "Nom", text: "Texte", number: "Nombre", integer: "Nombre entier", boolean: "Oui / non", choice: "Choix", dice: "Dés", formula: "Formule", condition: "Condition", entry: "Entrée", entries: "Entrées", list: "Liste", event: "Évènement"},
    optional: "facultative", withId: "avec identifiant", atLeast: n => `au moins ${n}`, atMost: n => `au plus ${n}`,
    yes: "Oui", no: "Non", none: "—", always: "toujours", fromAnswers: "selon les réponses", create: (path, name) => name ? `Nouveau ${path} « ${name} »` : `Nouveau ${path}`,
    is: (label, values) => `${label} : ${values}`, or: " ou ", and: " et ", dependsOn: labels => `selon ${labels}`, quote: text => `« ${text} »`
  }
};

const lookup = (dict, key) => key.split(".").reduce((value, part) => value?.[part], dict);
export function languageText(lang, root = new URL("../../", import.meta.url)) {
  const dict = JSON.parse(fs.readFileSync(new URL(`lang/${lang}.json`, root)));
  return key => lookup(dict, key) ?? key;
}
const cell = text => String(text).replace(/\|/g, "\\|").replace(/\s+/g, " ").trim();
const list = (items, w) => items.length <= 1 ? items.join("") : `${items.slice(0, -1).join(", ")}${w.or}${items.at(-1)}`;

/** The catalog in one language, with the words the guide uses for each path and question. */
export function guideModel(lang, root) {
  const text = languageText(lang, root), w = WORDS[lang];
  const catalog = describeAssistantCatalog({paths: ASSISTANT_PATHS, groups: ASSISTANT_GROUPS, text});
  const titleOf = id => catalog.paths.find(path => path.id === id)?.title ?? id;
  const answerWord = (question, value) => {
    if (question?.kind === "choice") return question.options.find(option => option.value === value)?.label ?? String(value);
    if (typeof value === "boolean") return value ? w.yes : w.no;
    return String(value);
  };
  const defaultOf = question => {
    if (question.defaultDependsOnAnswers) return w.fromAnswers;
    const value = question.default;
    if (value === undefined || value === null) return w.none;
    if (question.kind === "choice" || typeof value === "boolean") return answerWord(question, value);
    if (typeof value === "number") return String(value);
    if (question.kind === "event") return `\`${value}\``;
    if (question.kind === "name") return value.nameKey ? text(value.nameKey) : value.name ?? String(value);
    if (value.create) return w.create(titleOf(question.create), value.create.name?.nameKey ? text(value.create.name.nameKey) : value.create.name?.name ?? null);
    if (value.type === "literal") return String(value.value);
    return JSON.stringify(value);
  };
  const shownWhen = (question, siblings) => {
    const visibility = question.visibility;
    if (!visibility) return w.always;
    const sibling = id => siblings.find(item => item.id === id);
    const label = id => sibling(id)?.label ?? id;
    if (!visibility.shownWhen) return w.dependsOn(visibility.dependsOn.map(id => w.quote(label(id))).join(w.and));
    const combos = visibility.shownWhen;
    // Keys equal in every combination are said once; the one that varies lists its values.
    const keys = visibility.dependsOn.filter(key => combos.every(combo => Object.hasOwn(combo, key)));
    const fixed = keys.filter(key => combos.every(combo => combo[key] === combos[0][key]));
    const varying = keys.filter(key => !fixed.includes(key));
    const say = (key, values) => w.is(label(key), list(values.map(value => answerWord(sibling(key), value)), w));
    if (varying.length <= 1) return [...fixed.map(key => say(key, [combos[0][key]])), ...varying.map(key => say(key, [...new Set(combos.map(combo => combo[key]))]))].join(w.and);
    return combos.map(combo => Object.entries(combo).map(([key, value]) => say(key, [value])).join(w.and)).join(w.or);
  };
  const kindOf = question => [w.kinds[question.kind], ...(question.required ? [] : [w.optional]), ...(question.withId ? [w.withId] : []),
    ...(question.min !== undefined ? [w.atLeast(question.min)] : []), ...(question.max !== undefined ? [w.atMost(question.max)] : [])].join(", ");
  const rows = (questions, prefix = "") => questions.flatMap(question => {
    const key = prefix ? `${prefix}.${question.id}` : question.id;
    const row = {key, question, cells: [`\`${key}\``, cell(question.label), cell(kindOf(question)), cell(defaultOf(question)), cell(shownWhen(question, questions))],
      options: (question.options ?? []).map(option => cell(option.label))};
    return [row, ...(question.kind === "list" ? rows(question.fields, key) : [])];
  });
  return {lang, words: w, catalog, paths: catalog.paths.map(path => ({id: path.id, group: path.group, title: path.title, heading: `### ${path.title} (\`${path.id}\`)`, rows: rows(path.questions)}))};
}

/** The rows of a path's table as Markdown, the last column left for the explanation. */
export function skeletonOf(path, words) {
  return [words.header, "|---|---|---|---|---|---|", ...path.rows.map(row => `| ${row.cells.join(" | ")} | ${row.options.map(option => `**${option}**`).join(", ")} |`)].join("\n");
}

/** A guide split into path sections ("### Title (`id`)") with their table rows (cells unescaped of \|). */
export function parseGuide(markdown) {
  const sections = new Map();
  let current = null;
  for (const line of markdown.split("\n")) {
    const heading = /^### .*\(`([A-Za-z0-9]+)`\)\s*$/.exec(line);
    if (heading) { current = {id: heading[1], heading: line.trim(), rows: new Map(), lines: []}; sections.set(current.id, current); continue; }
    if (/^#{1,3} /.test(line)) { current = null; continue; }
    if (!current) continue;
    current.lines.push(line);
    if (/^\| `[^`]+` \|/.test(line)) {
      const cells = line.trim().replace(/^\||\|$/g, "").split(/(?<!\\)\|/).map(part => part.trim());
      current.rows.set(cells[0].replace(/`/g, ""), cells);
    }
  }
  return sections;
}

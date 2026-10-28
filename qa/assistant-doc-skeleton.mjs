/* The assistant guide's missing or outdated parts, ready to paste: node qa/assistant-doc-skeleton.mjs [en|fr] [pathId...]
   Prints, for each path whose section is missing or whose question rows differ from the assistant (a new question,
   a changed label, default or visibility), the section heading and its table; the last column keeps the explanation
   already written, else lists the options to explain. tests/assistant-docs.test.mjs fails until the guide matches. */
import fs from "node:fs";
import {GUIDES, guideModel, parseGuide, skeletonOf} from "../tests/helpers/assistant-docs.mjs";

const [lang = "en", ...only] = process.argv.slice(2);
if (!GUIDES[lang]) { console.error(`Language ${lang}: one of ${Object.keys(GUIDES).join(", ")}.`); process.exit(1); }
const root = new URL("../", import.meta.url), model = guideModel(lang, root);
const file = new URL(GUIDES[lang], root), sections = fs.existsSync(file) ? parseGuide(fs.readFileSync(file, "utf8")) : new Map();
let printed = 0;
for (const path of model.paths) {
  if (only.length && !only.includes(path.id)) continue;
  const section = sections.get(path.id);
  const same = section && section.heading === path.heading && section.rows.size === path.rows.length
    && path.rows.every(row => row.cells.every((value, i) => section.rows.get(row.key)?.[i] === value));
  if (same && !only.length) continue;
  // Keep what is already explained for a question that is still there.
  const table = skeletonOf(path, model.words).split("\n").map(line => {
    const key = /^\| `([^`]+)` \|/.exec(line)?.[1], written = key && section?.rows.get(key)?.[5];
    return written ? line.replace(/\| [^|]*\|$/, `| ${written} |`) : line;
  });
  console.log(`${path.heading}\n\n${table.join("\n")}\n`);
  printed++;
}
if (!printed) console.log(`${GUIDES[lang]} matches the assistant.`);

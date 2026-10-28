import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {GUIDES, guideModel, parseGuide} from './helpers/assistant-docs.mjs';

// The assistant guides follow the assistant: every path and question documented in English and French, with the
// interface's words, defaults and display conditions. `node qa/assistant-doc-skeleton.mjs <en|fr>` prints what to redo.
const root = new URL('../', import.meta.url);
const CREATES = {en: '**What it builds:**', fr: '**Ce que ça crée :**'};

for (const [lang, file] of Object.entries(GUIDES)) {
  test(`Assistant guide (${lang}): every path and question is documented as the assistant shows it`, () => {
    const markdown = fs.readFileSync(new URL(file, root), 'utf8'), sections = parseGuide(markdown), model = guideModel(lang, root);
    const hint = ` (node qa/assistant-doc-skeleton.mjs ${lang})`;
    for (const path of model.paths) {
      const section = sections.get(path.id);
      assert.ok(section, `${file}: no section for the path ${path.id}${hint}`);
      assert.equal(section.heading, path.heading, `${file}: heading of ${path.id}${hint}`);
      assert.ok(markdown.includes(`<a id="path-${path.id}"></a>\n${path.heading}`), `${file}: anchor path-${path.id} before its heading`);
      assert.ok(section.lines.some(line => line.startsWith(CREATES[lang]) && line.length > CREATES[lang].length + 10), `${file}: ${path.id} says what it builds`);
      assert.deepEqual([...section.rows.keys()], path.rows.map(row => row.key), `${file}: questions of ${path.id}, in the form's order${hint}`);
      for (const row of path.rows) {
        const cells = section.rows.get(row.key);
        assert.deepEqual(cells.slice(0, 5), row.cells, `${file}: ${path.id}.${row.key} (question, kind, default, shown when)${hint}`);
        const explanation = cells[5] ?? '';
        assert.ok(explanation.length >= 8 && !/TODO/.test(explanation), `${file}: ${path.id}.${row.key} is not explained`);
        for (const option of row.options) assert.ok(explanation.includes(`**${option}**`), `${file}: ${path.id}.${row.key} does not explain the option "${option}"`);
      }
    }
    for (const id of sections.keys()) assert.ok(model.paths.some(path => path.id === id), `${file}: section ${id} is not an assistant path`);
    // Every link to a path or a section of the guide leads somewhere.
    const anchors = new Set([...markdown.matchAll(/<a id="([^"]+)"><\/a>/g)].map(match => match[1]));
    for (const [, anchor] of markdown.matchAll(/\]\(#([^)]+)\)/g)) assert.ok(anchors.has(anchor), `${file}: broken link #${anchor}`);
  });
}

test('Assistant guides: each links to the other, and the GM guide and README link to them', () => {
  const read = file => fs.readFileSync(new URL(file, root), 'utf8');
  assert.ok(read(GUIDES.en).includes('(assistant-guide.fr.md)'));
  assert.ok(read(GUIDES.fr).includes('(assistant-guide.md)'));
  assert.ok(read('docs/gm-guide.md').includes('(assistant-guide.md)'));
  assert.ok(read('README.md').includes('docs/assistant-guide.md') && read('README.md').includes('docs/assistant-guide.fr.md'));
});

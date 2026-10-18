import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const template = readFileSync(new URL("../templates/configurator/entry-editor.hbs", import.meta.url), "utf8").replace(/\r\n/g, "\n");
const css = readFileSync(new URL("../styles/sheet-builder.css", import.meta.url), "utf8").replace(/\r\n/g, "\n");
const editor = readFileSync(new URL("../src/configurator/configurator-entry-editor.mjs", import.meta.url), "utf8").replace(/\r\n/g, "\n");

test("the sheet editor has three zones, each scrolled on its own, and the window buttons outside them", () => {
  const start = template.indexOf("{{#if isSheetDefinition}}"), end = template.indexOf("\n    {{else}}\n", start) + 5, sheet = template.slice(start, end);
  const tools = sheet.indexOf("data-entry-scroll-tools"), main = sheet.indexOf("data-entry-scroll "), layers = sheet.indexOf("data-entry-scroll-layers");
  assert.ok(start >= 0 && tools > 0 && main > tools && layers > main, "tools, then the sheet, then the Layers");
  // The sheet's settings come before the preview, in the middle zone; the Layers host is in the right zone.
  const middle = sheet.slice(main, layers);
  for (const part of ["data-entry-help", '{{> rtaIdentityName}}', 'name="sheetTarget"', "data-sheet-file", "data-layout-widths", "data-layout-canvas"]) assert.ok(middle.includes(part), part);
  assert.ok(middle.indexOf('name="sheetTarget"') < middle.indexOf("data-layout-canvas"));
  assert.ok(sheet.slice(layers).includes("data-layout-layers-host") && !sheet.slice(0, main).includes("data-layout-layers-host"));
  // Only the sheet editor changes: every other kind keeps the one scroll.
  assert.match(template.slice(end), /^\{\{else\}\}\s*<div data-entry-scroll class="rta-config-entry__scroll">/);
  assert.ok(template.indexOf("<footer", end) > end);
  assert.match(editor, /scrollable:\["\[data-entry-scroll\]","\[data-entry-scroll-tools\]","\[data-entry-scroll-layers\]"\]/);
});

test("the three zones fall back by container queries on the window, never @media", () => {
  assert.doesNotMatch(css, /@media/);
  assert.match(css, /@container rta-window \(inline-size >= 640px\)[\s\S]*?grid-template-areas: "side side-bar main" "layers side-bar main"/);
  assert.match(css, /@container rta-window \(inline-size >= 960px\)[\s\S]*?grid-template-areas: "side side-bar main layers-bar layers"/);
});

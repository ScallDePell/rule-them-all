/** Presentation-only hierarchy: Ruleset -> navigation section -> collection/type.
 * Section membership is the existing configurator navigation contract, never game data.
 * No color is hard-coded for any section or object family.
 */
import {COLLECTION_FIELDS} from './configurator-schema.mjs';

export const DEFAULT_RULESET_COLOR = '#666666';
export const RULESET_SECTIONS = Object.freeze([
  {id:'general', titleKey:'RTA.Nav.General', collections:[]},
  {id:'definitions', titleKey:'RTA.Nav.Definitions', collections:['definitionTypes','definitions']},
  {id:'content', titleKey:'RTA.Nav.Content', collections:['contentTypes','contentTemplates']},
  {id:'rules', titleKey:'RTA.Nav.Rules', collections:['parameters','formulas','formulaBindings','conditions','rolls','outcomes','tests','effects','actions','modifiers','durations','dice','tables','scales']},
  {id:'orchestration', titleKey:'RTA.Nav.Orchestration', collections:['permissionPolicies','eventTypes','triggers']},
  {id:'systems', titleKey:'RTA.Nav.Systems', collections:['creationSystems','progressionSystems','sheetDefinitions','sheetTemplates','sheetThemes']},
  {id:'organization', titleKey:'RTA.Nav.Organization', collections:['tags']},
  {id:'tools', titleKey:'RTA.Nav.Tools', collections:[]}
]);
const sectionByCollection = new Map(RULESET_SECTIONS.flatMap(section => section.collections.map(collection => [collection, section.id])));
if (sectionByCollection.size !== COLLECTION_FIELDS.length || COLLECTION_FIELDS.some(c=>!sectionByCollection.has(c))) {
  throw new Error('Ruleset section color mapping is out of sync with collection schema.');
}
export const sectionForCollection = collection => sectionByCollection.get(collection) ?? null;
export const isHexColor = color => typeof color === 'string' && /^#[0-9a-fA-F]{6}$/.test(color);
export const resolvedColor = color => isHexColor(color) ? color : DEFAULT_RULESET_COLOR;
export function rulesetColor(ruleset) { return resolvedColor(ruleset?.color); }
export function sectionColor(ruleset, sectionId) {
  return resolvedColor(ruleset?.sectionColors?.[sectionId]);
}
export function mayOverrideSection(ruleset, sectionId) {
  return ruleset?.sectionColorOverrides?.[sectionId] === true;
}
export function collectionColor(ruleset, collection) {
  const section=sectionForCollection(collection);
  if (!section) return DEFAULT_RULESET_COLOR;
  return mayOverrideSection(ruleset,section) && isHexColor(ruleset?.familyColors?.[collection])
    ? ruleset.familyColors[collection] : sectionColor(ruleset,section);
}
export function objectColor(ruleset, collection, entry) {
  const section=sectionForCollection(collection);
  if (!section) return DEFAULT_RULESET_COLOR;
  if (mayOverrideSection(ruleset,section) && ['definitionTypes','contentTypes','tags'].includes(collection) && isHexColor(entry?.color)) return entry.color;
  return collectionColor(ruleset,collection);
}
export const effectiveCollectionList = ruleset => COLLECTION_FIELDS.filter(collection => Array.isArray(ruleset?.[collection]));

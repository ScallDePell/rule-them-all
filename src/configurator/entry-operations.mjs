/** Stable editor routing for Core entry kinds.
 * All persistence method names are declared here, not embedded in UI markup.
 * Ruleset (root aggregate) follows its own lifecycle, outside this registry.
 */
export const ENTRY_OPERATIONS=Object.freeze({
  definitionType:{get:"getDefinitionType",create:"registerDefinitionType",update:"updateDefinitionType",delete:"deleteDefinitionType"},
  definition:{get:"getDefinition",create:"createDefinition",update:"updateDefinition",delete:"deleteDefinition"},
  parameter:{get:"getParameter",create:"createParameter",update:"updateParameter",delete:"deleteParameter"},
  formula:{get:"getFormula",create:"createFormula",update:"updateFormula",delete:"deleteFormula"},
  formulaBinding:{get:"getFormulaBinding",create:"createFormulaBinding",update:"updateFormulaBinding",delete:"deleteFormulaBinding"},
  condition:{get:"getCondition",create:"createCondition",update:"updateCondition",delete:"deleteCondition"},
  roll:{get:"getRoll",create:"createRoll",update:"updateRoll",delete:"deleteRoll"},
  outcome:{get:"getOutcome",create:"createOutcome",update:"updateOutcome",delete:"deleteOutcome"},
  test:{get:"getTest",create:"createTest",update:"updateTest",delete:"deleteTest"},
  effect:{get:"getEffect",create:"createEffect",update:"updateEffect",delete:"deleteEffect"},
  action:{get:"getAction",create:"createAction",update:"updateAction",delete:"deleteAction"},
  permissionPolicy:{get:"getPermissionPolicy",create:"createPermissionPolicy",update:"updatePermissionPolicy",delete:"deletePermissionPolicy"},
  eventType:{get:"getEventType",create:"createEventType",update:"updateEventType",delete:"deleteEventType"},
  trigger:{get:"getTrigger",create:"createTrigger",update:"updateTrigger",delete:"deleteTrigger"},
  contentType:{get:"getContentType",create:"createContentType",update:"updateContentType",delete:"deleteContentType"},
  contentTemplate:{get:"getContentTemplate",create:"createContentTemplate",update:"updateContentTemplate",delete:"deleteContentTemplate"},
  category:{get:"getCategory",create:"createCategory",update:"updateCategory",delete:"deleteCategory"},
  tag:{get:"getTag",create:"createTag",update:"updateTag",delete:"deleteTag"},
  reference:{get:"getReference",create:"createReference",update:"updateReference",delete:"deleteReference"},
  modifier:{get:"getModifier",create:"createModifier",update:"updateModifier",delete:"deleteModifier"},
  restriction:{get:"getRestriction",create:"createRestriction",update:"updateRestriction",delete:"deleteRestriction"},
  duration:{get:"getDuration",create:"createDuration",update:"updateDuration",delete:"deleteDuration"},
  creationSystem:{get:"getCreationSystem",create:"createCreationSystem",update:"updateCreationSystem",delete:"deleteCreationSystem"},
  progressionSystem:{get:"getProgressionSystem",create:"createProgressionSystem",update:"updateProgressionSystem",delete:"deleteProgressionSystem"},
  sheetDefinition:{get:"getSheetDefinition",create:"createSheetDefinition",update:"updateSheetDefinition",delete:"deleteSheetDefinition"}
});

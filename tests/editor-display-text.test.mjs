import test from 'node:test';
import assert from 'node:assert/strict';
import {pickerSummary,missingTargetLabel,editorDisplayTitle} from '../src/ui/editor-display-text.mjs';
test('editor display formatting preserves English reference labels and summaries',()=>{
 assert.equal(pickerSummary([]),'None selected');
 assert.equal(pickerSummary([{selected:true,label:'A'},{selected:true,label:'B'}]),'A, B');
 assert.equal(pickerSummary(['A','B','C','D'].map(label=>({label,selected:true}))),'4 selected · A, B…');
 assert.equal(missingTargetLabel('definition','missing'),'definition / missing · missing target');
 assert.equal(editorDisplayTitle(true,'definition'),'Create definition');
 assert.equal(editorDisplayTitle(false,'Strength'),'Edit Strength');
});
test('editor UI labels are localized without changing internal IDs',()=>{
 const before=globalThis.game;
 globalThis.game={i18n:{localize:token=>({'RTA.EditorDisplay.NoneSelected':'Aucune sélection','RTA.EditorDisplay.Selected':'choisis','RTA.EditorDisplay.MissingTarget':'introuvable','RTA.EditorDisplay.EditEntry':'Modifier {name}'})[token]??token}};
 try{
  assert.equal(pickerSummary([]),'Aucune sélection');
  assert.equal(pickerSummary(['A','B','C','D'].map(label=>({label,selected:true}))),'4 choisis · A, B…');
  assert.equal(missingTargetLabel('definition','still-the-same-id'),'definition / still-the-same-id · introuvable');
  assert.equal(editorDisplayTitle(false,'Force'),'Modifier Force');
 }finally{globalThis.game=before;}
});

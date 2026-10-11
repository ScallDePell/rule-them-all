/** Neutral defaults for RTA editor entries. All game-specific rules belong to Rulesets.
 * No Foundry/window access; dependencies are injected by the caller.
 */
export function createEntrySeed(kind,{uid,definitionTypeId=null,contentTypeId=null,getDefinitionType=()=>null,listContentTypes=()=>[]}={}){
  if(kind==="ruleset")return{id:"",nameKey:"",descriptionKey:"",version:"1.0.0",color:null,sectionColors:{},sectionColorOverrides:{},familyColors:{}};
  if(kind==="definitionType")return{id:uid("type"),key:"",nameKey:"",descriptionKey:"",color:null,enabled:true,order:0,allowedCapabilities:[],defaultCapabilities:[],requiredCapabilities:[],fields:{},constraints:[]};
  if(kind==="definition"){
      const type=getDefinitionType(definitionTypeId);
      const capabilities=[...new Set([...(type?.defaultCapabilities??[]),...(type?.requiredCapabilities??[])])];
      return{id:uid("definition"),key:"",definitionTypeId:definitionTypeId,nameKey:"",descriptionKey:"",data:{},categories:[],capabilities,enabled:true,order:0,tags:[]};
    }
  if(kind==="parameter")return{id:uid("parameter"),nameKey:"",descriptionKey:"",enabled:true,order:0,tags:[],valueType:"number",nullable:false,value:0,scope:"ruleset"};
  if(kind==="formula")return{id:uid("formula"),nameKey:"",descriptionKey:"",enabled:true,order:0,tags:[],resultType:"number",expression:{type:"literal",value:0}};
  if(kind==="formulaBinding")return{id:uid("binding"),nameKey:"",descriptionKey:"",enabled:true,order:0,tags:[],formulaRef:"",targetRef:{objectKind:"definition",objectId:"",capabilityId:"",outputId:""},targetRole:"self"};
  if(kind==="condition")return{id:uid("condition"),nameKey:"",descriptionKey:"",enabled:true,order:0,tags:[],expression:{type:"literal",value:true}};
  if(kind==="roll")return{id:uid("roll"),nameKey:"",descriptionKey:"",enabled:true,order:0,tags:[],formula:"",data:{}};
  if(kind==="outcome")return{id:uid("outcome"),nameKey:"",descriptionKey:"",enabled:true,order:0,tags:[],resultKey:"",priority:0,conditionRef:null,labelKey:""};
  if(kind==="test")return{id:uid("test"),nameKey:"",descriptionKey:"",enabled:true,order:0,tags:[],rollRef:"",bonusFormulaRef:null,targetFormulaRef:null,targetValue:null,outcomeRefs:[],fallbackOutcomeRef:null};
  if(kind==="effect")return{id:uid("effect"),nameKey:"",descriptionKey:"",enabled:true,order:0,tags:[],targetRef:{objectKind:"definition",objectId:""},operation:"set",operand:{kind:"literal",value:0}};
  if(kind==="action")return{id:uid("action"),nameKey:"",descriptionKey:"",enabled:true,order:0,tags:[],conditionRefs:[],costEffectRefs:[],effectRefs:[],testRef:null,outcomeMappings:[]};
  if(kind==="permissionPolicy")return{id:uid("permission"),nameKey:"",descriptionKey:"",enabled:true,order:0,scope:{objectKind:"ruleset"},rules:[],defaultEffect:"DENY"};
  if(kind==="eventType")return{id:uid("event"),nameKey:"",descriptionKey:"",enabled:true,order:0,tags:[],payloadFields:{},roles:[]};
  if(kind==="trigger")return{id:uid("trigger"),nameKey:"",descriptionKey:"",enabled:true,order:0,tags:[],eventTypeId:"",eventFilter:null,conditionRefs:[],actionRefs:[]};
  if(kind==="contentType")return{id:uid("content-type"),nameKey:"",descriptionKey:"",image:"",color:null,enabled:true,order:0,tags:[],storageKind:"item",documentSubtype:"",runtimeMode:"unique",fields:{}};
  if(kind==="contentTemplate")return{id:uid("template"),nameKey:"",descriptionKey:"",image:"",data:{},enabled:true,order:0,tags:[],contentTypeId:contentTypeId??listContentTypes()[0]?.id??"",definitionBindings:[],actionBindings:[],initialStateRules:[],categories:[],capabilities:[],runtimeMode:"unique"};
  if(kind==="category")return{id:uid("category"),nameKey:"",descriptionKey:"",enabled:true,order:0};
  if(kind==="tag")return{id:uid("tag"),nameKey:"",descriptionKey:"",enabled:true,order:0,color:null};
  if(kind==="reference")return{id:uid("reference"),objectKind:"definition",objectId:""};
  if(kind==="modifier")return{id:uid("modifier"),nameKey:"",descriptionKey:"",enabled:true,order:0,tags:[],targetRef:{objectKind:"definition",objectId:""},operation:"add",valueSource:{kind:"literal",value:0},conditionRefs:[],stacking:{mode:"stack",group:""},priority:0};
  if(kind==="restriction")return{id:uid("restriction"),nameKey:"",descriptionKey:"",enabled:true,order:0,tags:[],operationKinds:[],conditionRefs:[],effect:"deny",priority:0,messageKey:""};
  if(kind==="duration")return{id:uid("duration"),nameKey:"",descriptionKey:"",enabled:true,order:0,tags:[],mode:"persistent",amount:null,unit:null,eventTypeRef:null,conditionRef:null};
  if(kind==="creationSystem")return{id:uid("creation"),nameKey:"",descriptionKey:"",enabled:true,order:0,tags:[],steps:[]};
  if(kind==="progressionSystem")return{id:uid("progression"),nameKey:"",descriptionKey:"",enabled:true,order:0,tags:[],tracks:[]};
  if(kind==="sheetDefinition")return{id:uid("sheet"),nameKey:"New Sheet",descriptionKey:"",enabled:true,order:0,tags:[],viewType:"actor",renderer:"foundry",layout:{direction:"column",components:[]}};
  return{id:uid(kind),nameKey:"",descriptionKey:"",enabled:true,order:0,tags:[]};
  }


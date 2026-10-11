/** Read-only presentation of DependencyIndex edges. No alternate persistence. */
const COLLECTIONS = {definition:'definitions',definitionType:'definitionTypes',parameter:'parameters',formula:'formulas',formulaBinding:'formulaBindings',condition:'conditions',roll:'rolls',outcome:'outcomes',test:'tests',effect:'effects',action:'actions',permissionPolicy:'permissionPolicies',eventType:'eventTypes',trigger:'triggers',modifier:'modifiers',restriction:'restrictions',duration:'durations',creationSystem:'creationSystems',progressionSystem:'progressionSystems',sheetDefinition:'sheetDefinitions',contentType:'contentTypes',contentTemplate:'contentTemplates',category:'categories',tag:'tags',reference:'references'};
const LABELS={definition:'Definition',definitionType:'Definition type',parameter:'Parameter',formula:'Formula',formulaBinding:'Derived output',condition:'Condition',roll:'Roll',outcome:'Outcome',test:'Test',effect:'Effect',action:'Action',permissionPolicy:'Permission',eventType:'Event type',trigger:'Trigger',modifier:'Modifier',restriction:'Restriction',duration:'Duration',creationSystem:'Creation system',progressionSystem:'Progression system',sheetDefinition:'Sheet',contentType:'Content type',contentTemplate:'Content',category:'Category',tag:'Tag',reference:'Reference'};
const alias = kind => kind === 'eventType' ? 'eventType' : kind === 'contentTemplat' ? 'contentTemplate' : kind;
const key = ref => `${alias(ref?.objectKind)}:${ref?.objectId}`;
export function buildDependencyExplorer(ruleset, edges, resolveName=(entry)=>entry.nameKey||entry.name||entry.id){
  const objects=new Map();
  for(const [kind,collection] of Object.entries(COLLECTIONS))for(const entry of ruleset?.[collection]??[]){
    if(!entry?.id)continue;
    objects.set(`${kind}:${entry.id}`,{key:`${kind}:${entry.id}`,kind,id:entry.id,name:String(resolveName(entry,kind)||entry.id),type:LABELS[kind]||kind,found:true});
  }
  const object = ref => {
    const k=key(ref),found=objects.get(k);
    return found??{key:k,kind:alias(ref?.objectKind),id:String(ref?.objectId??''),name:String(ref?.objectId??''),type:LABELS[alias(ref?.objectKind)]||String(ref?.objectKind??''),found:false};
  };
  const groups=new Map();
  for(const edge of edges??[]){
    const consumer=object(edge.consumerRef),target=object(edge.targetRef);
    let group=groups.get(consumer.key);
    if(!group){group={...consumer,relations:[],targets:new Set(),unresolved:0};groups.set(consumer.key,group);}
    group.relations.push({target,kind:edge.kind,path:edge.path,strength:edge.strength});
    group.targets.add(target.key);
    if(!target.found)group.unresolved++;
  }
  return [...groups.values()].map(g=>({...g,relationCount:g.relations.length,targetCount:g.targets.size,relations:g.relations.sort((a,b)=>a.target.name.localeCompare(b.target.name)),targets:undefined})).sort((a,b)=>a.name.localeCompare(b.name));
}

/** One-hop, read-only graph derived exclusively from DependencyIndex edges. */
export function buildDependencyGraph(groups, selectedKey, limit=9){
  const center=groups.find(g=>g.key===selectedKey);
  if(!center)return {nodes:[],edges:[],width:800,height:360,omitted:0};
  const outgoing=new Map(),incoming=new Map();
  for(const group of groups)for(const rel of group.relations){
    if(group.key===selectedKey && rel.target.key!==selectedKey){
      if(!outgoing.has(rel.target.key))outgoing.set(rel.target.key,{...rel.target,relations:[]});
      outgoing.get(rel.target.key).relations.push(rel);
    }
    if(rel.target.key===selectedKey && group.key!==selectedKey){
      if(!incoming.has(group.key))incoming.set(group.key,{...group,relations:[]});
      incoming.get(group.key).relations.push(rel);
    }
  }
  const left=[...incoming.values()].slice(0,limit),right=[...outgoing.values()].slice(0,limit);
  const count=Math.max(left.length,right.length,1),height=Math.max(360,count*72+70);
  const selectable=new Set(groups.map(g=>g.key));
  const nodes=[{...center,selectable:true,x:330,y:(height-58)/2,center:true,shortName:center.name.length>25?center.name.slice(0,24)+'…':center.name}];
  const place=(items,x)=>items.forEach((item,i)=>nodes.push({...item,selectable:selectable.has(item.key),x,y:35+i*(height-70)/Math.max(items.length,1),shortName:item.name.length>25?item.name.slice(0,24)+'…':item.name}));
  place(left,24);place(right,625);
  const edges=[];
  for(const node of nodes.filter(n=>!n.center)){
    const source=node.x<330?node:nodes[0],target=node.x<330?nodes[0]:node;
    const x1=source.x+155,y1=source.y+29,x2=target.x,y2=target.y+29;
    const mid=(x1+x2)/2;
    edges.push({path:`M ${x1} ${y1} C ${mid} ${y1}, ${mid} ${y2}, ${x2} ${y2}`,title:`${source.name} → ${target.name}`,unresolved:!source.found||!target.found});
  }
  return {nodes,edges,width:805,height,omitted:Math.max(0,incoming.size-left.length)+Math.max(0,outgoing.size-right.length),incomingCount:incoming.size,outgoingCount:outgoing.size};
}

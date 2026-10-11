from __future__ import annotations
import re,json,html,sys,copy,os
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT=Path(sys.argv[1]) if len(sys.argv)>1 else Path(__file__).resolve().parent.parent
OUT=Path(sys.argv[2]) if len(sys.argv)>2 else Path.cwd()/'rta-ui-qa'
OUT.mkdir(parents=True,exist_ok=True)
SOURCE=(ROOT/'templates/configurator/entry-editor.hbs').read_text()
CSS='\n'.join((ROOT/rel).read_text() for rel in json.loads((ROOT/'module.json').read_text())['styles'])
QA_LOCALE=os.environ.get('RTA_QA_LOCALE','en')
if QA_LOCALE not in ('en','fr'):raise ValueError('Only FR/EN QA locales are supported')
TEST_LOCALE=json.loads((ROOT/f'lang/{QA_LOCALE}.json').read_text())
SELECT=(ROOT/'src/ui/rta-select.mjs').read_text().replace('import {normalizedSelectColors} from "./select-option-presentation.mjs";','').replace('export ','').replace('import {selectUiText,selectionPlaceholder} from "./select-text.mjs";','')
SELECT_TEXT=(ROOT/'src/ui/select-text.mjs').read_text().replace('export ','') if (ROOT/'src/ui/select-text.mjs').exists() else ''
# The browser fixture injects the actual schema-derived collection mapping,
# so it tests the production colour resolver after ESM imports are stripped.
SCHEMA=(ROOT/'src/configurator/configurator-schema.mjs').read_text()
COLLECTION_NAMES=re.findall(r'"([^"]+)"',re.search(r'COLLECTION_FIELDS\s*=\s*Object\.freeze\(\[([\s\S]*?)\]\)',SCHEMA).group(1))
COLLECTION_TO_KIND_FIXTURE={name:(name[:-3]+'y' if name.endswith('ies') else name[:-1] if name.endswith('s') else name) for name in COLLECTION_NAMES}
PALETTE=(ROOT/'src/ui/select-option-presentation.mjs').read_text()
RULESET_COLORS=(ROOT/'src/configurator/ruleset-colors.mjs').read_text().replace("import {COLLECTION_FIELDS} from './configurator-schema.mjs';",'const COLLECTION_FIELDS='+json.dumps(COLLECTION_NAMES)+';').replace('export ','')
PALETTE=PALETTE.replace('import {objectColor} from "../configurator/ruleset-colors.mjs";','').replace('import {RTA_NEUTRAL_COLOR} from "./theme-tokens.mjs";','').replace('import {COLLECTION_TO_KIND} from "../configurator/relation-contract.mjs";','').replace('export ','')
COLORS=(ROOT/'src/ui/theme-tokens.mjs').read_text().replace('export ','')+'\n'+RULESET_COLORS+'\nconst COLLECTION_TO_KIND=Object.freeze('+json.dumps(COLLECTION_TO_KIND_FIXTURE)+');\n'+PALETTE
KINDS=['Ruleset','DefinitionType','Definition','ContentType','ContentTemplate','Formula','FormulaBinding','Condition','Roll','Outcome','Test','Effect','Action','EventType','Tag','Parameter','PermissionPolicy','Trigger','SheetDefinition','CreationSystem','Reference','Modifier','Restriction','Duration','ProgressionSystem']
# Handlebars subset used by this project's template: if/unless/each/else and inline partials.
TOK=re.compile(r'(\{\{\{[^}]+\}\}\}|\{\{[^}]+\}\})')
class Frame:
 def __init__(self,tag='',expr='',parent=None):self.tag=tag;self.expr=expr;self.children=[];self.other=[];self.target=self.children;self.parent=parent

def parse(source):
 root=Frame();cur=root
 for t in TOK.split(source):
  if not t:continue
  if not t.startswith('{{'):cur.target.append(('text',t));continue
  raw=t.startswith('{{{');token=t[3:-3].strip() if raw else t[2:-2].strip()
  if token.startswith(('#if ','#unless ','#each ','#*inline ')):
   typ,expr=token[1:].split(' ',1);child=Frame(typ,expr,cur);cur.target.append(('frame',child));cur=child
  elif token=='else':cur.target=cur.other
  elif token.startswith('/'):
   assert cur.parent is not None,token
   cur=cur.parent
  else:cur.target.append(('rawvar' if raw else 'var',token))
 assert cur is root
 return root.children

TREE=parse(SOURCE)
PARTIALS={}
def resolve(path,stack):
 path=path.strip()
 if path.startswith('(localize ') and path.endswith(')'):path=path[1:-1]
 if path.startswith('localize '):
  match=re.fullmatch(r'localize ["\']([^"\']+)["\']',path)
  if match:
   cur=TEST_LOCALE
   for piece in match.group(1).split('.'):
    cur=cur.get(piece) if isinstance(cur,dict) else None
   return match.group(1) if cur is None else cur
 if path in ('true','false'):return path=='true'
 if path in ('this','.') :return stack[-1]
 depth=0
 while path.startswith('../'):
  depth+=1;path=path[3:]
 if path.startswith('@'):return stack[-1].get(path[1:]) if isinstance(stack[-1],dict) else ''
 base=stack[max(0,len(stack)-depth-1)]
 if path.startswith('this.'):path=path[5:]
 for piece in path.split('.'):
  if piece=='' or piece=='this':continue
  base=(base.get(piece) if isinstance(base,dict) else getattr(base,piece,None))
  if base is None:return ''
 return base

def render(nodes,stack):
 out=[]
 for typ,content in nodes:
  if typ=='text':out.append(content)
  elif typ in ('var','rawvar'):
   v=content
   if v.startswith('>'):
    args=v[1:].strip().split(' ',1);part=args[0];ctx=stack
    if len(args)>1 and '=' in args[1]:
     name,thing=args[1].split('=',1);ctx=stack+[dict(stack[-1] if isinstance(stack[-1],dict) else {},**{name:resolve(thing.strip('"'),stack)})]
    out.append(render(PARTIALS[part],ctx))
   else:
    val=resolve(v,stack)
    out.append(('' if val in (None,False) else str(val)) if typ=='rawvar' else html.escape('' if val in (None,False) else str(val),quote=True))
  else:
   item=content
   if item.tag=='*inline':PARTIALS[item.expr.strip('"')]=item.children;continue
   val=resolve(item.expr,stack)
   if item.tag=='each':
    seq=val if isinstance(val,(list,tuple)) else (list(val.values()) if isinstance(val,dict) else [])
    if seq:
     for x in seq:out.append(render(item.children,stack+[x]))
    else:out.append(render(item.other,stack))
   else:
    truth=bool(val)
    if item.tag=='unless':truth=not truth
    out.append(render(item.children if truth else item.other,stack))
 return ''.join(out)

# Fixture values contain examples of static and repeating controls on real HBS branches.
C={'id':'demo','label':'Sample','name':'Sample','title':'Sample','color':'#808080','selected':True,'colors':'#808080','token':'d|1|||','enabled':True,'value':'demo','nameKey':'Exemple','valueType':'number','cardinality':'one','isOne':True,'defaultText':'0','type':'number'}
A=dict(C, isLiteral=False,isReference=True,operandLabel='Operand 1',literalValue='0',referenceChoices=[dict(C)],parameterChoices=[dict(C)],formulaChoices=[dict(C)])
B=dict(A,isLiteral=True,isReference=False,operandLabel='Operand 2')
context_default={'data':dict(C,enabled=True,contentTypeId='type'), 'readOnly':False,'creating':False,'tagSummary':'None', 'familyColorChoices':[dict(C)], 'error':'',
'formulaModel':dict(supported=True,opAdd=True,operands=[A,B]),'conditionModel':dict(supported=True,opGt=True), 'conditionOperands':[A,B],
'fieldRows':[dict(C, valueTypes=[dict(C)],hasDefault=True,isOne=True)],
'fieldContract':[dict(C)], 'capabilityChoices':[dict(C,permitted=True,allowed=True,required=True,hasContract=True,fieldItems=[dict(C)],outputItems=[dict(C)])],
'sheetComponentRows':[dict(C)], 'creationStepRows':[dict(C)], 'definitionBindingRows':[dict(C)], 'choiceGroupRows':[dict(C,definitionOptions=[dict(C)],actionOptions=[dict(C)])],
'eventFieldRows':[dict(C)], 'roleChoices':[dict(C)], 'sourceChoices':[dict(C)] }
for field in re.findall(r'\{\{#each ([\w.]+)\}\}',SOURCE):
 if '.' not in field and field not in context_default:context_default[field]=[dict(C)]

# Browser theme approximates Foundry defaults but uses actual RTA CSS and enhancement.
BASE='''
:root{--color-bg-option:#29232e;--color-text-primary:#eee;--color-border-light-primary:#615767;--color-border-highlight:#ccac72;--rta-editor-border:#615767;--color-cool-5:#15111b}
html,body{margin:0;padding:0;background:#0d0a14;color:#eae7eb;font:13px Arial,sans-serif}
body{display:block} .qa-root{margin:auto;padding:12px 14px;max-width:850px;box-sizing:border-box}
.rta-config-entry{height:auto;min-height:0;display:block;overflow:visible}
.rta-config-entry form[data-entry-form]{display:block;overflow:visible}
.rta-config-entry__scroll{display:block;overflow:visible}
fieldset{min-width:0;padding:12px;border:1px solid #564a60;border-radius:6px;margin:0 0 14px}
legend{font-weight:700;padding:0 9px}
button,select,input,textarea{font:inherit;color:#eee;background:#29232e;border:1px solid #655767;border-radius:4px;min-height:32px;box-sizing:border-box;padding:3px 9px}
input[type=checkbox]{min-height:0;padding:0;accent-color:#d7b24e}
input[type=color]{padding:0}
button{cursor:pointer} [hidden]{display:none !important}
'''

# RTA_FOUNDRY_CSS=<chemin de foundry2.css> : rend avec le vrai CSS du cœur Foundry
# (thème sombre) au lieu de l'imitation BASE ci-dessus.
FOUNDRY_CSS_PATH=os.environ.get('RTA_FOUNDRY_CSS')
if FOUNDRY_CSS_PATH:
 BASE='''
html,body{margin:0;padding:0}
/* La fenêtre occupe toute la largeur : largeur de fenêtre = largeur de vue. */
.application{position:relative;width:100%;box-sizing:border-box}
.qa-root{padding:16px;box-sizing:border-box}
.rta-config-entry{height:auto;min-height:0;display:block;overflow:visible}
.rta-config-entry form[data-entry-form]{display:block;overflow:visible}
.rta-config-entry__scroll{display:block;overflow:visible}
'''
 CSS=Path(FOUNDRY_CSS_PATH).read_text()+'\n'+CSS

def sample(kind):
 ctx=copy.deepcopy(context_default)
 if kind=='CreationSystem':ctx['creationStepRows']=json.loads((Path(__file__).resolve().parent/'fixtures/creation-steps.json').read_text())
 ctx['is'+kind]=True if kind not in ('Modifier','Restriction','Duration','ProgressionSystem') else False
 if kind in ('Modifier','Restriction','Duration','ProgressionSystem'):ctx['isGeneric']=True
 # Additional allowed local branch flags for exercising nested controls.
 ctx.update({'isUnique':True,'isOne':True,'isStorageActor':True,'isFull':True})
 s=render(TREE,[ctx]);return '<!doctype html><html lang="fr"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><style>'+CSS+'\n'+BASE+'</style><body class="theme-dark"><div class="application theme-dark"><main class="qa-root window-content">'+s+'</main></div><script>'+COLORS+'\n'+SELECT_TEXT+'\n'+SELECT+'\nwindow.__qaEnhanced=RTASelect.enhance(document.querySelector(".rta-config-entry"));window.__qaReady=true;</script></body></html>'

MEASURE='''() => {
const rect=n=>{const r=n.getBoundingClientRect();return {x:+r.x.toFixed(1),y:+r.y.toFixed(1),w:+r.width.toFixed(1),h:+r.height.toFixed(1),right:+r.right.toFixed(1)}};
const visible=e=>{const s=getComputedStyle(e);return s.display!=='none'&&s.visibility!=='hidden'&&e.getClientRects().length&&e.getBoundingClientRect().width>0&&(!e.closest('[hidden]'))&&(!e.closest('details:not([open])'))};
const label=e=>e.closest('.rta-form-row')?.querySelector(':scope > label, :scope > .rta-form-row__label')?.textContent?.trim() || e.closest('label')?.childNodes?.[0]?.textContent?.trim() || e.getAttribute('aria-label') || e.getAttribute('name')||e.dataset.fieldProp||e.dataset.stepProp||'';
const rows=[...document.querySelectorAll('.rta-form-row')].filter(visible);
const controls=[...document.querySelectorAll('.rta-config-entry :is(.rta-select__trigger,input:not([type=hidden]),textarea)')].filter(e=>!e.matches('.rta-select__native,.rta-select__search, input[type=checkbox], input[type=radio], input[type=color]')&&visible(e)&&!e.closest('.rta-select__panel'));
return {controls:controls.map(e=>({tag:e.classList.contains('rta-select__trigger')?'select':e.tagName.toLowerCase(),label:label(e),rect:rect(e),context:e.closest('.rta-rule-operand')?'operand':e.closest('.rta-sheet-component')?'sheet-component':e.closest('.rta-binding-card__values')?'binding-values':e.closest('.rta-config-entry__technical')?'technical':e.closest('.rta-form-row')?'form-row':'free',nearby: e.closest('.rta-config-entry__section,fieldset')?.querySelector(':scope > legend,:scope > summary')?.textContent?.trim().slice(0,80)||''})),rows:rows.map(e=>({label:e.querySelector(':scope > label, :scope > .rta-form-row__label')?.textContent?.trim(),rect:rect(e),grid:getComputedStyle(e).gridTemplateColumns,children:[...e.children].filter(visible).map(n=>({tag:n.tagName,rect:rect(n)}))})),overflow:[...document.querySelectorAll('.rta-select')].filter(visible).map(e=>({rect:rect(e),p:rect(e.parentElement),label:e.dataset.rtaSelectLabel})).filter(x=>x.rect.right>x.p.right+3)};
}'''

if __name__=='__main__':
 STYLE_DUMP='''() => [...document.querySelectorAll('body *')].map((el,i)=>{const s=getComputedStyle(el);const o={};for(const k of s)o[k]=s.getPropertyValue(k);return [i+':'+el.tagName+'.'+[...el.classList].join('.'),o]})'''
 results={};total=0
 with sync_playwright() as p:
  b=p.chromium.launch(headless=True,executable_path=os.environ.get('RTA_CHROMIUM','/usr/bin/chromium'),args=['--no-sandbox','--allow-file-access-from-files'])
  for width in (560,760,1250):
   for kind in KINDS:
    page=b.new_page(viewport={'width':width,'height':980},device_scale_factor=1)
    err=[];page.on('pageerror',lambda e:err.append(str(e)))
    markup=sample(kind)
    page.set_content(markup,wait_until='load');page.wait_for_function('window.__qaReady===true',timeout=10000)
    page.evaluate('''() => [...document.querySelectorAll('details')].forEach(el=>el.open=true)''')
    data=page.evaluate(MEASURE);data['errors']=err;results[f'{kind}-{width}']=data
    if os.environ.get('RTA_QA_STYLES'):(OUT/f'{kind}-{width}.styles.json').write_text(json.dumps(page.evaluate(STYLE_DUMP)))
    page.screenshot(path=str(OUT/f'{kind}-{width}.png'),full_page=True)
    total+=len(data['controls'])
    print(kind,width,'controls',len(data['controls']),'rows',len(data['rows']),'overflow',len(data['overflow']),'errors',err[:1],flush=True)
    page.close()
  b.close()
 (OUT/'measurements.json').write_text(json.dumps(results,ensure_ascii=False,indent=2))
 assert len(results)==len(KINDS)*3, 'Not all 25 editor kinds were rendered at 3 widths'
 single_line=[c for data in results.values() for c in data['controls'] if c['tag'] in ('input','select')]
 assert len(single_line)>=450, ('Too few single-line controls examined',len(single_line))
 heights={round(c['rect']['h'],1) for c in single_line}
 assert len(heights)==1, ('Non-canonical input/select heights',sorted(heights))
 for key,data in results.items():
  assert not data['errors'],(key,data['errors'])
  assert not data['overflow'],(key,data['overflow'])
  assert all(c['label'].strip() for c in data['controls'] if c['tag']=='select'),('Unlabeled selector',key)
  if not key.endswith('-560'):
   for row in data['rows']:
    children=row['children']
    if len(children)>=2 and children[0]['rect']['right']>children[1]['rect']['x']+1:
     raise AssertionError(('Form-row labels overlap controls',key,row['label']))
  normals=[c for c in data['controls'] if c['label']=='Name' and c['tag']=='input']
  if normals:
   base=normals[0]['rect']
   for control in data['controls']:
    if control['label'] not in ('Comparison','Operation','Tags','Actions granted','Capabilities','Definitions granted'):continue
    if control['label']=='Operation' and not key.startswith(('Condition','Formula')):continue
    if abs(control['rect']['right']-base['right'])>3:
     raise AssertionError(('Normal selector right edge differs from Name',key,control['label'],control['rect'],base))
 print(f'PASS: {len(KINDS)} kinds x 3 widths, {total} visible controls, {len(single_line)} single-line fields, height {next(iter(heights))} px')


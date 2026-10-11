/** Localized RTA Select text, independent of Ruleset data. */
export function selectUiText(key){
  const language=String(globalThis.game?.i18n?.lang??globalThis.document?.documentElement?.lang??"en").toLowerCase();
  const fr=language.startsWith("fr");
  const fallbacks={
    Single: ["Select a {label}","Sélectionner un {label}"],
    Multiple: ["Select one or more {label}","Sélectionner un ou plusieurs {label}"],
    SingularItem: ["item","objet"],
    PluralItems: ["items","objets"],
    GenericSelection: ["Selection","Choix"],
    Mode: ["mode","mode"],
    Search: ["Search…","Rechercher…"],
    OperandType: ["Operand type","Type d’opérande"],
    Parameter: ["Parameter","Paramètre"],
    Formula: ["Formula","Formule"],
    Reference: ["Reference","Référence"],
    ComponentType: ["Component type","Type de composant"],
    ComponentSource: ["Component source","Source du composant"],
    "Cardinality.One": ["Exactly one choice","Exactement un choix"],
    "Cardinality.Optional": ["At most one choice, optional","Au plus un choix, facultatif"],
    "Cardinality.Some": ["At least one choice","Au moins un choix"],
    "Cardinality.Any": ["Any number of choices, optional","Autant de choix que voulu, facultatif"],
  };
  const token=`RTA.Select.${key}`;
  const translation=globalThis.game?.i18n?.localize?.(token);
  return translation&&translation!==token?translation:(fallbacks[key]?.[fr?1:0]??key);
}
export function selectionPlaceholder(root,multiple){
  const label=String(root?.dataset?.rtaSelectLabel??"").trim();
  const name=label||selectUiText(multiple?"PluralItems":"SingularItem");
  const text=selectUiText(multiple?"Multiple":"Single");
  // English article: "an Action", "an Acquisition Action".
  return (/^select a \{label\}/i.test(text)&&/^[aeiou]/i.test(name)?text.replace(/^(select) a /i,"$1 an "):text).replaceAll("{label}",name);
}

const CARDINALITIES=new Set(["1","0..1","1..n","0..n"]);
/** Text key of each cardinality (dots in "0..1" cannot be i18n keys). */
export const CARDINALITY_KEYS=Object.freeze({"1":"One","0..1":"Optional","1..n":"Some","0..n":"Any"});
/** Cardinality an RTA Select shows (§46.8): an explicit data-cardinality wins;
 * otherwise single selects with an empty option, or pickers the GM can uncheck,
 * are 0..1, and multiple selects are 1..n only when required. */
export function selectCardinality({multiple=false,explicit="",native=null,radios=false}={}){
  if(CARDINALITIES.has(explicit))return explicit;
  if(radios)return "1";
  if(native){
    if(multiple)return native.required?"1..n":"0..n";
    return [...native.options].some(option=>option.value==="")||!native.required&&!native.options.length?"0..1":"1";
  }
  return multiple?"0..n":"0..1";
}

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
    Definitions: ["definitions","définitions"],
    Mode: ["mode","mode"],
    Search: ["Search…","Rechercher…"],
    OperandType: ["Operand type","Type d’opérande"],
    Parameter: ["Parameter","Paramètre"],
    Formula: ["Formula","Formule"],
    Reference: ["Reference","Référence"],
    ComponentType: ["Component type","Type de composant"],
    ComponentSource: ["Component source","Source du composant"],
  };
  const token=`RTA.Select.${key}`;
  const translation=globalThis.game?.i18n?.localize?.(token);
  return translation&&translation!==token?translation:(fallbacks[key]?.[fr?1:0]??key);
}
export function selectionPlaceholder(root,multiple){
  const label=String(root?.dataset?.rtaSelectLabel??"").trim();
  const name=label||selectUiText(multiple?"PluralItems":"SingularItem");
  return selectUiText(multiple?"Multiple":"Single").replaceAll("{label}",name);
}

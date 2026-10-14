/** Presentation-only template used by the generic constraints editor. */
import {escapeHTML as escape} from './html-utils.mjs';
import {CONSTRAINT_KINDS} from '../configurator/declarative-contracts.mjs';
import {localizedText} from './ui-localization.mjs';
export function renderDeclarativeConstraintRow({fields=[],labels={}}={}) {
 const options=fields.map(field=>`<option value="${escape(field.id)}" data-rta-colors="${escape(field.colors)}">${escape(field.label??field.id)}</option>`).join('');
 const kinds=CONSTRAINT_KINDS.map(kind=>`<option value="${escape(kind)}" data-rta-colors="#666666">${escape(localizedText(`RTA.Declarative.Kinds.${kind}`,kind))}</option>`).join('');
 return `<label>${escape(labels.field)} <select data-constraint-field>${options}</select></label><label>${escape(labels.rule)} <select data-constraint-kind>${kinds}</select></label><label>${escape(labels.value)} <input data-constraint-value></label><button type="button" data-action="removeDeclarativeConstraint" aria-label="${escape(labels.remove)}"><i class="fa-solid fa-trash"></i></button>`;
}

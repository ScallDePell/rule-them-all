/** Stable Ruleset reference token codec. Changes require a persistence compatibility test. */
export const refToken=ref=>[ref?.objectKind??"",ref?.objectId??"",ref?.capabilityId??"",ref?.slotId??"",ref?.outputId??""].map(v=>encodeURIComponent(String(v))).join("|");
export const parseRefToken=token=>{const [objectKind,objectId,capabilityId,slotId,outputId]=String(token??"").split("|").map(v=>decodeURIComponent(v??""));const ref={objectKind,objectId};if(capabilityId)ref.capabilityId=capabilityId;if(slotId)ref.slotId=slotId;if(outputId)ref.outputId=outputId;return ref;};

import {RUNTIME_LAB_SAMPLE_PRESETS} from "./runtime-lab-fixtures.mjs";

/** Create explicit SAMPLE Runtime Lab values for test Actors only.
 * Real Actors and the runtime engine never invoke this function.
 * A caller may supply presets for any Ruleset instead of RTA guessing game stats.
 */
export function buildRuntimeLabDemoProfile(ruleset,role="source",{presets=RUNTIME_LAB_SAMPLE_PRESETS}={}) {
  const canonicalRole=role==="pnj"?"target":role==="pj"?"source":role; // legacy caller compatibility
  const preset=presets?.[canonicalRole];
  if(!preset)throw new Error(`No Runtime Lab sample preset configured for role ${canonicalRole}.`);
  const sequence=preset.valueSequence;
  const maximum=Number(preset.poolMaximum);
  if(!Array.isArray(sequence)||!sequence.length||sequence.some(v=>!Number.isFinite(v))||!Number.isFinite(maximum)||maximum<0)
    throw new Error(`Invalid Runtime Lab sample preset for role ${canonicalRole}.`);
  const out={};
  let ordinal=0;
  for(const def of ruleset?.definitions??[]){
    if(def.enabled===false)continue;
    const caps=new Set(def.capabilities??[]),initial={};
    if(caps.has("value"))initial.base=sequence[ordinal++%sequence.length];
    if(caps.has("pool")){initial.maximum=maximum;initial.current=maximum;}
    if(caps.has("state"))initial.active=false;
    if(Object.keys(initial).length)out[def.id]=initial;
  }
  return out;
}

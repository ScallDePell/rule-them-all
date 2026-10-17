/* Game Settings > Rule Them'All > Repair the data: the GM checks the stored data, sees what would change, and repairs it
   in one click (a backup is downloaded first), then reloads the World. */
import {convertWorld} from "./stored-data-repair.mjs";
import {renderRepairContent} from "../ui/dialog-markup.mjs";

const translate = (key, data = {}) => globalThis.game?.i18n?.format?.(key, data) ?? key;
const dialog = () => globalThis.foundry.applications.api.DialogV2;
const frame = () => ({title: translate("RTA.Repair.Title")});

/** Check, show, repair. convert: the repair (convertWorld), reload: what reloads the World. */
export async function repairData({convert = convertWorld, Dialog = dialog(), reload = () => globalThis.foundry?.utils?.debouncedReload?.() ?? globalThis.location?.reload()} = {}) {
  let report;
  try { report = await convert(); }
  catch (error) { return Dialog.prompt({window: frame(), content: renderRepairContent(translate("RTA.Repair.Failed", {error: error?.message ?? String(error)})), rejectClose: false}); }
  if (!report.ok) return Dialog.prompt({window: frame(), content: renderRepairContent(translate("RTA.Repair.Failed", {error: report.error}), report.notes), rejectClose: false});
  if (!report.changed) return Dialog.prompt({window: frame(), content: renderRepairContent(translate("RTA.Repair.Nothing")), rejectClose: false});
  const confirmed = await Dialog.confirm({window: frame(), content: renderRepairContent(translate("RTA.Repair.Found"), report.notes), yes: {label: translate("RTA.Repair.Apply")}, rejectClose: false});
  if (!confirmed) return null;
  const done = await convert({write: true});
  if (!done.ok) return Dialog.prompt({window: frame(), content: renderRepairContent(translate("RTA.Repair.Failed", {error: done.error})), rejectClose: false});
  if (await Dialog.confirm({window: frame(), content: renderRepairContent(translate("RTA.Repair.Done")), yes: {label: translate("RTA.Repair.Reload")}, rejectClose: false})) reload();
  return done;
}

/** The settings menu entry. Foundry only accepts an ApplicationV2 subclass there and opens it with render(): the repair
    runs instead of a window. */
export function createRepairDataMenu({ApplicationV2}) {
  return class RepairDataMenu extends ApplicationV2 {
    async render() { repairData().catch(error => globalThis.ui?.notifications?.error?.(error?.message ?? String(error))); return this; }
  };
}

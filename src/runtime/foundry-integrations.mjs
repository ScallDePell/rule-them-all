/* The Foundry side of the sheet field services (src/integrations/field-services.mjs): Documents as the services see
   them, and the writes a sheet would make to their image, name and token. */
import {MODULE_ID} from "../core/module-contract.mjs";
import {sanitizeRichText, setTokenImage, tokenImage} from "./foundry-sheets.mjs";

const TEMPLATE_FLAG = "contentTemplate";

/** documents for createFieldServices. user(): the current Foundry user. */
export function foundryDocuments({fromUuid = uuid => globalThis.fromUuid?.(uuid), user = () => globalThis.game?.user} = {}) {
  return {
    async get(uuid) {
      const document = await fromUuid(uuid);
      if (!document || !["Actor", "Item"].includes(document.documentName)) return null;
      const who = user();
      return {
        uuid: document.uuid, id: document.id, documentName: document.documentName, name: document.name ?? "", img: document.img ?? "", token: tokenImage(document),
        canView: who ? document.testUserPermission?.(who, "LIMITED") ?? true : false, canUpdate: who ? Boolean(document.canUserModify?.(who, "update")) : false,
        // The Rule Them'All sheet Foundry shows for it (its SheetDefinition id), when one is chosen.
        sheetId: document.sheet?.constructor?.rtaSheetId ?? null,
        items: document.documentName === "Actor" ? [...(document.items ?? [])].map(item => ({id: item.id, name: item.name, img: item.img, managed: Boolean(item.getFlag?.(MODULE_ID, TEMPLATE_FLAG)?.managed)})) : [],
        ownerUuid: document.parent?.documentName === "Actor" ? document.parent.uuid : null,
        flag: document.documentName === "Item" ? document.getFlag?.(MODULE_ID, TEMPLATE_FLAG) ?? null : null,
        document
      };
    },
    update: (handle, data) => handle.document.update(data),
    setTokenImage: (handle, path, options) => setTokenImage(handle.document, path, options),
    sanitizeRichText: html => sanitizeRichText(html)
  };
}

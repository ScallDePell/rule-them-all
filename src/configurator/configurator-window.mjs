import {RTASelect} from "../ui/rta-select.mjs";
const {ApplicationV2, HandlebarsApplicationMixin} = foundry.applications.api;

/** Native chrome and PARTS.scrollable own resizing and rerender state. Only layout constraints are added. */
export class ConfiguratorWindow extends HandlebarsApplicationMixin(ApplicationV2) {
  static MINIMUM = {width: 480, height: 340};
  async _onRender(context, options) {
    await super._onRender?.(context, options);
    if (this.element?.style) Object.assign(this.element.style, {
      minWidth: `min(${this.constructor.MINIMUM.width}px, 100vw)`,
      minHeight: `min(${this.constructor.MINIMUM.height}px, 100vh)`, maxWidth: "100vw", maxHeight: "100vh"
    });
    if (this.window?.content?.style) Object.assign(this.window.content.style, {
      overflow: "hidden", minHeight: "0", display: "flex", flexDirection: "column"
    });
    if (options?.isFirstRender && this.element) this.setPosition({});
    // Progressive enhancement covers both Handlebars and dynamic JS insertions.
    RTASelect.enhance(this.element,{observe:true});
  }
}

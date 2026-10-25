/* The module's one integration registry: game.ruleThemAll.integrations is its public half. */
import {createIntegrationRegistry} from "./integration-registry.mjs";

export const integrations = createIntegrationRegistry();

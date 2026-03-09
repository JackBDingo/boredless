/**
 * Village of Shadows — game entry point
 * Exports code components only. Manifest is loaded from manifest.yaml separately.
 */
export { createModule } from './server/index.js';
export { VillageDisplay as DisplayComponent } from './display/VillageDisplay.js';
export { VillagePhone as PhoneComponent } from './phone/VillagePhone.js';

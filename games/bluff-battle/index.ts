/**
 * Bluff Battle — game entry point
 * Exports code components only. Manifest is loaded from manifest.yaml separately.
 */
export { createModule } from './server/index.js';
export { BBDisplay as DisplayComponent } from './display/BBDisplay.js';
export { BBPhone as PhoneComponent } from './phone/BBPhone.js';

/*
 * The brand the web app renders with. Brands themselves live one per YAML file in
 * config/brands/ — see src/brands.js — so the app and the pack CLI share one source
 * of truth for white-labelling.
 *
 * Set BRAND=meridian to run the app under a different MSP's branding.
 */

import { loadBrand } from '../src/brands.js';

export const BRANDING = loadBrand(process.env.BRAND ?? 'northgate');

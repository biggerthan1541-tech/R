/*
 * Per-MSP brand configs. One YAML file per MSP in config/brands/.
 *
 * A logo path is resolved relative to the brand file and inlined as a data URI, so a
 * generated pack is a single self-contained file that survives being emailed around.
 */

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { resolve, dirname, extname, basename } from 'node:path';
import { parse } from 'yaml';

const BRAND_DIR = resolve(import.meta.dirname, '../config/brands');

const MIME = {
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
};

function inlineLogo(logoPath, brandFile) {
  const abs = resolve(dirname(brandFile), logoPath);
  if (!existsSync(abs)) {
    throw new Error(`Brand logo not found: ${logoPath} (looked in ${abs})`);
  }
  const mime = MIME[extname(abs).toLowerCase()];
  if (!mime) throw new Error(`Unsupported logo type: ${extname(abs)}`);
  return `data:${mime};base64,${readFileSync(abs).toString('base64')}`;
}

export function listBrands() {
  if (!existsSync(BRAND_DIR)) return [];
  return readdirSync(BRAND_DIR)
    .filter((f) => f.endsWith('.yaml') || f.endsWith('.yml'))
    .map((f) => basename(f, extname(f)))
    .sort();
}

export function loadBrand(slug) {
  const file = [resolve(BRAND_DIR, `${slug}.yaml`), resolve(BRAND_DIR, `${slug}.yml`)].find(
    (p) => existsSync(p),
  );
  if (!file) {
    throw new Error(
      `Unknown brand "${slug}". Available: ${listBrands().join(', ') || '(none)'}`,
    );
  }

  const raw = parse(readFileSync(file, 'utf8')) ?? {};
  for (const key of ['companyName', 'accentColor']) {
    if (!raw[key]) throw new Error(`Brand "${slug}" is missing required field: ${key}`);
  }

  return {
    slug,
    companyName: raw.companyName,
    tagline: raw.tagline ?? '',
    accentColor: raw.accentColor,
    logo: raw.logo ? inlineLogo(raw.logo, file) : null,
    contact: {
      email: raw.contact?.email ?? '',
      phone: raw.contact?.phone ?? '',
      website: raw.contact?.website ?? '',
    },
    reportFooter: raw.reportFooter ?? '',
  };
}

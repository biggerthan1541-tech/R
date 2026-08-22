#!/usr/bin/env node
/*
 * Evidence pack CLI.
 *
 *   pack new <client name> [--msp <brand>] [--out <file>]
 *   pack build <client-file> [--no-pdf] [--open]
 *   pack check <client-file>
 *   pack list [client-slug]
 *   pack brands
 */

import { writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { resolve, relative, join } from 'node:path';

import { QUESTIONNAIRE } from '../config/controls.js';
import { evaluateAssessment } from '../src/evaluate.js';
import { loadBrand, listBrands } from '../src/brands.js';
import { loadClientFile, slugify } from '../src/pack/input.js';
import { scaffoldClientFile } from '../src/pack/scaffold.js';
import { savePack, listPacks } from '../src/pack/store.js';
import { renderHtml, writePack, findChrome } from '../src/pack/render.js';

const ROOT = resolve(import.meta.dirname, '..');
const rel = (p) => relative(process.cwd(), p) || '.';

const c = {
  dim: (s) => `\x1b[2m${s}\x1b[0m`,
  bold: (s) => `\x1b[1m${s}\x1b[0m`,
  red: (s) => `\x1b[31m${s}\x1b[0m`,
  green: (s) => `\x1b[32m${s}\x1b[0m`,
  yellow: (s) => `\x1b[33m${s}\x1b[0m`,
};

function parseArgs(argv) {
  const flags = {};
  const positional = [];
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg.startsWith('--')) {
      const key = arg.slice(2);
      if (key.startsWith('no-')) flags[key.slice(3)] = false;
      else if (argv[i + 1] && !argv[i + 1].startsWith('--')) flags[key] = argv[++i];
      else flags[key] = true;
    } else {
      positional.push(arg);
    }
  }
  return { flags, positional };
}

function usage() {
  console.log(`
${c.bold('Evidence pack toolkit')}  ${c.dim(`questionnaire ${QUESTIONNAIRE.id} v${QUESTIONNAIRE.version}`)}

  ${c.bold('npm run pack -- new')} <client name> [--msp <brand>] [--out <file>]
      Write a fill-in-the-blanks client file with every question, its valid
      values, and the outcome each one produces.

  ${c.bold('npm run pack -- build')} <client-file> [--no-pdf]
      Validate, evaluate, store a dated record, and render the pack.

  ${c.bold('npm run pack -- check')} <client-file>
      Validate only. Prints what would score pass/partial/fail. No files written.

  ${c.bold('npm run pack -- list')} [client-slug]
      Every pack produced so far, newest first.

  ${c.bold('npm run pack -- brands')}
      Available MSP brand configs.
`);
}

function reportCounts(result) {
  const { counts } = result;
  return [
    `${c.green(counts.pass)} pass`,
    `${c.yellow(counts.partial)} partial`,
    `${c.red(counts.fail)} fail`,
    counts.unknown ? `${counts.unknown} unanswered` : null,
  ]
    .filter(Boolean)
    .join(', ');
}

function printWarnings(warnings) {
  for (const w of warnings) console.log(`${c.yellow('warning')}  ${w}`);
}

// -- commands ---------------------------------------------------------------

function cmdNew(positional, flags) {
  const name = positional.join(' ').trim();
  if (!name) throw new Error('Give the client a name: pack new "Acme Joinery Ltd"');

  if (flags.msp && !listBrands().includes(flags.msp)) {
    throw new Error(`Unknown brand "${flags.msp}". Available: ${listBrands().join(', ')}`);
  }

  const out = flags.out
    ? resolve(process.cwd(), flags.out)
    : join(ROOT, 'clients', `${slugify(name)}.yaml`);

  if (existsSync(out) && !flags.force) {
    throw new Error(`${rel(out)} already exists. Pass --force to overwrite.`);
  }

  mkdirSync(resolve(out, '..'), { recursive: true });
  writeFileSync(out, scaffoldClientFile({ name, msp: flags.msp }));

  const questions = QUESTIONNAIRE.controls.reduce((n, ctl) => n + ctl.questions.length, 0);
  console.log(`${c.green('created')}  ${rel(out)}  ${c.dim(`(${questions} questions)`)}`);
  console.log(`\nFill it in, then:  ${c.bold(`npm run pack -- build ${rel(out)}`)}`);
}

function evaluateInput(input) {
  return evaluateAssessment(QUESTIONNAIRE, input.answers, {
    notes: input.notes,
    overrides: input.overrides,
  });
}

function cmdCheck(positional) {
  const [file] = positional;
  if (!file) throw new Error('Which file? pack check clients/<name>.yaml');

  const input = loadClientFile(file);
  const result = evaluateInput(input);

  console.log(`${c.green('valid')}    ${rel(resolve(file))}`);
  console.log(`client   ${input.client.name}  ${c.dim(`(${input.slug})`)}`);
  console.log(`brand    ${input.engagement.msp}`);
  console.log(`score    ${result.score}/100 — ${result.band.label}`);
  console.log(`answers  ${reportCounts(result)}`);
  if (result.criticalFailures.length) {
    console.log(
      `${c.red('blocking')} ${result.criticalFailures.map((f) => f.title).join(', ')}`,
    );
  }
  printWarnings(input.warnings);
}

function cmdBuild(positional, flags) {
  const [file] = positional;
  if (!file) throw new Error('Which file? pack build clients/<name>.yaml');

  const input = loadClientFile(file);
  printWarnings(input.warnings);

  const brand = loadBrand(input.engagement.msp);
  const result = evaluateInput(input);
  const generatedAt = new Date().toISOString();

  const { dir, assessmentId } = savePack({ input, brand, result, generatedAt });
  const html = renderHtml({ brand, input, result, generatedAt, assessmentId });

  writeFileSync(join(dir, 'pack.html'), html);
  let pdfNote = c.dim('skipped (--no-pdf)');
  let pdfPath = null;
  if (flags.pdf !== false) {
    const written = writePack(dir, html);
    pdfPath = written.pdfPath;
    pdfNote = written.pdf.ok
      ? rel(written.pdfPath)
      : `${c.yellow('not generated')} ${c.dim(`— ${written.pdf.reason}; open pack.html and print to PDF`)}`;
  }

  console.log('');
  console.log(`${c.bold(input.client.name)}  ${c.dim(`· ${brand.companyName}`)}`);
  console.log(`  score    ${c.bold(`${result.score}/100`)} — ${result.band.label}`);
  console.log(`  answers  ${reportCounts(result)}`);
  console.log(`  fixes    ${result.findings.length} ranked`);
  if (result.criticalFailures.length) {
    console.log(`  ${c.red('blocking')} ${result.criticalFailures.map((f) => f.title).join(', ')}`);
  }
  console.log('');
  console.log(`  record   ${rel(join(dir, 'record.json'))}`);
  console.log(`  html     ${rel(join(dir, 'pack.html'))}`);
  console.log(`  pdf      ${pdfNote}`);
  if (pdfPath) console.log(`\n${c.green('done')}`);
}

function cmdList(positional) {
  const packs = listPacks(positional[0] ?? null);
  if (!packs.length) {
    console.log('No packs generated yet.');
    return;
  }

  let currentClient = null;
  for (const { slug, record, dir } of packs) {
    if (slug !== currentClient) {
      currentClient = slug;
      console.log(`\n${c.bold(record?.client?.name ?? slug)}  ${c.dim(slug)}`);
    }
    if (!record) {
      console.log(`  ${c.yellow('unreadable record')}  ${rel(dir)}`);
      continue;
    }
    const score = `${record.result.score}/100`.padEnd(7);
    console.log(
      `  ${record.generatedAt.slice(0, 10)}  ${score} ${record.result.band.label.padEnd(26)} ${c.dim(
        `${record.brand.slug} · ${rel(dir)}`,
      )}`,
    );
  }
  console.log('');
}

function cmdBrands() {
  for (const slug of listBrands()) {
    const brand = loadBrand(slug);
    console.log(
      `${slug.padEnd(12)} ${brand.companyName.padEnd(28)} ${c.dim(
        `${brand.accentColor}  ${brand.logo ? 'logo' : 'no logo'}`,
      )}`,
    );
  }
}

// -- entry ------------------------------------------------------------------

const [command, ...rest] = process.argv.slice(2);
const { flags, positional } = parseArgs(rest);

const commands = {
  new: () => cmdNew(positional, flags),
  build: () => cmdBuild(positional, flags),
  check: () => cmdCheck(positional),
  list: () => cmdList(positional),
  brands: () => cmdBrands(),
};

try {
  if (!command || command === 'help' || flags.help) {
    usage();
    if (!findChrome() && command) {
      console.log(c.dim('Note: no Chrome found, so PDF output is unavailable. Set CHROME_PATH.'));
    }
  } else if (commands[command]) {
    commands[command]();
  } else {
    console.error(`${c.red('error')}    unknown command "${command}"`);
    usage();
    process.exit(1);
  }
} catch (err) {
  console.error(`${c.red('error')}    ${err.message}`);
  process.exit(1);
}

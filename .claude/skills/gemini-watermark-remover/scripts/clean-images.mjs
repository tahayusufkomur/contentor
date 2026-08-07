#!/usr/bin/env node
/**
 * Batch de-watermarker for the Contentor curated catalogs.
 *
 * Wraps the `gwr` CLI (which does the actual reverse-alpha-blend removal) and adds the two
 * things the bare CLI does not give us:
 *
 *   1. A confidence gate. `gwr` decides on its own whether to apply removal, and its threshold
 *      is loose enough to false-positive on flat vector logo art -- a clean mark scoring 0.288
 *      got a visible light blotch punched into a solid-colour arc. Real watermarks in this
 *      catalog score 0.93-0.97, so we only accept an edit above --threshold (default 0.5) and
 *      leave every other file byte-identical.
 *   2. In-place batch semantics with a summary, so a whole catalog directory can be cleaned
 *      and re-run safely (cleaned files score far below the gate, so reruns are no-ops).
 *
 * Usage:
 *   node clean-images.mjs <file-or-dir>... [options]
 *
 *   --threshold <n>   accept an edit only above this originalSpatialScore (default 0.5)
 *   --out-dir <dir>   write cleaned files here instead of overwriting the originals
 *   --backup <dir>    copy each original here before overwriting it
 *   --dry-run         report what would change, write nothing
 *   --json            emit the per-file verdicts as JSON on stdout
 *
 * Requires `pnpm` on PATH; the CLI itself is fetched via `pnpm dlx` on first run.
 */
import { spawn } from 'node:child_process';
import { copyFile, mkdir, mkdtemp, readdir, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, extname, join, resolve } from 'node:path';

const CLI_PACKAGE_SPEC = process.env.GWR_SKILL_CLI_SPEC || '@pilio/gemini-watermark-remover';
const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp']);
const DEFAULT_THRESHOLD = 0.5;

function parseArgs(argv) {
  const options = { targets: [], threshold: DEFAULT_THRESHOLD, outDir: null, backupDir: null, dryRun: false, json: false };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--threshold') {
      options.threshold = Number(argv[++i]);
      if (!Number.isFinite(options.threshold)) throw new Error('--threshold needs a number');
    } else if (arg === '--out-dir') {
      options.outDir = resolve(argv[++i]);
    } else if (arg === '--backup') {
      options.backupDir = resolve(argv[++i]);
    } else if (arg === '--dry-run') {
      options.dryRun = true;
    } else if (arg === '--json') {
      options.json = true;
    } else if (arg === '--help' || arg === '-h') {
      options.help = true;
    } else if (arg.startsWith('-')) {
      throw new Error(`unknown option: ${arg}`);
    } else {
      options.targets.push(resolve(arg));
    }
  }

  return options;
}

function isImage(name) {
  return IMAGE_EXTENSIONS.has(extname(name).toLowerCase());
}

async function imagesIn(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  return entries.filter((e) => e.isFile() && isImage(e.name)).map((e) => e.name).sort();
}

/**
 * Group the targets into one batch per source directory. `gwr` takes a single input path, so a
 * batch that already covers every image in its directory is handed the directory itself; a
 * partial batch is staged as copies first. Either way it is one CLI invocation per batch.
 */
async function planBatches(targets) {
  const byDir = new Map();

  for (const target of targets) {
    const info = await stat(target);
    if (info.isDirectory()) {
      const names = await imagesIn(target);
      if (names.length) byDir.set(target, new Set(names));
      continue;
    }
    if (!isImage(target)) continue;
    const dir = dirname(target);
    if (!byDir.has(dir)) byDir.set(dir, new Set());
    byDir.get(dir).add(basename(target));
  }

  const batches = [];
  for (const [dir, names] of byDir) {
    const all = await imagesIn(dir);
    batches.push({ dir, names: [...names].sort(), whole: all.length === names.size });
  }
  return batches;
}

function runGwr(inputPath, outDir) {
  const args = ['dlx', `--package=${CLI_PACKAGE_SPEC}`, '--package=sharp', 'gwr', 'remove', inputPath, '--out-dir', outDir, '--json'];

  return new Promise((resolvePromise, reject) => {
    // pnpm writes its download progress to stderr, so stdout stays pure JSON.
    const child = spawn('pnpm', args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += String(chunk); });
    child.stderr.on('data', (chunk) => { stderr += String(chunk); });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`gwr exited ${code}: ${stderr.trim().split('\n').slice(-3).join(' ')}`));
        return;
      }
      try {
        const parsed = JSON.parse(stdout.trim());
        resolvePromise(Array.isArray(parsed) ? parsed : [parsed]);
      } catch {
        reject(new Error(`could not parse gwr JSON output: ${stdout.slice(0, 200)}`));
      }
    });
  });
}

/**
 * Decide whether to keep the CLI's edit. A real watermark shows a high spatial score before
 * removal and near-zero after; a false positive shows a low score before and leaves residue.
 */
function judge(meta, threshold) {
  const detection = meta?.detection ?? {};
  const before = detection.originalSpatialScore ?? 0;
  const after = detection.processedSpatialScore ?? 0;
  const residualVisible = detection.residualVisibility?.visible === true;

  if (!meta?.applied) return { accept: false, reason: meta?.skipReason || 'no-watermark-detected', before, after };
  if (before < threshold) return { accept: false, reason: `below-threshold (${before.toFixed(3)} < ${threshold})`, before, after };
  if (residualVisible) return { accept: false, reason: 'residual still visible after removal', before, after };
  return { accept: true, reason: 'cleaned', before, after };
}

async function processBatch(batch, options) {
  const stageRoot = await mkdtemp(join(tmpdir(), 'gwr-clean-'));
  const outputStage = join(stageRoot, 'out');
  await mkdir(outputStage, { recursive: true });

  let inputPath = batch.dir;
  if (!batch.whole) {
    const inputStage = join(stageRoot, 'in');
    await mkdir(inputStage, { recursive: true });
    await Promise.all(batch.names.map((name) => copyFile(join(batch.dir, name), join(inputStage, name))));
    inputPath = inputStage;
  }

  try {
    const results = await runGwr(inputPath, outputStage);
    const verdicts = [];

    for (const result of results) {
      const name = basename(result.input ?? '');
      if (!batch.names.includes(name)) continue;

      const verdict = judge(result.meta, options.threshold);
      const source = join(batch.dir, name);
      verdicts.push({ file: source, ...verdict });

      if (!verdict.accept || options.dryRun) continue;

      const destination = options.outDir ? join(options.outDir, name) : source;
      if (options.backupDir) {
        await mkdir(options.backupDir, { recursive: true });
        await copyFile(source, join(options.backupDir, name));
      }
      if (options.outDir) await mkdir(options.outDir, { recursive: true });
      await copyFile(result.output, destination);
    }

    return verdicts;
  } finally {
    await rm(stageRoot, { recursive: true, force: true });
  }
}

export async function main(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);

  if (options.help || !options.targets.length) {
    process.stdout.write('usage: node clean-images.mjs <file-or-dir>... [--threshold n] [--out-dir dir] [--backup dir] [--dry-run] [--json]\n');
    return options.help ? 0 : 1;
  }

  const batches = await planBatches(options.targets);
  const total = batches.reduce((sum, batch) => sum + batch.names.length, 0);
  if (!options.json) {
    process.stderr.write(`scanning ${total} image(s) in ${batches.length} directory(ies), threshold ${options.threshold}${options.dryRun ? ' [dry-run]' : ''}\n`);
  }

  const verdicts = [];
  for (const batch of batches) {
    verdicts.push(...(await processBatch(batch, options)));
  }

  const cleaned = verdicts.filter((v) => v.accept);
  const rejected = verdicts.filter((v) => !v.accept && !String(v.reason).startsWith('no-watermark'));

  if (options.json) {
    process.stdout.write(`${JSON.stringify(verdicts, null, 2)}\n`);
  } else {
    for (const v of cleaned) {
      process.stdout.write(`cleaned  ${basename(v.file)}  (${v.before.toFixed(3)} -> ${v.after.toFixed(3)})\n`);
    }
    for (const v of rejected) {
      process.stdout.write(`skipped  ${basename(v.file)}  ${v.reason}\n`);
    }
    const untouched = verdicts.length - cleaned.length;
    process.stdout.write(`\n${options.dryRun ? 'would clean' : 'cleaned'} ${cleaned.length}, left untouched ${untouched}, scanned ${verdicts.length}\n`);
  }

  return 0;
}

main()
  .then((code) => { process.exitCode = code; })
  .catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });

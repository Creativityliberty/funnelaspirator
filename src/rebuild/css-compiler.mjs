import fs from 'fs/promises';
import path from 'path';
import * as cheerio from 'cheerio';
import { assertInsideRoot } from '../compiler/schema.mjs';

const EXTERNAL_URL = /^(?:https?:|data:|blob:|\/\/)/i;

function stripQuery(value = '') {
  return String(value).split('#')[0].split('?')[0];
}

async function existingFile(candidates) {
  for (const candidate of candidates) {
    try {
      const stat = await fs.stat(candidate.path);
      if (stat.isFile()) return candidate;
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error;
    }
  }
  return null;
}

function safeCandidate(root, candidatePath, sourceRef) {
  try {
    return { path: assertInsideRoot(root, candidatePath), sourceRef };
  } catch {
    return null;
  }
}

async function resolveStylesheet(sourceRoot, href) {
  const clean = stripQuery(href);
  if (!clean || EXTERNAL_URL.test(clean)) return null;
  const relative = clean.startsWith('/') ? clean.slice(1) : clean;
  const candidates = [
    safeCandidate(sourceRoot, path.join(sourceRoot, relative), clean),
    safeCandidate(sourceRoot, path.join(sourceRoot, 'pages', relative), clean),
  ].filter(Boolean);
  return existingFile(candidates);
}

function collectUrlRefs(css, cssFile, sourceRoot) {
  const refs = [];
  const mappings = [];
  const regex = /url\(\s*(['"]?)([^)'"\s]+)\1\s*\)/gi;
  let match;
  while ((match = regex.exec(css))) {
    const raw = match[2];
    if (!raw || raw.startsWith('#') || EXTERNAL_URL.test(raw)) {
      if (raw) {
        refs.push(raw);
        mappings.push({ raw, resolved: raw, external: true });
      }
      continue;
    }
    const clean = stripQuery(raw);
    try {
      const absolute = clean.startsWith('/')
        ? assertInsideRoot(sourceRoot, path.join(sourceRoot, clean.slice(1)))
        : assertInsideRoot(sourceRoot, path.resolve(path.dirname(cssFile), clean));
      const resolved = path.relative(sourceRoot, absolute).split(path.sep).join('/');
      refs.push(resolved);
      mappings.push({ raw, resolved, external: false });
    } catch {
      refs.push(raw);
      mappings.push({ raw, resolved: raw, external: false, invalid: true });
    }
  }
  return { refs, mappings };
}

function extractBlocks(css, pattern) {
  const blocks = [];
  let cursor = 0;
  while (cursor < css.length) {
    const match = pattern.exec(css.slice(cursor));
    if (!match) break;
    const start = cursor + match.index;
    const open = css.indexOf('{', start);
    if (open < 0) break;
    let depth = 0;
    let end = open;
    for (; end < css.length; end += 1) {
      if (css[end] === '{') depth += 1;
      else if (css[end] === '}') {
        depth -= 1;
        if (depth === 0) {
          end += 1;
          break;
        }
      }
    }
    blocks.push(css.slice(start, end));
    cursor = end;
  }
  return blocks;
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

export async function compileStyles({ sourceHtml = '', sourceRoot, markup = '' } = {}) {
  if (!sourceRoot) throw new Error('sourceRoot is required');
  const root = path.resolve(sourceRoot);
  const $ = cheerio.load(sourceHtml);
  const sheets = [];
  const unresolved = [];
  const referencedUrls = [];
  const urlMappings = [];

  for (const element of $('link[rel~="stylesheet"][href]').toArray()) {
    const href = $(element).attr('href');
    const resolved = await resolveStylesheet(root, href);
    if (!resolved) {
      unresolved.push({ type: 'stylesheet', reference: href });
      continue;
    }
    const css = await fs.readFile(resolved.path, 'utf8');
    sheets.push({ reference: href, path: resolved.path, css });
    const found = collectUrlRefs(css, resolved.path, root);
    referencedUrls.push(...found.refs);
    urlMappings.push(...found.mappings);
  }

  $('style').each((_i, element) => {
    const css = $(element).html() || '';
    if (!css.trim()) return;
    const inlinePath = path.join(root, 'pages', '__inline__.css');
    sheets.push({ reference: 'inline', path: inlinePath, css });
    const found = collectUrlRefs(css, inlinePath, root);
    referencedUrls.push(...found.refs);
    urlMappings.push(...found.mappings);
  });

  const cssText = sheets.map((sheet) => sheet.css.trim()).filter(Boolean).join('\n\n');
  const tokens = [
    ...extractBlocks(cssText, /:root\s*/i),
    ...extractBlocks(cssText, /@font-face\s*/i),
  ];
  const base = extractBlocks(cssText, /(?:^|[}\s,])(?:html|body|\*)\s*(?:,|\{)/im);

  return {
    outputs: {
      tokensCss: tokens.join('\n\n'),
      baseCss: base.join('\n\n'),
      layoutCss: '',
      componentsCss: cssText,
    },
    referencedUrls: unique(referencedUrls),
    urlMappings,
    unresolved,
    mode: 'conservative',
    stylesheets: sheets.map((sheet) => ({
      reference: sheet.reference,
      path: path.relative(root, sheet.path).split(path.sep).join('/'),
    })),
    markupBytes: Buffer.byteLength(String(markup || ''), 'utf8'),
  };
}

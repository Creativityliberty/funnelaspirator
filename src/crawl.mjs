import { chromium } from "playwright";
import * as cheerio from "cheerio";
import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";

const INPUT_FILE = process.env.INPUT_FILE || "sites.txt";
const OUTPUT_DIR = process.env.OUTPUT_DIR || "exports";
const MAX_PAGES = Number(process.env.MAX_PAGES || 40);
const MAX_DEPTH = Number(process.env.MAX_DEPTH || 2);
const NAV_TIMEOUT_MS = Number(process.env.NAV_TIMEOUT_MS || 45000);
const USER_AGENT =
  process.env.USER_AGENT ||
  "Mozilla/5.0 FunnelScraperMVP/0.1 (+audit; contact: you@example.com)";

const SKIP_EXTENSIONS = new Set([
  ".jpg", ".jpeg", ".png", ".gif", ".webp", ".avif", ".svg",
  ".pdf", ".zip", ".rar", ".7z", ".mp4", ".mp3", ".mov", ".avi",
  ".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx"
]);

function safeName(value, fallback = "page") {
  return String(value || fallback)
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120) || fallback;
}

function cleanUrl(rawUrl) {
  const u = new URL(rawUrl);
  u.hash = "";
  // On garde la query, car certains funnels changent selon ?step=...
  return u.toString();
}

function isHttpUrl(value) {
  try {
    const u = new URL(value);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

function isProbablyPage(url) {
  const ext = path.extname(new URL(url).pathname).toLowerCase();
  return !ext || !SKIP_EXTENSIONS.has(ext);
}

function sameHostname(a, b) {
  return new URL(a).hostname.replace(/^www\./, "") === new URL(b).hostname.replace(/^www\./, "");
}

function pageSlug(url) {
  const u = new URL(url);
  const pathname = u.pathname === "/" ? "/index" : u.pathname.replace(/\/$/, "");
  const queryHash = u.search ? "-" + crypto.createHash("md5").update(u.search).digest("hex").slice(0, 8) : "";
  return safeName(pathname.split("/").filter(Boolean).join("-") + queryHash, "index");
}

async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true });
}

async function readSites(file) {
  const content = await fs.readFile(file, "utf-8");
  return content
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(line => line && !line.startsWith("#"))
    .map(url => cleanUrl(url));
}

async function fetchText(url) {
  const res = await fetch(url, { headers: { "user-agent": USER_AGENT } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return await res.text();
}

async function discoverSitemapUrls(startUrl) {
  const origin = new URL(startUrl).origin;
  const sitemapUrl = `${origin}/sitemap.xml`;
  try {
    const xml = await fetchText(sitemapUrl);
    const urls = [...xml.matchAll(/<loc>\s*([^<]+)\s*<\/loc>/gi)]
      .map(m => m[1].trim())
      .filter(isHttpUrl)
      .filter(u => sameHostname(u, startUrl))
      .filter(isProbablyPage)
      .map(cleanUrl);
    return [...new Set(urls)].slice(0, MAX_PAGES);
  } catch {
    return [];
  }
}

function absolutizeUrl(value, baseUrl) {
  try {
    return new URL(value, baseUrl).toString();
  } catch {
    return null;
  }
}

function extractLinksFromHtml(html, baseUrl) {
  const $ = cheerio.load(html);
  const links = [];
  $("a[href]").each((_, el) => {
    const href = $(el).attr("href");
    const abs = absolutizeUrl(href, baseUrl);
    if (!abs || !isHttpUrl(abs)) return;
    const cleaned = cleanUrl(abs);
    if (sameHostname(cleaned, baseUrl) && isProbablyPage(cleaned)) {
      links.push(cleaned);
    }
  });
  return [...new Set(links)];
}

function extractAssetsFromHtml($, baseUrl) {
  const assets = [];

  const add = (type, attr, el) => {
    const raw = $(el).attr(attr);
    const abs = absolutizeUrl(raw, baseUrl);
    if (abs && isHttpUrl(abs)) assets.push({ type, attr, url: cleanUrl(abs) });
  };

  $("link[rel='stylesheet'][href], link[as='style'][href]").each((_, el) => add("css", "href", el));
  $("script[src]").each((_, el) => add("js", "src", el));
  $("img[src]").each((_, el) => add("image", "src", el));
  $("source[src]").each((_, el) => add("source", "src", el));
  $("video[src]").each((_, el) => add("video", "src", el));

  return assets;
}

function inferExtension(contentType) {
  if (!contentType) return "";
  if (contentType.includes("text/css")) return ".css";
  if (contentType.includes("javascript")) return ".js";
  if (contentType.includes("image/png")) return ".png";
  if (contentType.includes("image/jpeg")) return ".jpg";
  if (contentType.includes("image/webp")) return ".webp";
  if (contentType.includes("image/svg")) return ".svg";
  if (contentType.includes("font/woff2")) return ".woff2";
  if (contentType.includes("font/woff")) return ".woff";
  return "";
}

async function downloadAsset(assetUrl, siteDir) {
  const u = new URL(assetUrl);
  let pathname = decodeURIComponent(u.pathname);
  if (!pathname || pathname.endsWith("/")) pathname += "index";
  const querySuffix = u.search ? "-" + crypto.createHash("md5").update(u.search).digest("hex").slice(0, 8) : "";
  let parts = pathname.split("/").filter(Boolean).map(p => safeName(p, "asset"));
  if (!parts.length) parts = ["asset"];

  let filename = parts.pop();
  const ext = path.extname(filename);
  if (querySuffix) filename = filename.replace(ext, "") + querySuffix + ext;

  const localDir = path.join(siteDir, "assets", safeName(u.hostname), ...parts);
  await ensureDir(localDir);

  const res = await fetch(assetUrl, { headers: { "user-agent": USER_AGENT } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);

  const contentType = res.headers.get("content-type") || "";
  if (!path.extname(filename)) filename += inferExtension(contentType);

  const buffer = Buffer.from(await res.arrayBuffer());
  const fullPath = path.join(localDir, filename);
  await fs.writeFile(fullPath, buffer);

  return fullPath;
}

async function rewriteAndDownloadAssets(html, baseUrl, siteDir, pageHtmlPath) {
  const $ = cheerio.load(html);
  const assets = extractAssetsFromHtml($, baseUrl);
  const downloaded = [];

  for (const asset of assets) {
    try {
      const localPath = await downloadAsset(asset.url, siteDir);
      const rel = path.relative(path.dirname(pageHtmlPath), localPath).replaceAll(path.sep, "/");

      // Réécriture du premier élément qui correspond à cette URL.
      const selector = asset.attr === "href" ? `[href]` : `[src]`;
      $(selector).each((_, el) => {
        const raw = $(el).attr(asset.attr);
        const abs = absolutizeUrl(raw, baseUrl);
        if (abs && cleanUrl(abs) === asset.url) {
          $(el).attr(asset.attr, rel);
        }
      });

      downloaded.push({ ...asset, localPath });
    } catch (err) {
      downloaded.push({ ...asset, error: err.message });
    }
  }

  return { html: $.html(), assets: downloaded };
}

function textOf($, selector) {
  return $(selector)
    .map((_, el) => $(el).text().replace(/\s+/g, " ").trim())
    .get()
    .filter(Boolean);
}

function analyzeHtml(html, url) {
  const $ = cheerio.load(html);

  const buttons = [];
  $("a, button, input[type='submit']").each((_, el) => {
    const tag = el.tagName?.toLowerCase();
    const text = ($(el).text() || $(el).attr("value") || "")
      .replace(/\s+/g, " ")
      .trim();
    const href = $(el).attr("href") || null;
    const classes = $(el).attr("class") || "";
    const looksLikeCta =
      tag === "button" ||
      $(el).attr("type") === "submit" ||
      /btn|button|cta|primary|hero|submit/i.test(classes) ||
      /book|join|start|get|buy|apply|call|contact|demo|challenge|program|discover|learn|read/i.test(text);
    if (text && text.length <= 90 && looksLikeCta) {
      buttons.push({ text, href: href ? absolutizeUrl(href, url) : null, tag });
    }
  });

  const forms = [];
  $("form").each((_, form) => {
    const fields = [];
    $(form).find("input, textarea, select").each((__, field) => {
      fields.push({
        tag: field.tagName?.toLowerCase(),
        type: $(field).attr("type") || null,
        name: $(field).attr("name") || null,
        placeholder: $(field).attr("placeholder") || null,
        required: $(field).attr("required") !== undefined
      });
    });
    forms.push({
      action: $(form).attr("action") ? absolutizeUrl($(form).attr("action"), url) : null,
      method: ($(form).attr("method") || "GET").toUpperCase(),
      fields
    });
  });

  const sections = [];
  $("header, main, section, article, footer").each((_, el) => {
    const tag = el.tagName?.toLowerCase();
    const id = $(el).attr("id") || null;
    const className = $(el).attr("class") || null;
    const heading = $(el).find("h1,h2,h3").first().text().replace(/\s+/g, " ").trim() || null;
    const sampleText = $(el).text().replace(/\s+/g, " ").trim().slice(0, 400);
    if (heading || sampleText) {
      sections.push({ tag, id, className, heading, sampleText });
    }
  });

  return {
    url,
    title: $("title").first().text().trim() || null,
    metaDescription: $("meta[name='description']").attr("content") || null,
    canonical: $("link[rel='canonical']").attr("href") || null,
    h1: textOf($, "h1"),
    h2: textOf($, "h2"),
    ctas: buttons.slice(0, 40),
    forms,
    sections: sections.slice(0, 80),
    links: extractLinksFromHtml(html, url)
  };
}

async function autoScroll(page) {
  await page.evaluate(async () => {
    await new Promise(resolve => {
      let totalHeight = 0;
      const distance = 500;
      const timer = setInterval(() => {
        const scrollHeight = document.body.scrollHeight;
        window.scrollBy(0, distance);
        totalHeight += distance;
        if (totalHeight >= scrollHeight || totalHeight > 20000) {
          clearInterval(timer);
          window.scrollTo(0, 0);
          resolve();
        }
      }, 120);
    });
  });
}

async function crawlSite(browser, startUrl) {
  const host = safeName(new URL(startUrl).hostname);
  const siteDir = path.join(OUTPUT_DIR, host);
  await ensureDir(siteDir);
  await ensureDir(path.join(siteDir, "pages"));
  await ensureDir(path.join(siteDir, "screenshots"));
  await ensureDir(path.join(siteDir, "data"));

  const sitemapUrls = await discoverSitemapUrls(startUrl);
  const queue = [{ url: startUrl, depth: 0 }];
  for (const u of sitemapUrls) {
    if (u !== startUrl) queue.push({ url: u, depth: 1 });
  }

  const seen = new Set();
  const crawlIndex = [];

  while (queue.length && seen.size < MAX_PAGES) {
    const item = queue.shift();
    const url = cleanUrl(item.url);
    if (seen.has(url)) continue;
    if (!sameHostname(url, startUrl)) continue;
    if (!isProbablyPage(url)) continue;

    seen.add(url);
    const slug = pageSlug(url);
    const htmlPath = path.join(siteDir, "pages", `${slug}.html`);
    const screenshotPath = path.join(siteDir, "screenshots", `${slug}.png`);
    const dataPath = path.join(siteDir, "data", `${slug}.json`);

    console.log(`[${host}] ${seen.size}/${MAX_PAGES} depth=${item.depth} ${url}`);

    const page = await browser.newPage({ userAgent: USER_AGENT, viewport: { width: 1440, height: 1400 } });
    try {
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: NAV_TIMEOUT_MS });
      await page.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});
      await autoScroll(page).catch(() => {});
      const htmlRaw = await page.content();

      const { html, assets } = await rewriteAndDownloadAssets(htmlRaw, url, siteDir, htmlPath);
      const analysis = analyzeHtml(html, url);
      analysis.assets = assets;

      await fs.writeFile(htmlPath, html, "utf-8");
      await fs.writeFile(dataPath, JSON.stringify(analysis, null, 2), "utf-8");
      await page.screenshot({ path: screenshotPath, fullPage: true });

      crawlIndex.push({
        url,
        depth: item.depth,
        html: path.relative(siteDir, htmlPath),
        screenshot: path.relative(siteDir, screenshotPath),
        data: path.relative(siteDir, dataPath),
        title: analysis.title,
        h1: analysis.h1,
        ctaCount: analysis.ctas.length,
        formCount: analysis.forms.length,
        status: "ok"
      });

      if (item.depth < MAX_DEPTH) {
        for (const link of analysis.links) {
          if (!seen.has(link) && sameHostname(link, startUrl) && isProbablyPage(link)) {
            queue.push({ url: link, depth: item.depth + 1 });
          }
        }
      }
    } catch (err) {
      console.error(`  ERROR ${url}: ${err.message}`);
      crawlIndex.push({ url, depth: item.depth, status: "error", error: err.message });
    } finally {
      await page.close().catch(() => {});
    }
  }

  await fs.writeFile(
    path.join(siteDir, "sitemap.json"),
    JSON.stringify(crawlIndex, null, 2),
    "utf-8"
  );

  return { host, pages: crawlIndex.length, dir: siteDir };
}

export async function runCrawlerForUrl(url) {
  await ensureDir(OUTPUT_DIR);
  const browser = await chromium.launch({ headless: true });
  try {
    const result = await crawlSite(browser, url);
    return result;
  } finally {
    await browser.close();
  }
}


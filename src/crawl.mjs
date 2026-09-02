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

async function extractInDepthMetadata(page, siteDir, slug) {
  return await page.evaluate(() => {
    // Helper: Normalize RGB/RGBA to HEX
    function rgbToHex(rgbStr) {
      if (!rgbStr || rgbStr === "transparent" || rgbStr === "rgba(0, 0, 0, 0)") return null;
      const match = rgbStr.match(/^rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)$/);
      if (!match) return rgbStr;
      const r = parseInt(match[1]).toString(16).padStart(2, '0');
      const g = parseInt(match[2]).toString(16).padStart(2, '0');
      const b = parseInt(match[3]).toString(16).padStart(2, '0');
      const a = match[4] !== undefined ? Math.round(parseFloat(match[4]) * 255).toString(16).padStart(2, '0') : '';
      return `#${r}${g}${b}${a}`.toUpperCase();
    }

    // 1. DESIGN TOKENS
    // A. CSS Custom Properties (:root)
    const cssVariables = {};
    for (const sheet of Array.from(document.styleSheets)) {
      try {
        for (const rule of Array.from(sheet.cssRules || [])) {
          if (rule.selectorText === ':root' || rule.selectorText === 'html') {
            for (let i = 0; i < rule.style.length; i++) {
              const prop = rule.style[i];
              if (prop.startsWith('--')) {
                cssVariables[prop] = rule.style.getPropertyValue(prop).trim();
              }
            }
          }
        }
      } catch (e) {
        // Cross-origin stylesheet access restricted
      }
    }

    // B. Color Palette Extraction
    const textColors = new Set();
    const bgColors = new Set();
    const borderColors = new Set();
    const gradients = new Set();
    const fonts = new Set();
    const fontWeights = new Set();
    const borderRadii = new Set();
    const boxShadows = new Set();

    const typographyHierarchy = {
      h1: [],
      h2: [],
      h3: [],
      body: [],
      buttons: []
    };

    const allElements = Array.from(document.querySelectorAll('body *')).slice(0, 800);

    for (const el of allElements) {
      const style = window.getComputedStyle(el);
      const isVisible = el.offsetWidth > 0 && el.offsetHeight > 0 && style.display !== 'none' && style.visibility !== 'hidden';
      if (!isVisible) continue;

      const color = rgbToHex(style.color);
      if (color) textColors.add(color);

      const bg = rgbToHex(style.backgroundColor);
      if (bg) bgColors.add(bg);

      const bgImage = style.backgroundImage;
      if (bgImage && bgImage.includes('gradient')) gradients.add(bgImage);

      const borderColor = rgbToHex(style.borderColor);
      if (borderColor && style.borderWidth !== '0px') borderColors.add(borderColor);

      const fontFam = style.fontFamily.split(',')[0].replace(/['"]/g, '').trim();
      if (fontFam) fonts.add(fontFam);

      if (style.fontWeight) fontWeights.add(style.fontWeight);
      if (style.borderRadius && style.borderRadius !== '0px') borderRadii.add(style.borderRadius);
      if (style.boxShadow && style.boxShadow !== 'none') boxShadows.add(style.boxShadow);

      const tag = el.tagName.toLowerCase();
      const text = (el.innerText || '').trim();
      if (text && text.length > 0) {
        const typoData = {
          tag,
          fontFamily: fontFam,
          fontSize: style.fontSize,
          fontWeight: style.fontWeight,
          lineHeight: style.lineHeight,
          letterSpacing: style.letterSpacing,
          color: color,
          sampleText: text.slice(0, 60)
        };
        if (tag === 'h1' && typographyHierarchy.h1.length < 3) typographyHierarchy.h1.push(typoData);
        else if (tag === 'h2' && typographyHierarchy.h2.length < 5) typographyHierarchy.h2.push(typoData);
        else if (tag === 'h3' && typographyHierarchy.h3.length < 5) typographyHierarchy.h3.push(typoData);
        else if ((tag === 'p' || tag === 'span') && typographyHierarchy.body.length < 5) typographyHierarchy.body.push(typoData);
        else if ((tag === 'button' || el.classList.contains('btn') || el.classList.contains('cta')) && typographyHierarchy.buttons.length < 5) {
          typographyHierarchy.buttons.push(typoData);
        }
      }
    }

    // 2. MOTION & ANIMATION INSPECTION
    const keyframes = [];
    for (const sheet of Array.from(document.styleSheets)) {
      try {
        for (const rule of Array.from(sheet.cssRules || [])) {
          if (rule.type === CSSRule.KEYFRAMES_RULE || rule.constructor.name === 'CSSKeyframesRule') {
            const steps = [];
            for (const keyframe of Array.from(rule.cssRules || [])) {
              steps.push({
                keyText: keyframe.keyText,
                cssText: keyframe.style.cssText
              });
            }
            keyframes.push({
              name: rule.name,
              steps
            });
          }
        }
      } catch (e) {}
    }

    // Active CSS transitions & animations on elements
    const activeTransitions = [];
    const activeAnimations = [];

    for (const el of allElements) {
      const style = window.getComputedStyle(el);
      if (style.transition && style.transition !== 'all 0s ease 0s' && style.transition !== 'none') {
        const trans = {
          selector: el.className ? `.${el.className.toString().trim().split(/\s+/).slice(0, 2).join('.')}` : el.tagName.toLowerCase(),
          transition: style.transition,
          duration: style.transitionDuration,
          timing: style.transitionTimingFunction,
          property: style.transitionProperty
        };
        if (activeTransitions.length < 25 && !activeTransitions.some(t => t.transition === trans.transition)) {
          activeTransitions.push(trans);
        }
      }
      if (style.animationName && style.animationName !== 'none') {
        const anim = {
          selector: el.className ? `.${el.className.toString().trim().split(/\s+/).slice(0, 2).join('.')}` : el.tagName.toLowerCase(),
          name: style.animationName,
          duration: style.animationDuration,
          timing: style.animationTimingFunction,
          delay: style.animationDelay,
          iterationCount: style.animationIterationCount
        };
        if (activeAnimations.length < 25 && !activeAnimations.some(a => a.name === anim.name)) {
          activeAnimations.push(anim);
        }
      }
    }

    // Detect Motion & UI Frameworks on window
    const detectedLibraries = [];
    if (window.gsap) detectedLibraries.push({ name: 'GSAP', version: window.gsap.version || 'unknown' });
    if (window.ScrollTrigger) detectedLibraries.push({ name: 'ScrollTrigger', type: 'scroll-motion' });
    if (window.FramerMotion || document.querySelector('[data-framer-name], [data-projection-id]')) detectedLibraries.push({ name: 'Framer Motion', type: 'react-motion' });
    if (window.AOS || document.querySelector('[data-aos]')) detectedLibraries.push({ name: 'AOS (Animate On Scroll)', type: 'scroll-motion' });
    if (window.lottie || window.bodymovin) detectedLibraries.push({ name: 'Lottie (Airbnb)', type: 'vector-animation' });
    if (window.THREE) detectedLibraries.push({ name: 'Three.js', type: '3d-webgl' });
    if (window.Spline || document.querySelector('spline-viewer')) detectedLibraries.push({ name: 'Spline', type: '3d-interactive' });
    if (window.Lenis) detectedLibraries.push({ name: 'Lenis', type: 'smooth-scroll' });
    if (window.Swiper || document.querySelector('.swiper, .swiper-container')) detectedLibraries.push({ name: 'Swiper.js', type: 'carousel-slider' });
    if (window.Alpine) detectedLibraries.push({ name: 'Alpine.js', type: 'micro-reactivity' });
    if (document.querySelector('[class*="tw-"], [class*="flex"], [class*="grid"]')) detectedLibraries.push({ name: 'Tailwind CSS', type: 'css-framework' });

    // 3. MICRO-INTERACTION PATTERNS (Sticky Headers, Modals, Accordions)
    // Sticky / Fixed Elements
    const fixedHeaders = [];
    for (const el of allElements) {
      const style = window.getComputedStyle(el);
      if ((style.position === 'fixed' || style.position === 'sticky') && el.offsetHeight > 30 && el.offsetHeight < 250) {
        fixedHeaders.push({
          tag: el.tagName.toLowerCase(),
          position: style.position,
          top: style.top,
          zIndex: style.zIndex,
          backdropFilter: style.backdropFilter,
          backgroundColor: rgbToHex(style.backgroundColor),
          boxShadow: style.boxShadow,
          height: `${el.offsetHeight}px`
        });
      }
    }

    // Accordions / Collapsible detection
    const accordions = [];
    const accordionElements = Array.from(document.querySelectorAll('details, [class*="accordion"], [class*="faq"], [aria-expanded]')).slice(0, 15);
    for (const acc of accordionElements) {
      const trigger = acc.querySelector('summary, [class*="header"], [class*="title"], [class*="trigger"], button') || acc;
      const content = acc.querySelector('[class*="content"], [class*="body"], [class*="answer"], p') || acc;
      const isExpanded = acc.hasAttribute('open') || acc.getAttribute('aria-expanded') === 'true' || acc.classList.contains('active') || acc.classList.contains('open');
      
      accordions.push({
        title: (trigger.innerText || '').trim().slice(0, 100),
        isExpanded,
        triggerTag: trigger.tagName.toLowerCase(),
        contentPreview: (content.innerText || '').trim().slice(0, 200),
        classes: acc.className.toString().trim()
      });
    }

    // CTA Micro-properties
    const interactiveCTAs = [];
    const ctaElements = Array.from(document.querySelectorAll('a, button, input[type="submit"]')).filter(el => {
      const style = window.getComputedStyle(el);
      const isVisible = el.offsetWidth > 0 && el.offsetHeight > 0;
      const text = (el.innerText || el.getAttribute('value') || '').trim();
      const isButtonLike = el.tagName === 'BUTTON' || /btn|button|cta|primary|hero/i.test(el.className) || style.cursor === 'pointer';
      return isVisible && text && text.length < 80 && isButtonLike;
    }).slice(0, 20);

    for (const cta of ctaElements) {
      const style = window.getComputedStyle(cta);
      interactiveCTAs.push({
        text: (cta.innerText || cta.getAttribute('value') || '').trim(),
        tag: cta.tagName.toLowerCase(),
        href: cta.getAttribute('href') || null,
        classes: cta.className.toString().trim(),
        defaultState: {
          backgroundColor: rgbToHex(style.backgroundColor),
          color: rgbToHex(style.color),
          borderRadius: style.borderRadius,
          padding: `${style.paddingTop} ${style.paddingRight} ${style.paddingBottom} ${style.paddingLeft}`,
          boxShadow: style.boxShadow,
          border: `${style.borderWidth} ${style.borderStyle} ${rgbToHex(style.borderColor) || 'transparent'}`,
          fontSize: style.fontSize,
          fontWeight: style.fontWeight,
          transform: style.transform,
          transition: style.transition
        }
      });
    }

    // 4. MODULAR COMPONENT BLUEPRINTS
    const componentSections = [];
    const sectionElements = Array.from(document.querySelectorAll('header, main > section, section, article, footer, [class*="hero"], [class*="pricing"], [class*="testimonial"], [class*="feature"]')).slice(0, 20);

    for (let i = 0; i < sectionElements.length; i++) {
      const sec = sectionElements[i];
      const rect = sec.getBoundingClientRect();
      if (rect.height < 60 || rect.width < 200) continue;

      const style = window.getComputedStyle(sec);
      const heading = sec.querySelector('h1, h2, h3')?.innerText?.trim() || null;
      const ctas = Array.from(sec.querySelectorAll('a, button')).map(b => (b.innerText || '').trim()).filter(Boolean).slice(0, 5);

      // Infer component type
      let type = 'section';
      const secClass = sec.className.toString().toLowerCase();
      const secText = (sec.innerText || '').toLowerCase();
      if (i === 0 || secClass.includes('hero') || sec.querySelector('h1')) type = 'hero';
      else if (secClass.includes('price') || secClass.includes('pricing') || secText.includes('$/') || secText.includes('€/')) type = 'pricing';
      else if (secClass.includes('testimonial') || secClass.includes('review') || secClass.includes('client')) type = 'testimonials';
      else if (secClass.includes('faq') || secClass.includes('accordion') || secText.includes('frequently asked')) type = 'faq';
      else if (secClass.includes('feature') || secClass.includes('benefit')) type = 'features';
      else if (sec.tagName.toLowerCase() === 'footer' || secClass.includes('footer')) type = 'footer';
      else if (sec.querySelector('form')) type = 'lead-form';

      componentSections.push({
        id: sec.id || `section-${i + 1}`,
        type,
        heading,
        ctaList: ctas,
        bounding: {
          width: Math.round(rect.width),
          height: Math.round(rect.height),
          top: Math.round(rect.top + window.scrollY)
        },
        styles: {
          backgroundColor: rgbToHex(style.backgroundColor),
          backgroundImage: style.backgroundImage !== 'none' ? style.backgroundImage.slice(0, 100) : null,
          padding: `${style.paddingTop} ${style.paddingRight} ${style.paddingBottom} ${style.paddingLeft}`,
          display: style.display
        },
        htmlStructure: sec.outerHTML.slice(0, 3000) // Compact blueprint
      });
    }

    return {
      designTokens: {
        cssVariables,
        colors: {
          text: Array.from(textColors).slice(0, 30),
          background: Array.from(bgColors).slice(0, 30),
          border: Array.from(borderColors).slice(0, 20),
          gradients: Array.from(gradients).slice(0, 10)
        },
        typography: {
          families: Array.from(fonts),
          weights: Array.from(fontWeights),
          hierarchy: typographyHierarchy
        },
        shapes: {
          radii: Array.from(borderRadii),
          shadows: Array.from(boxShadows).slice(0, 15)
        }
      },
      motion: {
        detectedLibraries,
        keyframes: keyframes.slice(0, 30),
        activeTransitions,
        activeAnimations
      },
      microInteractions: {
        fixedHeaders,
        accordions,
        ctas: interactiveCTAs
      },
      components: componentSections
    };
  });
}

async function simulateHoverStates(page, ctas) {
  if (!ctas || !ctas.length) return ctas;
  const enrichedCtas = [];

  for (let i = 0; i < Math.min(ctas.length, 8); i++) {
    const cta = ctas[i];
    try {
      // Find element matching text or class
      const selector = cta.tag === 'button' ? `button:has-text("${cta.text}")` : `a:has-text("${cta.text}")`;
      const locator = page.locator(selector).first();
      
      if (await locator.count() > 0 && await locator.isVisible()) {
        await locator.hover({ timeout: 2000 });
        await page.waitForTimeout(150); // allow CSS transitions to trigger

        const hoverState = await locator.evaluate((el) => {
          const style = window.getComputedStyle(el);
          function rgbToHex(rgbStr) {
            if (!rgbStr || rgbStr === "transparent" || rgbStr === "rgba(0, 0, 0, 0)") return null;
            const match = rgbStr.match(/^rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)$/);
            if (!match) return rgbStr;
            const r = parseInt(match[1]).toString(16).padStart(2, '0');
            const g = parseInt(match[2]).toString(16).padStart(2, '0');
            const b = parseInt(match[3]).toString(16).padStart(2, '0');
            const a = match[4] !== undefined ? Math.round(parseFloat(match[4]) * 255).toString(16).padStart(2, '0') : '';
            return `#${r}${g}${b}${a}`.toUpperCase();
          }
          return {
            backgroundColor: rgbToHex(style.backgroundColor),
            color: rgbToHex(style.color),
            boxShadow: style.boxShadow,
            transform: style.transform,
            borderColor: rgbToHex(style.borderColor)
          };
        });

        // Move mouse away to reset
        await page.mouse.move(0, 0);

        enrichedCtas.push({
          ...cta,
          hoverState,
          hasHoverEffect: hoverState.backgroundColor !== cta.defaultState.backgroundColor ||
                          hoverState.color !== cta.defaultState.color ||
                          hoverState.boxShadow !== cta.defaultState.boxShadow ||
                          hoverState.transform !== cta.defaultState.transform
        });
      } else {
        enrichedCtas.push(cta);
      }
    } catch (e) {
      enrichedCtas.push(cta);
    }
  }

  return enrichedCtas.concat(ctas.slice(enrichedCtas.length));
}

async function crawlSite(browser, startUrl) {
  const host = safeName(new URL(startUrl).hostname);
  const siteDir = path.join(OUTPUT_DIR, host);
  await ensureDir(siteDir);
  await ensureDir(path.join(siteDir, "pages"));
  await ensureDir(path.join(siteDir, "screenshots"));
  await ensureDir(path.join(siteDir, "data"));
  await ensureDir(path.join(siteDir, "components"));

  const sitemapUrls = await discoverSitemapUrls(startUrl);
  const queue = [{ url: startUrl, depth: 0 }];
  for (const u of sitemapUrls) {
    if (u !== startUrl) queue.push({ url: u, depth: 1 });
  }

  const seen = new Set();
  const crawlIndex = [];
  let globalDesignSystem = null;

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
      
      // Perform deep in-browser inspection (tokens, motions, accordions, sections)
      const inDepth = await extractInDepthMetadata(page, siteDir, slug);
      
      // Simulate live hover states on primary CTAs
      if (inDepth.microInteractions?.ctas) {
        inDepth.microInteractions.ctas = await simulateHoverStates(page, inDepth.microInteractions.ctas);
      }

      const htmlRaw = await page.content();
      const { html, assets } = await rewriteAndDownloadAssets(htmlRaw, url, siteDir, htmlPath);
      const analysis = analyzeHtml(html, url);
      
      // Merge all deep metadata into the analysis payload
      analysis.assets = assets;
      analysis.designTokens = inDepth.designTokens;
      analysis.motion = inDepth.motion;
      analysis.microInteractions = inDepth.microInteractions;
      analysis.components = inDepth.components;

      if (!globalDesignSystem) {
        globalDesignSystem = inDepth.designTokens;
      }

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
        componentCount: inDepth.components.length,
        detectedLibraries: inDepth.motion.detectedLibraries.map(l => l.name),
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

  // Save global domain sitemap & design system summary
  await fs.writeFile(
    path.join(siteDir, "sitemap.json"),
    JSON.stringify(crawlIndex, null, 2),
    "utf-8"
  );

  if (globalDesignSystem) {
    await fs.writeFile(
      path.join(siteDir, "design-system.json"),
      JSON.stringify(globalDesignSystem, null, 2),
      "utf-8"
    );
  }

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



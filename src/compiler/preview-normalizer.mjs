function escapeRegex(value = '') {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const TRACKING_PATTERN = /(googletagmanager|google-analytics|gtag\s*\(|dataLayer|segment\.com|analytics\.js|hotjar|clarity\s*\(|clarity\.ms|facebook\.net|fbq\s*\(|plausible\.io)/i;

function stripTrackingScripts(html) {
  return html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, (scriptTag) => {
    return TRACKING_PATTERN.test(scriptTag) ? '' : scriptTag;
  });
}

function stripBrokenNextSrcsets(html) {
  return html.replace(/\s+srcset=(['"])([^'"]*\/_next\/image\?[^'"]*)\1/gi, '');
}

function sandboxSameDomainLinks(html, domain) {
  if (!domain) return html;
  const escapedDomain = escapeRegex(domain);
  const absolute = new RegExp(
    `href=(['"])https?:\\/\\/(?:www\\.)?${escapedDomain}([^'"]*)\\1`,
    'gi',
  );
  let output = html.replace(absolute, (_match, _quote, route) => {
    const safeRoute = route || '/';
    return `href="#" data-aspirator-route="${safeRoute}"`;
  });

  output = output.replace(/href=(['"])(\/(?!\/)[^'"]*)\1/gi, (_match, _quote, route) => {
    return `href="#" data-aspirator-route="${route}"`;
  });
  return output;
}

function applyAssetMap(html, assetMap = {}) {
  let output = html;
  const entries = Object.entries(assetMap).sort((a, b) => b[0].length - a[0].length);
  for (const [source, target] of entries) {
    if (!source || !target) continue;
    output = output.split(source).join(target);
  }
  return output;
}

function escapeAttribute(value = '') {
  return String(value).replace(/&/g, '&amp;').replace(/"/g, '&quot;');
}

function injectBaseHref(html, baseHref) {
  if (!baseHref) return html;
  const tag = `<base href="${escapeAttribute(baseHref)}">`;
  if (/<base\b[^>]*>/i.test(html)) return html.replace(/<base\b[^>]*>/i, tag);
  if (/<head\b[^>]*>/i.test(html)) {
    return html.replace(/<head\b[^>]*>/i, (head) => `${head}${tag}`);
  }
  return `${tag}${html}`;
}

function injectBridge(html) {
  const bridge = `<script data-aspirator-bridge>document.addEventListener('click',function(event){var link=event.target.closest('[data-aspirator-route]');if(!link)return;event.preventDefault();parent.postMessage({type:'aspirator:navigate',route:link.getAttribute('data-aspirator-route')},'*');});<\/script>`;
  return /<\/body>/i.test(html)
    ? html.replace(/<\/body>/i, `${bridge}</body>`)
    : html + bridge;
}

export function normalizePreviewHtml({ html = '', domain = '', assetMap = {}, baseHref = '' } = {}) {
  let output = String(html || '');
  output = stripTrackingScripts(output);
  output = stripBrokenNextSrcsets(output);
  output = applyAssetMap(output, assetMap);
  output = sandboxSameDomainLinks(output, domain);
  output = injectBaseHref(output, baseHref);
  output = injectBridge(output);
  return output;
}

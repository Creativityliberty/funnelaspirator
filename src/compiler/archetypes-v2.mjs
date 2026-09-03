import { buildPageSignature } from './page-signature.mjs';

function lcsLength(a, b) {
  const rows = Array(b.length + 1).fill(0);
  for (let i = 1; i <= a.length; i += 1) {
    let previous = 0;
    for (let j = 1; j <= b.length; j += 1) {
      const current = rows[j];
      rows[j] = a[i - 1] === b[j - 1]
        ? previous + 1
        : Math.max(rows[j], rows[j - 1]);
      previous = current;
    }
  }
  return rows[b.length];
}

function routeFamily(route = '/') {
  const normalized = String(route).toLowerCase().split('?')[0];
  if (normalized === '/') return 'home';
  if (/^\/(work|project|projects|case|cases)\//.test(normalized)) return 'project-detail';
  if (/^\/(works?|projects?|portfolio)\/?$/.test(normalized)) return 'work-index';
  if (/^\/expertise\//.test(normalized)) return 'expertise';
  if (/^\/industries\//.test(normalized)) return 'industry';
  if (/contact|start-a-project|booking|audit|call/.test(normalized)) return 'contact';
  if (/pricing|price|offer|tarif|programme/.test(normalized)) return 'pricing';
  if (/about|studio|agency|team/.test(normalized)) return 'about';
  if (/blog|news|insights?|articles?/.test(normalized)) return 'content';
  if (/join-us|careers?|jobs?/.test(normalized)) return 'careers';
  if (/on-demand/.test(normalized)) return 'on-demand';
  if (/thank-you/.test(normalized)) return 'thank-you';
  if (/sitemap/.test(normalized)) return 'sitemap';
  return normalized.split('/').filter(Boolean)[0] || 'page';
}

function similarity(pageA, pageB) {
  const a = pageA.signature;
  const b = pageB.signature;
  if (a.structureHash === b.structureHash) return 1;

  const max = Math.max(a.sectionSequence.length, b.sectionSequence.length, 1);
  const sequenceScore = lcsLength(a.sectionSequence, b.sectionSequence) / max;
  const depthScore = 1 - Math.min(Math.abs(a.routeDepth - b.routeDepth), 3) / 3;
  const ctaScore = 1 - Math.min(Math.abs(a.ctaCount - b.ctaCount), 4) / 4;
  const familyScore = routeFamily(pageA.route) === routeFamily(pageB.route) ? 1 : 0;

  return Number((
    sequenceScore * 0.65
    + depthScore * 0.10
    + ctaScore * 0.10
    + familyScore * 0.15
  ).toFixed(4));
}

function labelFor(route = '/') {
  const family = routeFamily(route);
  const labels = {
    home: 'Home',
    'project-detail': 'Project Detail',
    'work-index': 'Work Index',
    expertise: 'Expertise Detail',
    industry: 'Industry Detail',
    contact: 'Contact / Qualification',
    pricing: 'Offer / Pricing',
    about: 'Studio / About',
    content: 'Content',
    careers: 'Careers',
    'on-demand': 'On Demand',
    'thank-you': 'Thank You',
    sitemap: 'Sitemap',
  };
  return labels[family] || 'Page Family';
}

function slug(value) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

export function clusterPagesV2(pages = [], threshold = 0.72) {
  const enriched = pages.map((page) => ({
    ...page,
    signature: page.signature || buildPageSignature(page),
  }));
  const clusters = [];

  for (const page of enriched) {
    let bestCluster = null;
    let bestScore = -1;
    for (const cluster of clusters) {
      const score = similarity(page, cluster.representative);
      if (score > bestScore) {
        bestCluster = cluster;
        bestScore = score;
      }
    }

    if (bestCluster && bestScore >= threshold) {
      bestCluster.pages.push(page);
      bestCluster.scores.push(bestScore);
    } else {
      clusters.push({ representative: page, pages: [page], scores: [1] });
    }
  }

  const labelCounts = new Map();
  return clusters.map((cluster, index) => {
    const label = labelFor(cluster.representative.route);
    const labelCount = (labelCounts.get(label) || 0) + 1;
    labelCounts.set(label, labelCount);
    const suffix = labelCount > 1 ? `-${labelCount}` : '';
    const confidence = Number(
      (cluster.scores.reduce((sum, score) => sum + score, 0) / cluster.scores.length).toFixed(4),
    );

    return {
      id: `arch-${slug(label)}${suffix}`,
      label,
      pageIds: cluster.pages.map((page) => page.id),
      representativePageId: cluster.representative.id,
      sectionSequence: cluster.representative.signature.sectionSequence,
      confidence,
      order: index,
    };
  });
}

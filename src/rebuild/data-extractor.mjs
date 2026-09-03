const TRACKING_VALUE = /googletagmanager|google-analytics|facebook\.(?:net|com)|posthog|segment\.com|citeme\.io|visitors\.now|clarity\.ms|hotjar|plausible\.io/i;

function safeValue(value) {
  if (value == null || ['number', 'boolean'].includes(typeof value)) return value;
  if (typeof value === 'string') return TRACKING_VALUE.test(value) ? undefined : value;
  if (Array.isArray(value)) {
    return value.map(safeValue).filter((item) => item !== undefined);
  }
  if (typeof value === 'object') {
    const output = {};
    for (const key of Object.keys(value).sort()) {
      const sanitized = safeValue(value[key]);
      if (sanitized !== undefined) output[key] = sanitized;
    }
    return output;
  }
  return undefined;
}

function sameSequence(actual = [], expected = []) {
  if (actual.length !== expected.length) return false;
  return actual.every((value, index) => value === expected[index]);
}

function defaultValues(page = {}) {
  const values = page.values && typeof page.values === 'object' ? page.values : {};
  const output = { ...values };
  if (!Object.keys(output).length) {
    if (page.title != null) output.title = page.title;
    if (page.route != null) output.route = page.route;
    if (page.url != null) output.url = page.url;
  }
  return output;
}

function selectSchemaValues(values, schema) {
  const output = {};
  for (const key of schema) {
    const sanitized = safeValue(values?.[key]);
    if (sanitized !== undefined) output[key] = sanitized;
  }
  return output;
}

export function extractArchetypeData({
  representativePage,
  representativeComponents = [],
  candidatePages = [],
} = {}) {
  if (!representativePage?.id) throw new Error('representativePage.id is required');
  const required = representativeComponents.length
    ? [...representativeComponents]
    : [...(representativePage.componentIds || [])];
  const representativeValues = safeValue(defaultValues(representativePage)) || {};
  const schema = Object.keys(representativeValues).sort();
  const pages = {
    [representativePage.id]: selectSchemaValues(representativeValues, schema),
  };
  const excludedPageIds = [];

  for (const page of candidatePages || []) {
    if (!page?.id || page.id === representativePage.id) continue;
    if (!sameSequence(page.componentIds || [], required)) {
      excludedPageIds.push(page.id);
      continue;
    }
    pages[page.id] = selectSchemaValues(defaultValues(page), schema);
  }

  return {
    schema,
    pages,
    literals: {},
    excludedPageIds,
    requiredComponentIds: required,
  };
}

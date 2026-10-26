'use strict';

const STOPWORDS = new Set([
  'a', 'about', 'above', 'after', 'again', 'against', 'all', 'am', 'amid', 'an', 'and',
  'article',
  'any', 'are', 'as', 'at', 'be', 'because', 'been', 'before', 'being', 'below',
  'between', 'both', 'but', 'by', 'can', 'com', 'comment', 'comments', 'could', 'did', 'do', 'does', 'doing',
  'down', 'during', 'each', 'few', 'for', 'from', 'further', 'had', 'has', 'have',
  'having', 'he', 'her', 'here', 'hers', 'herself', 'him', 'himself', 'his', 'how',
  'http', 'https', 'i', 'if', 'in', 'into', 'is', 'it', 'item', 'its', 'itself', 'just', 'me', 'more',
  'most', 'my', 'myself', 'new', 'no', 'nor', 'not', 'now', 'object', 'of', 'off', 'on',
  'once', 'only', 'or', 'other', 'our', 'ours', 'ourselves', 'out', 'over', 'own',
  'point', 'points', 'same', 'said', 'says', 'she', 'should', 'so', 'some', 'such', 'than', 'that',
  'the', 'their', 'theirs', 'them', 'themselves', 'then', 'there', 'these', 'they',
  'this', 'those', 'through', 'to', 'too', 'under', 'until', 'up', 'very', 'was',
  'we', 'were', 'what', 'when', 'where', 'which', 'while', 'who', 'whom', 'why',
  'url', 'will', 'with', 'would', 'ycombinator', 'you', 'your', 'yours', 'yourself', 'yourselves',
]);

const HIGH_SIMILARITY = 0.42;
const LOW_SIMILARITY = 0.3;

function wordCount(text) {
  return (String(text || '').trim().match(/\S+/g) || []).length;
}

function urlsOf(item) {
  return new Set([item.canonical_url, item.external_url, item.url]
    .filter(value => typeof value === 'string' && value.trim()));
}

function sharesUrl(a, b) {
  const right = urlsOf(b);
  return [...urlsOf(a)].some(url => right.has(url));
}

const MONTH = '(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|June?|July?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)';
const DATE_PATTERN = new RegExp(`\\b\\d{1,2}(?:st|nd|rd|th)?\\s+${MONTH}\\b|\\b${MONTH}\\s+\\d{1,2}(?:st|nd|rd|th)?\\b`, 'gi');

// Day-of-month numbers are not facts: two press releases dated "23 October"
// share the 23 without sharing a story.
function nonYearNumbers(text) {
  return new Set((String(text || '').replace(DATE_PATTERN, ' ').match(/\b\d[\d,.]*\b/g) || [])
    .map(number => number.replace(/[,.]/g, ''))
    .filter(number => !/^(?:19|20)\d{2}$/.test(number)));
}

function capitalisedEntities(text) {
  const matches = String(text || '').match(
    /\b(?:[A-Z][\p{Ll}][\p{L}’'-]*)(?:\s+(?:[A-Z][\p{Ll}][\p{L}’'-]*)){1,3}\b/gu
  ) || [];
  return new Set(matches
    .map(entity => entity.toLocaleLowerCase('en-AU'))
    .filter(entity => !/^(?:article|comments?) url$/.test(entity)));
}

function substantialContentOverlap(a, b) {
  // One outlet's own pieces share bylines and boilerplate ("Media Release –
  // Australian Education Union (AEU), 23 October"), so for a same-outlet pair
  // the shared name must be in both headlines ("Helen Haines: Who is…" and
  // "Helen Haines: Police reveal…" from 7NEWS on 20 Oct).
  if (a.outlet && a.outlet === b.outlet) {
    const rightTitleEntities = capitalisedEntities(b.title);
    if (![...capitalisedEntities(a.title)].some(entity => rightTitleEntities.has(entity))) return false;
  }
  const left = `${a.title || ''}\n${a.description || ''}`;
  const right = `${b.title || ''}\n${b.description || ''}`;
  const rightNumbers = nonYearNumbers(right);
  if (![...nonYearNumbers(left)].some(number => rightNumbers.has(number))) return false;
  const rightEntities = capitalisedEntities(right);
  return [...capitalisedEntities(left)].some(entity => rightEntities.has(entity));
}

function allowsSimilarityMerge(a, b) {
  if (sharesUrl(a, b) || substantialContentOverlap(a, b)) return true;
  // A title of three words or fewer ("Tough Decisions") says too little to
  // match on: an r/2007scape post merged with an RBA story this way.
  return wordCount(a.title) > 3 && wordCount(b.title) > 3;
}

function tokenize(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .filter(token => !STOPWORDS.has(token))
    .map(token => {
      if (token.length <= 4) return token;
      if (token.endsWith('ing')) return token.slice(0, -3);
      if (token.endsWith('ed')) return token.slice(0, -2);
      if (token.endsWith('s') && !token.endsWith('ss')) return token.slice(0, -1);
      return token;
    })
    .filter(token => token.length >= 3 || /^\d+$/.test(token));
}

function titleSimilarity(left, right) {
  const leftTokens = new Set(tokenize(left));
  const rightTokens = new Set(tokenize(right));
  if (leftTokens.size === 0 || rightTokens.size === 0) return { score: 0, shared: 0 };
  const shared = [...leftTokens].filter(token => rightTokens.has(token)).length;
  return {
    score: shared / Math.sqrt(leftTokens.size * rightTokens.size),
    shared,
  };
}

function makeUnionFind(size) {
  const parent = Array.from({ length: size }, (_, index) => index);
  const ranks = new Array(size).fill(0);

  function find(value) {
    if (parent[value] !== value) parent[value] = find(parent[value]);
    return parent[value];
  }

  function union(a, b) {
    const rootA = find(a);
    const rootB = find(b);
    if (rootA === rootB) return false;

    if (ranks[rootA] < ranks[rootB]) parent[rootA] = rootB;
    else if (ranks[rootA] > ranks[rootB]) parent[rootB] = rootA;
    else {
      parent[rootB] = rootA;
      ranks[rootA]++;
    }
    return true;
  }

  return { find, union };
}

function groupIndices(values, keyOf) {
  const groups = new Map();
  values.forEach((value, index) => {
    const key = keyOf(value);
    if (key == null) return;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(index);
  });
  return groups;
}

function leadIndex(indices, items) {
  return indices.reduce((bestIndex, index) => {
    const best = items[bestIndex];
    const candidate = items[index];
    const priorityDifference = (candidate.source_priority ?? 1) - (best.source_priority ?? 1);
    if (priorityDifference > 0) return index;
    if (priorityDifference < 0) return bestIndex;
    return (candidate.description || '').length > (best.description || '').length
      ? index
      : bestIndex;
  });
}

function tfIdfVectors(items) {
  const documents = items.map(item => tokenize(
    `${item.title || ''} ${(item.description || '').slice(0, 300)}`
  ));
  const documentFrequency = new Map();

  for (const document of documents) {
    for (const token of new Set(document)) {
      documentFrequency.set(token, (documentFrequency.get(token) || 0) + 1);
    }
  }

  const count = items.length;
  return documents.map(document => {
    const vector = new Map();
    for (const token of document) vector.set(token, (vector.get(token) || 0) + 1);
    for (const [token, frequency] of vector) {
      const idf = Math.log((count + 1) / (documentFrequency.get(token) + 1)) + 1;
      vector.set(token, frequency * idf);
    }
    return vector;
  });
}

function cosine(a, b) {
  let dot = 0;
  let magnitudeA = 0;
  let magnitudeB = 0;
  for (const value of a.values()) magnitudeA += value * value;
  for (const value of b.values()) magnitudeB += value * value;
  if (magnitudeA === 0 || magnitudeB === 0) return 0;

  const [smaller, larger] = a.size <= b.size ? [a, b] : [b, a];
  for (const [token, value] of smaller) dot += value * (larger.get(token) || 0);
  return dot / (Math.sqrt(magnitudeA) * Math.sqrt(magnitudeB));
}

function deterministicSameStory(a, b) {
  if (sharesUrl(a, b) || substantialContentOverlap(a, b)) return true;
  if (!allowsSimilarityMerge(a, b)) return false;
  const vectors = tfIdfVectors([a, b]);
  return cosine(vectors[0], vectors[1]) >= HIGH_SIMILARITY;
}

function pathnameOf(item) {
  if (!item.canonical_url) return null;
  try {
    const pathname = new URL(item.canonical_url).pathname;
    return pathname.length >= 25 ? pathname : null;
  } catch (_) {
    return null;
  }
}

function createOutletUnion(items) {
  const outlets = [...new Set(items.map(item => item.outlet).filter(Boolean))];
  const indices = new Map(outlets.map((outlet, index) => [outlet, index]));
  return { indices, unionFind: makeUnionFind(outlets.length) };
}

function rootGroups(items, unionFind) {
  const groups = new Map();
  items.forEach((item, index) => {
    const root = unionFind.find(index);
    if (!groups.has(root)) groups.set(root, []);
    groups.get(root).push(index);
  });
  return [...groups.values()];
}

async function clusterItems(items, {
  judge = async () => false,
  high = HIGH_SIMILARITY,
  low = LOW_SIMILARITY,
  maxChecks = 40,
  log = { warn() {} },
} = {}) {
  const unionFind = makeUnionFind(items.length);
  const outletUnion = createOutletUnion(items);
  let urlMerges = 0;
  let pathMerges = 0;
  let similarMerges = 0;
  let judged = 0;
  let judgedYes = 0;

  for (const indices of groupIndices(items, item => item.canonical_url || null).values()) {
    for (let index = 1; index < indices.length; index++) {
      if (unionFind.union(indices[0], indices[index])) urlMerges++;
    }
  }

  for (const indices of groupIndices(items, pathnameOf).values()) {
    for (let index = 1; index < indices.length; index++) {
      if (unionFind.union(indices[0], indices[index])) pathMerges++;
    }

    const outletIndices = [...new Set(indices
      .map(index => outletUnion.indices.get(items[index].outlet))
      .filter(index => index != null))];
    for (let index = 1; index < outletIndices.length; index++) {
      outletUnion.unionFind.union(outletIndices[0], outletIndices[index]);
    }
  }

  for (let left = 0; left < items.length; left++) {
    for (let right = left + 1; right < items.length; right++) {
      if (unionFind.find(left) === unionFind.find(right)) continue;
      if (substantialContentOverlap(items[left], items[right])) {
        if (unionFind.union(left, right)) similarMerges++;
      }
    }
  }

  const vectors = tfIdfVectors(items);
  const initialGroups = rootGroups(items, unionFind);
  const leads = initialGroups.map(indices => leadIndex(indices, items));
  const borderline = [];

  for (let left = 0; left < leads.length; left++) {
    for (let right = left + 1; right < leads.length; right++) {
      const similarity = cosine(vectors[leads[left]], vectors[leads[right]]);
      if (!allowsSimilarityMerge(items[leads[left]], items[leads[right]])) continue;
      if (similarity >= high) {
        if (unionFind.union(leads[left], leads[right])) similarMerges++;
      } else if (similarity >= low) {
        borderline.push({ left: leads[left], right: leads[right], similarity });
      }
    }
  }

  borderline.sort((a, b) => b.similarity - a.similarity);
  for (const pair of borderline) {
    if (judged >= maxChecks) break;
    if (unionFind.find(pair.left) === unionFind.find(pair.right)) continue;
    judged++;

    let sameStory = false;
    try {
      sameStory = await judge(items[pair.left], items[pair.right]);
    } catch (error) {
      log.warn('pipeline:cluster', `Same-story judge failed: ${error.message}`);
    }

    if (sameStory) {
      judgedYes++;
      unionFind.union(pair.left, pair.right);
    }
  }

  const clusters = rootGroups(items, unionFind).map(indices => {
    const clusterItems = indices.map(index => items[index]);
    const lead = items[leadIndex(indices, items)];
    const outlets = [...new Set(clusterItems.map(item => item.outlet).filter(Boolean))];
    const coverageRoots = new Set(outlets.map(outlet => {
      const outletIndex = outletUnion.indices.get(outlet);
      return outletIndex == null ? outlet : outletUnion.unionFind.find(outletIndex);
    }));

    return {
      id: lead.canonical_url || lead.title,
      items: clusterItems,
      lead,
      coverage: coverageRoots.size,
      outlets,
    };
  });

  return {
    clusters,
    stats: {
      items: items.length,
      clusters: clusters.length,
      url_merges: urlMerges,
      path_merges: pathMerges,
      similar_merges: similarMerges,
      judged,
      judged_yes: judgedYes,
    },
  };
}

module.exports = { tokenize, titleSimilarity, substantialContentOverlap, deterministicSameStory, clusterItems };

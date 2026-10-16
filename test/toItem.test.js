'use strict';

const { it } = require('node:test');
const assert = require('node:assert');
const { toItem } = require('../src/pipeline/toItem');

it('converts a ranked extracted cluster to the legacy item shape', () => {
  const lead = {
    title: 'Lead title',
    description: 'Lead description',
    source_name: 'ABC',
    url: 'https://abc.test/lead',
    canonical_url: 'https://abc.test/lead-canonical',
    image: null,
    published: '2026-10-12T20:00:00Z',
    source_priority: 2,
  };
  const other = {
    title: 'Other title',
    description: 'Other description',
    source_name: 'Examiner',
    url: 'https://examiner.test/other',
    canonical_url: 'https://examiner.test/other',
    image: 'https://images.test/other.jpg',
    published: '2026-10-12T23:00:00Z',
  };
  const cluster = {
    id: 'story',
    items: [other, lead],
    lead,
    coverage: 2,
    outlets: ['examiner.test', 'abc.test'],
    rank_score: 87.5,
    rank: 1,
    article_text: 'Full article text',
    article_html: '<p>Full article text</p>',
    article_url: 'https://abc.test/final',
    top_comments: ['Useful comment'],
    interest_matches: [{ label: 'Tasmania', kind: 'place', weight: 1, urgent: false, term: 'Tasmania' }],
  };

  assert.deepStrictEqual(toItem(cluster), {
    title: 'Lead title',
    description: 'Lead description',
    source_name: 'ABC',
    url: 'https://abc.test/lead',
    canonical_url: 'https://abc.test/lead-canonical',
    image: 'https://images.test/other.jpg',
    published: '2026-10-12T23:00:00Z',
    source_priority: 2,
    sources: [
      { name: 'Examiner', url: 'https://examiner.test/other' },
      { name: 'ABC', url: 'https://abc.test/lead' },
    ],
    outlet_versions: [
      { name: 'Examiner', headline: 'Other title', description: 'Other description', url: 'https://examiner.test/other', text: 'Other description' },
      { name: 'ABC', headline: 'Lead title', description: 'Lead description', url: 'https://abc.test/lead', text: 'Lead description' },
    ],
    merged_descriptions: ['Lead description', 'Other description'],
    relevance_score: 87.5,
    article_content: 'Full article text',
    article_html: '<p>Full article text</p>',
    article_url: 'https://abc.test/final',
    top_comments: ['Useful comment'],
    interest_matches: [{ label: 'Tasmania', kind: 'place', weight: 1, urgent: false, term: 'Tasmania' }],
    coverage: 2,
    rank: 1,
  });
});

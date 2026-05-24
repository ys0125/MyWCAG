// YSuresh Codes — discovery.js

'use strict';

const axios = require('axios');

const PLACES_BASE = 'https://maps.googleapis.com/maps/api/place';

// Location modifiers used to generate extra queries when maxResults > 60
const LOCATION_VARIANTS = [
  '',             // base query first (no modifier)
  'north',
  'south',
  'east',
  'west',
  'downtown',
  'central',
  'northeast',
  'northwest',
  'southeast',
  'southwest',
  'suburb',
  'uptown',
  'midtown',
  'waterfront',
  'west end',
  'east end',
  'old town',
  'city centre',
  'north end',
  'south end',
  'inner city',
  'outer',
  'area 1',
  'area 2',
  'area 3',
  'area 4',
  'district',
  'metro',
  'greater',
  'rural',
  'industrial',
  'residential',
  'commercial',
];

async function discoverWebsites({ niche, location, maxResults = 20 }) {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) {
    throw new Error('GOOGLE_PLACES_API_KEY is not set. Add it to your .env file.');
  }

  const seen       = new Set();
  const businesses = [];

  // Each variant yields at most 60 results; generate enough variants to reach maxResults
  const variantsNeeded = Math.ceil(maxResults / 60);
  const variants = LOCATION_VARIANTS.slice(0, Math.max(variantsNeeded + 4, 4)); // a few extra for fallback

  console.log(`\n🔍 Searching for "${niche}" in "${location}" (target: ${maxResults} businesses)`);
  if (maxResults > 60) {
    console.log(`   Will use up to ${variants.length} location variants to reach target.\n`);
  }

  for (const modifier of variants) {
    if (businesses.length >= maxResults) break;

    const queryLocation = modifier ? `${location} ${modifier}` : location;
    const query         = `${niche} in ${queryLocation}`;

    console.log(`\n  📍 Query: "${query}" (${businesses.length}/${maxResults} so far)`);

    const newFromVariant = await fetchAllPages(query, apiKey, maxResults - businesses.length, seen, businesses);
    console.log(`     +${newFromVariant} new results`);

    // Pause between variants to be kind to the API
    if (businesses.length < maxResults && modifier !== variants[variants.length - 1]) {
      await sleep(500);
    }
  }

  console.log(`\n✅ Total: ${businesses.length} unique businesses with websites.\n`);
  return businesses;
}

async function fetchAllPages(query, apiKey, remaining, seen, businesses) {
  let nextPageToken = null;
  let page = 0;
  let added = 0;

  do {
    page++;
    const params = { query, key: apiKey };
    if (nextPageToken) {
      params.pagetoken = nextPageToken;
      await sleep(2200); // Google requires ~2s before a page token is valid
    }

    let data;
    try {
      const resp = await axios.get(`${PLACES_BASE}/textsearch/json`, { params });
      data = resp.data;
    } catch (err) {
      console.warn(`    ⚠  Text Search request failed: ${err.message}`);
      break;
    }

    if (data.status === 'REQUEST_DENIED') {
      throw new Error(`Google Places API denied: ${data.error_message}\nCheck your API key has the Places API enabled.`);
    }
    if (data.status === 'ZERO_RESULTS' || data.status !== 'OK') break;

    console.log(`    Page ${page}: ${data.results.length} places returned`);

    for (const place of data.results) {
      if (added >= remaining) break;
      if (seen.has(place.place_id)) continue;

      process.stdout.write(`    Fetching details for "${place.name}"... `);
      const details = await getPlaceDetails(place.place_id, apiKey);

      if (details.website) {
        seen.add(place.place_id);
        businesses.push({
          name:    place.name,
          address: place.formatted_address || details.formatted_address || 'N/A',
          website: normaliseUrl(details.website),
          phone:   details.formatted_phone_number || 'N/A',
          rating:  place.rating || null,
          placeId: place.place_id,
        });
        added++;
        console.log(`✓  (${details.website})`);
      } else {
        console.log('⚠  no website, skipping');
      }

      await sleep(150); // gentle rate-limit between detail calls
    }

    nextPageToken = data.next_page_token;
  } while (nextPageToken && added < remaining);

  return added;
}

async function getPlaceDetails(placeId, apiKey) {
  try {
    const resp = await axios.get(`${PLACES_BASE}/details/json`, {
      params: {
        place_id: placeId,
        fields:   'name,website,formatted_phone_number,formatted_address',
        key:      apiKey,
      },
    });
    return resp.data.result || {};
  } catch (err) {
    console.warn(`    Warning: could not fetch details for ${placeId}: ${err.message}`);
    return {};
  }
}

function normaliseUrl(url) {
  if (!url) return url;
  return /^https?:\/\//i.test(url) ? url : `https://${url}`;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

module.exports = { discoverWebsites };

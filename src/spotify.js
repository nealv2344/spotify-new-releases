// src/spotify.js
const axios = require('axios');
const { sleep, isoDateDaysAgo, parseReleaseDate } = require('./utils');
const { getLookbackDays } = require('./state');

async function withSpotifyRetry(requestFn, { maxRetries = 8 } = {}) {
  let attempt = 0;
  while (true) {
    try {
      return await requestFn();
    } catch (e) {
      const status = e.response?.status;
      if (status !== 429) throw e;

      const retryAfterHeader = e.response?.headers?.['retry-after'];
      const retryAfterSeconds = Number(retryAfterHeader);

      const waitMs = Number.isFinite(retryAfterSeconds)
        ? retryAfterSeconds * 1000
        : Math.min(1000 * Math.pow(2, attempt), 30000);

      attempt += 1;
      if (attempt > maxRetries) throw e;

      await sleep(waitMs);
    }
  }
}

async function getNewestReleasesForArtist(accessToken, artistId, limit) {
  async function fetchGroup(group) {
    const params = new URLSearchParams();
    params.set('include_groups', group);
    params.set('limit', String(limit));
    params.set('market', 'from_token');

    const url = `https://api.spotify.com/v1/artists/${artistId}/albums?${params.toString()}`;
    const resp = await axios.get(url, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });

    return resp.data.items;
  }

  const [albums, singles] = await Promise.all([
    fetchGroup('album'),
    fetchGroup('single')
  ]);

  const byId = new Map();
  for (const r of [...albums, ...singles]) byId.set(r.id, r);

  const combined = Array.from(byId.values());
  combined.sort((a, b) => {
    const da = parseReleaseDate(a.release_date, a.release_date_precision);
    const db = parseReleaseDate(b.release_date, b.release_date_precision);
    return db - da;
  });

  return combined;
}

async function getAllFollowedArtists(accessToken) {
  const artists = [];
  let after = null;

  while (true) {
    const params = new URLSearchParams();
    params.set('type', 'artist');
    params.set('limit', '50');
    if (after) params.set('after', after);

    const resp = await axios.get(`https://api.spotify.com/v1/me/following?${params.toString()}`, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });

    const items = resp.data.artists.items;
    artists.push(...items);

    const nextAfter = resp.data.artists.cursors?.after;
    if (!nextAfter) break;
    after = nextAfter;
  }

  return artists;
}

async function getAllTracksForAlbum(accessToken, albumId) {
  const tracks = [];
  let url = `https://api.spotify.com/v1/albums/${albumId}/tracks?limit=50&market=from_token`;

  while (url) {
    const resp = await axios.get(url, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });

    tracks.push(...resp.data.items);
    url = resp.data.next;
  }

  return tracks;
}

async function getAllPlaylistTrackUris(accessToken, playlistId) {
  const uris = new Set();
  let url = `https://api.spotify.com/v1/playlists/${playlistId}/tracks?limit=100&market=from_token`;

  while (url) {
    const resp = await axios.get(url, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });

    for (const item of resp.data.items) {
      const track = item.track;
      if (track && track.uri) uris.add(track.uri);
    }

    url = resp.data.next;
  }

  return uris;
}

async function addTracksToPlaylist(accessToken, playlistId, trackUris) {
  const chunkSize = 100;
  let added = 0;

  for (let i = 0; i < trackUris.length; i += chunkSize) {
    const chunk = trackUris.slice(i, i + chunkSize);

    await axios.post(
      `https://api.spotify.com/v1/playlists/${playlistId}/tracks`,
      { uris: chunk },
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
      }
    );

    added += chunk.length;
  }

  return added;
}

async function buildCandidateTrackUris(state, accessToken, lookbackDays, perArtistLimit) {
  const artists = await getAllFollowedArtists(accessToken);

  const candidateUris = new Set();
  let qualifyingReleases = 0;

  for (const artist of artists) {
    const perArtistLookbackDays = getLookbackDays(state, artist.id);
    const cutoff = isoDateDaysAgo(perArtistLookbackDays);

    const releases = await withSpotifyRetry(() =>
      getNewestReleasesForArtist(accessToken, artist.id, perArtistLimit)
    );

    const recentReleases = releases.filter(r => {
      const d = parseReleaseDate(r.release_date, r.release_date_precision);
      return d >= cutoff;
    });

    for (const rel of recentReleases) {
      qualifyingReleases += 1;

      const albumTracks = await withSpotifyRetry(() =>
        getAllTracksForAlbum(accessToken, rel.id)
      );

      for (const t of albumTracks) {
        if (t && t.uri) candidateUris.add(t.uri);
      }
    }

    state.artists[artist.id] = true;
    await sleep(150);
  }

  return { candidateUris, qualifyingReleases, artistsScanned: artists.length };
}

module.exports = {
  withSpotifyRetry,
  getNewestReleasesForArtist,
  getAllFollowedArtists,
  getAllTracksForAlbum,
  getAllPlaylistTrackUris,
  addTracksToPlaylist,
  buildCandidateTrackUris
};

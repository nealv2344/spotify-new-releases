// src/routes.js
const axios = require('axios');
const querystring = require('querystring');

const { loadState, saveState } = require('./state');
const { isoDateDaysAgo, parseReleaseDate } = require('./utils');
const {
  getAllFollowedArtists,
  getNewestReleasesForArtist,
  getAllTracksForAlbum,
  getAllPlaylistTrackUris,
  addTracksToPlaylist,
  buildCandidateTrackUris
} = require('./spotify');

module.exports = function routes(app) {
  app.get('/', (req, res) => {
    res.send('Server running on 127.0.0.1:3000');
  });

  app.get('/login', (req, res) => {
    const scope = [
      'user-follow-read',
      'playlist-modify-public',
      'playlist-modify-private'
    ].join(' ');

    const params = querystring.stringify({
      response_type: 'code',
      client_id: process.env.SPOTIFY_CLIENT_ID,
      scope: scope,
      redirect_uri: process.env.SPOTIFY_REDIRECT_URI
    });

    res.redirect(`https://accounts.spotify.com/authorize?${params}`);
  });

  app.get('/callback', async (req, res) => {
    const code = req.query.code;
    const error = req.query.error;

    if (error) return res.send(`Error during authorization: ${error}`);
    if (!code) return res.send('No authorization code received');

    try {
      const tokenResponse = await axios.post(
        'https://accounts.spotify.com/api/token',
        querystring.stringify({
          grant_type: 'authorization_code',
          code: code,
          redirect_uri: process.env.SPOTIFY_REDIRECT_URI
        }),
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            Authorization: 'Basic ' + Buffer.from(
              process.env.SPOTIFY_CLIENT_ID + ':' + process.env.SPOTIFY_CLIENT_SECRET
            ).toString('base64')
          }
        }
      );

      const refreshToken = tokenResponse.data.refresh_token;


      req.session.access_token = tokenResponse.data.access_token;
      req.session.refresh_token = tokenResponse.data.refresh_token;

      res.redirect('/me');
    } catch (e) {
      const details = e.response?.data ? JSON.stringify(e.response.data) : e.message;
      res.status(500).send(`Token exchange failed: ${details}`);
    }
  });

  app.get('/me', async (req, res) => {
    const accessToken = req.session.access_token;
    if (!accessToken) {
      return res.status(401).send('No access token in session. Go to /login first.');
    }

    try {
      const meResponse = await axios.get('https://api.spotify.com/v1/me', {
        headers: { Authorization: `Bearer ${accessToken}` }
      });

      res.send(`Logged in as: ${meResponse.data.display_name}`);
    } catch (e) {
      const details = e.response?.data ? JSON.stringify(e.response.data) : e.message;
      res.status(500).send(`Failed to fetch profile: ${details}`);
    }
  });

  app.get('/artists', async (req, res) => {
    const accessToken = req.session.access_token;
    if (!accessToken) {
      return res.status(401).send('No access token in session. Go to /login first.');
    }

    try {
      const artists = await getAllFollowedArtists(accessToken);
      const preview = artists.slice(0, 10).map(a => a.name);

      res.json({
        followed_artist_count: artists.length,
        preview_first_10: preview
      });
    } catch (e) {
      const details = e.response?.data ? JSON.stringify(e.response.data) : e.message;
      res.status(500).send(`Failed to fetch followed artists: ${details}`);
    }
  });

  app.get('/releases-preview', async (req, res) => {
    const accessToken = req.session.access_token;
    if (!accessToken) return res.status(401).send('No access token. Go to /login first.');

    const lookbackDays = Number(process.env.RELEASE_LOOKBACK_DAYS || 30);
    const perArtistLimit = Number(process.env.RELEASE_LIMIT_PER_ARTIST || 5);
    const cutoff = isoDateDaysAgo(lookbackDays);

    try {
      const artists = await getAllFollowedArtists(accessToken);

      const results = [];
      for (const artist of artists) {
        const releases = await getNewestReleasesForArtist(accessToken, artist.id, perArtistLimit);

        const recent = releases
          .map(r => ({
            id: r.id,
            name: r.name,
            release_date: r.release_date,
            release_date_precision: r.release_date_precision,
            type: r.album_type
          }))
          .filter(r => parseReleaseDate(r.release_date, r.release_date_precision) >= cutoff);

        if (recent.length > 0) {
          results.push({ artist: artist.name, recent_releases: recent });
        }

        if (results.length >= 5) break;
      }

      res.json({
        lookback_days: lookbackDays,
        per_artist_limit: perArtistLimit,
        artists_scanned: artists.length,
        artists_with_recent_releases_shown: results.length,
        preview: results
      });
    } catch (e) {
      const details = e.response?.data ? JSON.stringify(e.response.data) : e.message;
      res.status(500).send(`Failed releases preview: ${details}`);
    }
  });

  app.get('/tracks-preview', async (req, res) => {
    const accessToken = req.session.access_token;
    if (!accessToken) return res.status(401).send('No access token. Go to /login first.');

    const lookbackDays = Number(process.env.RELEASE_LOOKBACK_DAYS || 30);
    const perArtistLimit = Number(process.env.RELEASE_LIMIT_PER_ARTIST || 5);
    const cutoff = isoDateDaysAgo(lookbackDays);

    const maxReleasesToProcess = 10;

    try {
      const artists = await getAllFollowedArtists(accessToken);

      const uniqueTrackUris = new Set();
      const preview = [];

      let releasesProcessed = 0;

      for (const artist of artists) {
        const releases = await getNewestReleasesForArtist(accessToken, artist.id, perArtistLimit);

        const recentReleases = releases.filter(r => {
          const d = parseReleaseDate(r.release_date, r.release_date_precision);
          return d >= cutoff;
        });

        for (const rel of recentReleases) {
          if (releasesProcessed >= maxReleasesToProcess) break;

          const albumTracks = await getAllTracksForAlbum(accessToken, rel.id);

          const trackUris = albumTracks
            .filter(t => t && t.uri)
            .map(t => t.uri);

          trackUris.forEach(u => uniqueTrackUris.add(u));

          preview.push({
            artist: artist.name,
            release_name: rel.name,
            release_date: rel.release_date,
            album_id: rel.id,
            tracks_in_release: trackUris.length,
            sample_track_names: albumTracks.slice(0, 3).map(t => t.name)
          });

          releasesProcessed += 1;
        }

        if (releasesProcessed >= maxReleasesToProcess) break;
      }

      res.json({
        lookback_days: lookbackDays,
        per_artist_limit: perArtistLimit,
        artists_scanned: artists.length,
        releases_processed: releasesProcessed,
        unique_track_uris_found: uniqueTrackUris.size,
        preview
      });
    } catch (e) {
      const details = e.response?.data ? JSON.stringify(e.response.data) : e.message;
      res.status(500).send(`Failed tracks preview: ${details}`);
    }
  });

  
  app.get('/would-add', async (req, res) => {
    const accessToken = req.session.access_token;
    if (!accessToken) return res.status(401).send('No access token. Go to /login first.');

    const playlistId = process.env.TARGET_PLAYLIST_ID;
    if (!playlistId) return res.status(400).send('TARGET_PLAYLIST_ID is missing in .env');

    const lookbackDays = Number(process.env.RELEASE_LOOKBACK_DAYS || 30);
    const perArtistLimit = Number(process.env.RELEASE_LIMIT_PER_ARTIST || 5);

    try {
      const { candidateUris, qualifyingReleases, artistsScanned } =
        await buildCandidateTrackUris(accessToken, lookbackDays, perArtistLimit);

      const existingUris = await getAllPlaylistTrackUris(accessToken, playlistId);

      let alreadyInPlaylist = 0;
      const toAdd = [];

      for (const uri of candidateUris) {
        if (existingUris.has(uri)) alreadyInPlaylist += 1;
        else toAdd.push(uri);
      }

      res.json({
        artists_scanned: artistsScanned,
        qualifying_releases_found: qualifyingReleases,
        candidate_unique_uris: candidateUris.size,
        playlist_existing_unique_uris: existingUris.size,
        already_in_playlist_count: alreadyInPlaylist,
        new_to_add_count: toAdd.length,
        sample_new_uris_first_10: toAdd.slice(0, 10)
      });
    } catch (e) {
      const details = e.response?.data ? JSON.stringify(e.response.data) : e.message;
      res.status(500).send(`Failed would-add calculation: ${details}`);
    }
  });

  app.get('/create-playlist', async (req, res) => {
    const accessToken = req.session.access_token;
    if (!accessToken) {
      return res.status(401).send('No access token in session. Go to /login first.');
    }

    try {
      const meResponse = await axios.get('https://api.spotify.com/v1/me', {
        headers: { Authorization: `Bearer ${accessToken}` }
      });

      const userId = meResponse.data.id;

      const playlistResponse = await axios.post(
        `https://api.spotify.com/v1/users/${userId}/playlists`,
        {
          name: process.env.TARGET_PLAYLIST_NAME || 'New Releases (Auto)',
          description: 'Auto-generated from new releases of followed artists',
          public: false
        },
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
          }
        }
      );

      const playlist = playlistResponse.data;

      res.send(`Playlist created: ${playlist.name}<br><a href="${playlist.external_urls.spotify}" target="_blank">Open in Spotify</a>`);
    } catch (e) {
      const details = e.response?.data ? JSON.stringify(e.response.data) : e.message;
      res.status(500).send(`Failed to create playlist: ${details}`);
    }
  });

  app.get('/run', async (req, res) => {
    const accessToken = req.session.access_token;
    if (!accessToken) return res.status(401).send('No access token. Go to /login first.');

    const playlistId = process.env.TARGET_PLAYLIST_ID;
    if (!playlistId) return res.status(400).send('TARGET_PLAYLIST_ID is missing in .env');

    const lookbackDays = Number(process.env.RELEASE_LOOKBACK_DAYS || 30);
    const perArtistLimit = Number(process.env.RELEASE_LIMIT_PER_ARTIST || 5);

    const state = loadState();

    try {
      const { candidateUris, qualifyingReleases, artistsScanned } =
        await buildCandidateTrackUris(state, accessToken, lookbackDays, perArtistLimit);

      const existingUris = await getAllPlaylistTrackUris(accessToken, playlistId);

      const toAdd = [];
      for (const uri of candidateUris) {
        if (!existingUris.has(uri)) toAdd.push(uri);
      }

      const addedCount = await addTracksToPlaylist(accessToken, playlistId, toAdd);

      state.last_run_at = new Date().toISOString();
      state.mode = "incremental";
      saveState(state);

      res.json({
        artists_scanned: artistsScanned,
        qualifying_releases_found: qualifyingReleases,
        candidate_unique_uris: candidateUris.size,
        playlist_existing_unique_uris_before: existingUris.size,
        attempted_to_add: toAdd.length,
        added_count: addedCount
      });
    } catch (e) {
      const details = e.response?.data ? JSON.stringify(e.response.data) : e.message;
      res.status(500).send(`Run failed: ${details}`);
    }
  });

  // DEBUG SECTION
  app.get('/debug-artist', async (req, res) => {
    const accessToken = req.session.access_token;
    if (!accessToken) return res.status(401).send('No access token. Go to /login first.');

    const name = (req.query.name || '').toLowerCase();
    if (!name) return res.status(400).send('Provide ?name=Rebelion');

    const artists = await getAllFollowedArtists(accessToken);
    const match = artists.find(a => a.name.toLowerCase() === name) ||
                  artists.find(a => a.name.toLowerCase().includes(name));

    if (!match) return res.status(404).send('No followed artist matched.');

    const releases = await getNewestReleasesForArtist(
      accessToken,
      match.id,
      Number(process.env.RELEASE_LIMIT_PER_ARTIST || 5)
    );

    res.json({
      followed_artist: { name: match.name, id: match.id },
      releases_seen_by_app: releases.map(r => ({
        name: r.name,
        id: r.id,
        release_date: r.release_date,
        precision: r.release_date_precision,
        album_type: r.album_type
      }))
    });
  });
};

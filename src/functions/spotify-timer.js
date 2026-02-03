const { app } = require('@azure/functions');

const { refreshAccessToken } = require('../auth');
const { loadState, saveState } = require('../state');
const {
  buildCandidateTrackUris,
  getAllPlaylistTrackUris,
  addTracksToPlaylist
} = require('../spotify');

app.timer('spotify-timer', {
    schedule: '0 0 12 * * *',    // At 07:00 AM every day
  handler: async (myTimer, context) => {
  
    try {
      const playlistId = process.env.TARGET_PLAYLIST_ID;
      if (!playlistId || playlistId.trim().length < 10) {
        throw new Error(`TARGET_PLAYLIST_ID is missing or looks wrong: "${playlistId}"`);
      }
  
      const lookbackDays = Number(process.env.RELEASE_LOOKBACK_DAYS || 30);
      const perArtistLimit = Number(process.env.RELEASE_LIMIT_PER_ARTIST || 5);
  
      const accessToken = await refreshAccessToken();
      const state = loadState();
  
      const { candidateUris, qualifyingReleases, artistsScanned } =
        await buildCandidateTrackUris(state, accessToken, lookbackDays, perArtistLimit);
  
      const existingUris = await getAllPlaylistTrackUris(accessToken, playlistId);
  
      const toAdd = [];
      for (const uri of candidateUris) {
        if (!existingUris.has(uri)) toAdd.push(uri);
      }
  
      const addedCount = await addTracksToPlaylist(accessToken, playlistId, toAdd);
  
      state.last_run_at = new Date().toISOString();
      state.mode = 'incremental';
      saveState(state);
  
      context.log(
        JSON.stringify(
          {
            ok: true,
            artists_scanned: artistsScanned,
            qualifying_releases_found: qualifyingReleases,
            attempted_to_add: toAdd.length,
            added_count: addedCount
          },
          null,
          2
        )
      );
    } catch (err) {
      const details = err?.response?.data || err?.message || String(err);
      context.log("TIMER ERROR:", details);
      context.log("TIMER ERROR STACK:", err?.stack || "(no stack)");
      throw err;
    }
  }
  
});

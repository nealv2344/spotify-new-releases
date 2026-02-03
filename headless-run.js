// scripts/headless-run.js
require("dotenv").config();

const { refreshAccessToken } = require("./src/auth");
const { loadState, saveState } = require("./src/state");
const {
  buildCandidateTrackUris,
  getAllPlaylistTrackUris,
  addTracksToPlaylist
} = require("./src/spotify");

async function main() {
  const playlistId = process.env.TARGET_PLAYLIST_ID;
  if (!playlistId) throw new Error("Missing TARGET_PLAYLIST_ID in .env");

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
  state.mode = "incremental";
  saveState(state);

  console.log(
    JSON.stringify(
      {
        artists_scanned: artistsScanned,
        qualifying_releases_found: qualifyingReleases,
        candidate_unique_uris: candidateUris.size,
        playlist_existing_unique_uris_before: existingUris.size,
        attempted_to_add: toAdd.length,
        added_count: addedCount
      },
      null,
      2
    )
  );
}

main().catch((err) => {
  console.error("Headless run failed:", err.response?.data || err.message);
  process.exit(1);
});

// src/utils.js
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
  
  function isoDateDaysAgo(days) {
    const d = new Date();
    d.setDate(d.getDate() - days);
    return d;
  }
  
  function parseReleaseDate(releaseDate, precision) {
    if (precision === 'year') return new Date(`${releaseDate}-01-01T00:00:00Z`);
    if (precision === 'month') return new Date(`${releaseDate}-01T00:00:00Z`);
    return new Date(`${releaseDate}T00:00:00Z`);
  }
  
  module.exports = { sleep, isoDateDaysAgo, parseReleaseDate };
  
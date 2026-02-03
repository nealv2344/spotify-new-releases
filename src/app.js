// src/app.js
const express = require('express');
const session = require('express-session');
const routes = require('./routes');

function start() {
  const app = express();

  app.use(session({
    secret: 'dev_secret_change_later',
    resave: false,
    saveUninitialized: false
  }));

  routes(app);

  const PORT = 3000;
  app.listen(PORT, '127.0.0.1', () => {
    console.log(`Server listening at http://127.0.0.1:${PORT}`);
  });
}

module.exports = { start };

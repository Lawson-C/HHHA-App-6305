#!/usr/bin/env node
'use strict';

/**
 * Promote an existing profile to admin (initial admin, decision Q-001).
 *   npm run promote-admin -- user@example.com
 * The user must have signed in to the app once. Uses the DB in backend/.env.
 */
const { loadStrapi, fromDist } = require('./strapi-app');

(async () => {
  const email = process.argv[2];
  let app;
  let code = 0;
  try {
    app = await loadStrapi();
    const { promoteAdmin } = fromDist('services/promote-admin.js');
    console.log(await promoteAdmin(email));
  } catch (error) {
    console.error(error.message);
    code = 1;
  } finally {
    if (app) await app.destroy();
    process.exit(code);
  }
})();

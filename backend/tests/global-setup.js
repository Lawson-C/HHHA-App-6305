'use strict';

/**
 * Compiles the TypeScript app into dist/ once per `npm test` run (same as Strapi's own
 * build step, without the admin panel). Each test file then boots Strapi from dist/.
 */
module.exports = async () => {
  process.env.NODE_ENV = 'test';
  const { compileStrapi } = require('@strapi/strapi');
  await compileStrapi({ appDir: require('path').resolve(__dirname, '..') });
};

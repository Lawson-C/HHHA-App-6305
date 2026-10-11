-- Runs once, on first start of an empty Postgres volume.
-- Strapi does not create its schema itself; mirror the Supabase setup locally.
CREATE SCHEMA IF NOT EXISTS strapi AUTHORIZATION strapi;

// Learn more https://docs.expo.dev/guides/customizing-metro
const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const config = getDefaultConfig(__dirname);

// studio/ (Sanity) has its own node_modules and supabase/ holds Deno code; keep Metro out.
config.resolver.blockList = ['studio', 'supabase'].map((dir) => {
  const abs = path.resolve(__dirname, dir).replace(/[/\\]/g, '[/\\\\]');
  return new RegExp(`^${abs}[/\\\\].*`);
});

module.exports = config;

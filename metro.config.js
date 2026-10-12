// Learn more https://docs.expo.dev/guides/customizing-metro
const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const config = getDefaultConfig(__dirname);

// The Strapi backend lives in ./backend with its own node_modules; keep Metro from crawling it.
const backendDir = path.resolve(__dirname, 'backend').replace(/[/\\]/g, '[/\\\\]');
config.resolver.blockList = [new RegExp(`^${backendDir}[/\\\\].*`)];

module.exports = config;

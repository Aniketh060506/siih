#!/usr/bin/env node
/**
 * Create placeholder assets for Expo (icon.png, splash.png, adaptive-icon.png, favicon.png)
 * Run: node create-assets.js
 */
const fs = require('fs');
const path = require('path');

// Minimal 1x1 pixel amber PNG (base64)
const AMBER_PNG_1x1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI6QAAAABJRU5ErkJggg==',
  'base64'
);

const assetsDir = path.join(__dirname, 'assets');
if (!fs.existsSync(assetsDir)) fs.mkdirSync(assetsDir);

['icon.png', 'splash.png', 'adaptive-icon.png', 'favicon.png'].forEach(name => {
  const dest = path.join(assetsDir, name);
  if (!fs.existsSync(dest)) {
    fs.writeFileSync(dest, AMBER_PNG_1x1);
    console.log('Created:', name);
  }
});

console.log('Assets ready!');

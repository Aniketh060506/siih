#!/usr/bin/env node
/**
 * iTantra Setup Script — Team Monte Carlo
 * Installs all dependencies for both server and app
 */

const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const root = __dirname;

function run(cmd, cwd) {
  console.log(`\n[RUN] ${cmd}\n  in: ${cwd}`);
  execSync(cmd, { cwd, stdio: 'inherit' });
}

console.log('\n╔══════════════════════════════════════════╗');
console.log('║   iTantra Setup — Team Monte Carlo       ║');
console.log('╚══════════════════════════════════════════╝\n');

// 1. Install server deps
console.log('📦 Installing relay server dependencies...');
run('npm install', path.join(root, 'server'));

// 2. Install app deps
console.log('\n📱 Installing Expo app dependencies...');
run('npm install', path.join(root, 'iTantra'));

// 3. Create assets
console.log('\n🎨 Creating placeholder assets...');
run('node create-assets.js', path.join(root, 'iTantra'));

console.log('\n✅ Setup complete!\n');
console.log('To run the app:\n');
console.log('  1. Start relay server:');
console.log('     cd server && npm start\n');
console.log('  2. Start the app (browser):');
console.log('     cd iTantra && npx expo start --web\n');
console.log('  3. Build APK:');
console.log('     cd iTantra && npx expo run:android\n');
console.log('  Open two browser tabs at http://localhost:8081');
console.log('  to test two phones communicating!\n');

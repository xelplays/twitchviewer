#!/usr/bin/env node

/**
 * Test script to verify the Twitch Activity Bot setup
 * Run with: node test-setup.js
 */

const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();

console.log('🧪 Twitch Activity Bot - Setup Test\n');

// Test 1: Check required files
console.log('📁 Checking required files...');
const requiredFiles = [
  'package.json',
  'bot_overlay.js',
  'env.example',
  'migrations/init.sql',
  'migrations/init_db.js',
  'overlay_static/overlay.html',
  'overlay_static/overlay.css',
  'overlay_static/overlay.js',
  'admin_static/clips.html',
  'admin_static/clips.css',
  'admin_static/clips.js',
  'modules/twitch-api.js',
  'README.md',
  '.gitignore'
];

let allFilesExist = true;
requiredFiles.forEach(file => {
  if (fs.existsSync(file)) {
    console.log(`  ✅ ${file}`);
  } else {
    console.log(`  ❌ ${file} - MISSING`);
    allFilesExist = false;
  }
});

if (allFilesExist) {
  console.log('  🎉 All required files present!\n');
} else {
  console.log('  ⚠️  Some files are missing!\n');
}

// Test 2: Check dependencies
console.log('📦 Checking dependencies...');
try {
  const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
  const requiredDeps = ['tmi.js', 'sqlite3', 'express', 'cors', 'node-cron', 'dotenv'];
  
  requiredDeps.forEach(dep => {
    if (packageJson.dependencies && packageJson.dependencies[dep]) {
      console.log(`  ✅ ${dep}: ${packageJson.dependencies[dep]}`);
    } else {
      console.log(`  ❌ ${dep} - MISSING`);
    }
  });
  console.log('');
} catch (error) {
  console.log('  ❌ Error reading package.json:', error.message, '\n');
}

// Test 3: Check environment file
console.log('⚙️  Checking environment configuration...');
if (fs.existsSync('.env')) {
  console.log('  ✅ .env file exists');
  try {
    const envContent = fs.readFileSync('.env', 'utf8');
    const requiredVars = ['BOT_USERNAME', 'BOT_OAUTH', 'CHANNEL', 'ADMIN_KEY'];
    
    requiredVars.forEach(varName => {
      if (envContent.includes(varName)) {
        console.log(`  ✅ ${varName} configured`);
      } else {
        console.log(`  ❌ ${varName} - MISSING`);
      }
    });
  } catch (error) {
    console.log('  ❌ Error reading .env file:', error.message);
  }
} else {
  console.log('  ⚠️  .env file not found - copy from env.example and configure');
}
console.log('');

// Test 4: Database schema check
console.log('🗄️  Testing database schema...');
const dbPath = path.join(__dirname, 'activity.db');

if (fs.existsSync(dbPath)) {
  console.log('  ✅ Database file exists');
  
  const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
      console.log('  ❌ Error opening database:', err.message);
      return;
    }
    
    // Check tables
    db.all("SELECT name FROM sqlite_master WHERE type='table'", (err, tables) => {
      if (err) {
        console.log('  ❌ Error querying tables:', err.message);
        db.close();
        return;
      }
      
      const requiredTables = ['points', 'clips', 'winners'];
      requiredTables.forEach(table => {
        if (tables.some(t => t.name === table)) {
          console.log(`  ✅ Table '${table}' exists`);
        } else {
          console.log(`  ❌ Table '${table}' - MISSING`);
        }
      });
      
      db.close();
      console.log('');
      printSummary();
    });
  });
} else {
  console.log('  ⚠️  Database not found - run "npm run init-db" to create');
  console.log('');
  printSummary();
}

function printSummary() {
  console.log('📋 Setup Summary:');
  console.log('');
  console.log('🚀 To start the bot:');
  console.log('  1. Configure .env file with your Twitch credentials');
  console.log('  2. Run: npm run init-db');
  console.log('  3. Run: npm start');
  console.log('');
  console.log('🌐 URLs after starting:');
  console.log('  - Overlay: http://localhost:3000/overlay.html');
  console.log('  - Admin Dashboard: http://localhost:3000/admin/clips.html?admin_key=YOUR_KEY');
  console.log('  - API: http://localhost:3000/top10');
  console.log('');
  console.log('📚 See README.md for detailed setup instructions');
  console.log('');
  console.log('🎮 Happy Streaming!');
}

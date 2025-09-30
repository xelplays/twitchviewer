const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');
const path = require('path');

// Create database and run migrations
function initDatabase() {
  const dbPath = path.join(__dirname, '..', 'activity.db');
  
  console.log('Initializing database...');
  
  const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
      console.error('Error opening database:', err.message);
      return;
    }
    console.log('Connected to SQLite database.');
  });

  // Read and execute init.sql
  const initSqlPath = path.join(__dirname, 'init.sql');
  const sql = fs.readFileSync(initSqlPath, 'utf8');
  
  db.exec(sql, (err) => {
    if (err) {
      console.error('Error running migrations:', err.message);
    } else {
      console.log('Database initialized successfully!');
    }
    db.close();
  });
}

// Run if called directly
if (require.main === module) {
  initDatabase();
}

module.exports = initDatabase;

const db = require('./db');
db.initDatabase().then(() => {
  console.log('Database initialized successfully.');
  setTimeout(() => process.exit(0), 1000);
}).catch(err => {
  console.error(err);
  process.exit(1);
});

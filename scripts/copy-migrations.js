const fs = require('fs');
const path = require('path');

const src = path.join(__dirname, '..', 'src', 'database', 'migrations');
const dest = path.join(__dirname, '..', 'dist', 'database', 'migrations');

fs.mkdirSync(dest, { recursive: true });
fs.cpSync(src, dest, { recursive: true });
console.log('Copied SQL migrations to dist/database/migrations');

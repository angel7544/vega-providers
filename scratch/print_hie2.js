const fs = require('fs');
const webApp = fs.readFileSync('web/app.js', 'utf8');
const lines = webApp.split('\n');

for (let i = 918; i < 935; i++) {
    console.log(`${i+1}: ${lines[i]}`);
}

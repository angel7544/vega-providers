const fs = require('fs');
const webApp = fs.readFileSync('web/app.js', 'utf8');
const lines = webApp.split('\n');

function printBlock(start, count) {
    console.log(`--- Lines ${start} to ${start + count} ---`);
    for (let i = start - 1; i < start - 1 + count; i++) {
        console.log(`${i+1}: ${lines[i]}`);
    }
}

printBlock(22, 15);
printBlock(269, 15);

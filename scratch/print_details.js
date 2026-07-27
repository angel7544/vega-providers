const fs = require('fs');
const webApp = fs.readFileSync('web/app.js', 'utf8');
const lines = webApp.split('\n');

function printFuncRange(start, count, label) {
    console.log(`\n--- ${label} (Line ${start}) ---`);
    for (let i = start - 1; i < start - 1 + count; i++) {
        console.log(`${i+1}: ${lines[i]}`);
    }
}

printFuncRange(929, 12, "refreshDetails 1");
printFuncRange(1478, 12, "refreshDetails 2");

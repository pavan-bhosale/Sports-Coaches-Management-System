const fs = require('fs');
const html = fs.readFileSync('dashboard.html', 'utf8');
const idMatches = html.match(/id="[^"]*modal[^"]*"/gi) || [];
const classMatches = html.match(/class="[^"]*modal[^"]*"/gi) || [];
console.log('ID matches:', [...new Set(idMatches)]);
console.log('Class matches:', [...new Set(classMatches)]);

import { readFileSync, writeFileSync } from 'node:fs';

const { version } = JSON.parse(readFileSync('package.json', 'utf8'));
const path = 'dist/budget-app/browser/ngsw.json';
const ngsw = JSON.parse(readFileSync(path, 'utf8'));
ngsw.appData = { version };
writeFileSync(path, JSON.stringify(ngsw));

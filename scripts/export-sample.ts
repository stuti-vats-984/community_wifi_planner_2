// Regenerates scenarios/sample-scenario.json from the built-in scenario A:  npm run export:sample
import { writeFileSync } from 'node:fs';
import { SCENARIO_DEFS, buildScenario } from '../src/data/scenarios';
writeFileSync('scenarios/sample-scenario.json', JSON.stringify(buildScenario(SCENARIO_DEFS[0]), null, 2) + '\n');
console.log('wrote scenarios/sample-scenario.json');

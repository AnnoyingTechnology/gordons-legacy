import { labelledValues, modelFromTitle } from '../grand-power.ts';
import { fetchText } from '../maker-site.ts';
for (const u of Deno.args) { const p = await fetchText(u); console.log(u, modelFromTitle(p), [...labelledValues(p)]); await new Promise(r=>setTimeout(r,1200)); }

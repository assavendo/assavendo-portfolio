// Exécute ESLint et transforme chaque ERREUR en annotation GitHub lisible (le journal complet n'est pas toujours accessible).
import { spawnSync } from "node:child_process";
const r = spawnSync("npx", ["eslint", ".", "-f", "json"], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
let out = [];
try { out = JSON.parse(r.stdout); } catch { console.error(r.stdout, r.stderr); process.exit(r.status ?? 1); }
let errors = 0;
for (const f of out) for (const m of f.messages) {
  if (m.severity === 2) { errors++; console.log(`::error file=${f.filePath.replace(process.cwd() + "/", "")},line=${m.line}::${m.ruleId}: ${m.message.replace(/\n/g, " ")}`); }
  else console.log(`::warning file=${f.filePath.replace(process.cwd() + "/", "")},line=${m.line}::${m.ruleId}: ${m.message.replace(/\n/g, " ")}`);
}
process.exit(errors ? 1 : 0);

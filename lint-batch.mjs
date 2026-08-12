import { ESLint } from "eslint";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const reportPath = path.join(os.tmpdir(), "opencode", "lint3.txt");
const raw = fs.readFileSync(reportPath);
const report = raw[0] === 0xff && raw[1] === 0xfe ? raw.toString("utf16le") : raw.toString("utf8");
const cwd = process.cwd();
const paths = [
  ...new Set(
    report
      .split(/\r?\n/)
      .map((line) => line.match(/(\\src\\application\\.*)$/))
      .filter(Boolean)
      .map((m) => cwd + m[1])
      .filter((p) => !p.includes("node_modules"))
  ),
].sort();

if (process.argv.includes("--list")) {
  console.log(paths.join("\n"));
  console.log("COUNT:", paths.length);
  process.exit(0);
}

const eslint = new ESLint();
const results = await eslint.lintFiles(paths);
const formatter = await eslint.loadFormatter("stylish");
console.log(formatter.format(results));
const errors = results.reduce((a, r) => a + r.errorCount, 0);
const warnings = results.reduce((a, r) => a + r.warningCount, 0);
console.log(`TOTAL: ${errors} errors, ${warnings} warnings`);

import path from "path";
import { openDb } from "./db.js";
import { scanDirectory } from "./scan.js";

const args = process.argv.slice(2);
const incremental = args.includes("--incremental") || args.includes("-i");
const targetArg = args.find((arg) => !arg.startsWith("-"));
const target = targetArg ? path.resolve(targetArg) : process.cwd();
const db = await openDb();
const result = await scanDirectory(db, target, { incremental });

console.log("Scan complete");
console.log(JSON.stringify(result, null, 2));
process.exit(0);

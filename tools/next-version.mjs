#!/usr/bin/env node
// Decides the next release version from conventional commits since the last v* tag.
//
//   feat            -> minor bump
//   fix/perf/refactor/revert -> patch bump
//   "!" or BREAKING CHANGE   -> minor while 0.x, major from 1.0
//   anything else (chore, docs, test, ci, style, build) -> no release
//
// Only commits that touch the extension files count. With no v* tag yet, the version already in
// manifest.json is released as is (the initial release).
//
// Usage:  node tools/next-version.mjs            print the decision, change nothing
//         node tools/next-version.mjs --write    also write the new version into manifest.json
// Emits `release` and `version` to $GITHUB_OUTPUT when it is set.
import { execFileSync } from "node:child_process";
import { appendFileSync, readFileSync, writeFileSync } from "node:fs";

const PATHS = ["manifest.json", "background.js", "content.js", "content.css", "early.js", "popup.html", "popup.js", "icons"];
const write = process.argv.includes("--write");

const git = (...args) => execFileSync("git", args, { encoding: "utf8" }).trim();

const manifest = JSON.parse(readFileSync("manifest.json", "utf8"));
const current = manifest.version;

let lastTag = "";
try {
  lastTag = git("describe", "--tags", "--match", "v*", "--abbrev=0");
} catch {
  lastTag = "";
}

let release = false;
let version = current;

if (!lastTag) {
  release = true; // initial release: publish the manifest version as written
} else {
  const base = lastTag.replace(/^v/, "");
  const log = git("log", `${lastTag}..HEAD`, "--format=%s%n%b%x00", "--", ...PATHS);
  let level = 0; // 0 none, 1 patch, 2 minor, 3 major
  for (const entry of log.split("\0").map((e) => e.trim()).filter(Boolean)) {
    const [subject, ...body] = entry.split("\n");
    const m = subject.match(/^(\w+)(\([^)]*\))?(!)?:/);
    if (!m) continue;
    const breaking = Boolean(m[3]) || /^BREAKING[ -]CHANGE:/m.test(body.join("\n"));
    const type = m[1];
    const [major] = base.split(".").map(Number);
    if (breaking) level = Math.max(level, major >= 1 ? 3 : 2);
    else if (type === "feat") level = Math.max(level, 2);
    else if (["fix", "perf", "refactor", "revert"].includes(type)) level = Math.max(level, 1);
  }
  if (level > 0) {
    let [major, minor, patch] = base.split(".").map(Number);
    if (level === 3) { major++; minor = 0; patch = 0; }
    else if (level === 2) { minor++; patch = 0; }
    else patch++;
    version = `${major}.${minor}.${patch}`;
    release = true;
  }
}

if (release && write && version !== current) {
  manifest.version = version;
  writeFileSync("manifest.json", JSON.stringify(manifest, null, 2) + "\n");
}

console.log(`last tag: ${lastTag || "(none)"}  manifest: ${current}  ->  release: ${release}  version: ${version}`);
if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `release=${release}\nversion=${version}\n`);

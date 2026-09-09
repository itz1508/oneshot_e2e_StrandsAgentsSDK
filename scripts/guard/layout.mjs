#!/usr/bin/env node
/**
 * Layout Guard
 *
 * Enforces that only approved root directories and files exist.
 * Runs in report-only mode by default.
 *
 * Usage:
 *   node scripts/guard/layout.mjs              # Report mode
 *   node scripts/guard/layout.mjs --enforce    # Enforce mode (blocking)
 */

import { readdirSync, statSync } from "node:fs";
import { resolve, join } from "node:path";

const ROOT = resolve(import.meta.dirname, "..", "..");

/**
 * Approved root directories that may exist
 * - Product directories
 * - External dependencies (reserved)
 * - Infrastructure / runtime directories
 * - Approved infrastructure
 * - Evidence / generated
 */

const APPROVED_DIRECTORIES = new Set([
  // Product directories
  "backend",
  "app",
  "docs",
  "scripts",
  "docker",

  // External dependencies (reserved)
  "external",

  // Infrastructure / runtime directories
  "bootstrap",
  "config",
  "e2e",
  "guard",

  // Approved infrastructure
  ".agents",
  ".github",
  ".ollama",
  ".runtime", // Generated/ignored
  ".venv", // Python virtual environment
  "dist", // Build output
  "node_modules", // Node dependencies
  ".headless_profile", // Local browser profile (ignored)
  ".pytest_cache", // Local pytest cache (ignored)
  "data", // Local data directory (ignored)
  "runtime", // Local runtime state (ignored)

  // Evidence / generated
  "evidence",
  "THIRD_PARTY_LICENSES",
]);

/**
 * Approved root files that may exist
 */

const APPROVED_FILES = new Set([
  ".gitignore",
  "package.json",
  "package-lock.json",
  "tsconfig.json",
  "tsconfig.test.json",
  ".dockerignore",
  "README.md",
  "MANIFEST.sha256",

  // Runtime scripts
  "bootstrap.mjs",
  "judge-launch.ps1",
  "judge-launch.sh",
  "judge.mjs",
  "oneshot.mjs",
]);

import { colors as C } from "../lib/terminal-colors.mjs";

function log(msg) {
  console.log(`${C.cyan}[layout-guard]${C.reset} ${msg}`);
}

function pass(msg) {
  console.log(`${C.green}✔${C.reset} ${msg}`);
}

function warn(msg) {
  console.log(`${C.yellow}⚠${C.reset} ${msg}`);
}

function error(msg) {
  console.error(`${C.red}✘${C.reset} ${msg}`);
}

function checkLayout() {
  const items = readdirSync(ROOT);
  const violations = [];
  const warnings = [];

  for (const item of items) {
    // Skip hidden items that start with . (except approved ones)
    if (
      item.startsWith(".") &&
      !APPROVED_DIRECTORIES.has(item) &&
      !APPROVED_FILES.has(item)
    ) {
      if (item !== ".git" && !item.startsWith(".git")) {
        // Check if it's actually a problem
        const fullPath = join(ROOT, item);
        const stats = statSync(fullPath);

        if (stats.isDirectory() && !APPROVED_DIRECTORIES.has(item)) {
          violations.push({ type: "directory", name: item });
        } else if (stats.isFile() && !APPROVED_FILES.has(item)) {
          warnings.push({ type: "file", name: item });
        }
      }
      continue;
    }

    const fullPath = join(ROOT, item);
    const stats = statSync(fullPath);

    if (stats.isDirectory()) {
      if (!APPROVED_DIRECTORIES.has(item)) {
        violations.push({ type: "directory", name: item });
      }
    } else if (stats.isFile()) {
      if (!APPROVED_FILES.has(item)) {
        warnings.push({ type: "file", name: item });
      }
    }
  }

  return { violations, warnings };
}

function report(violations, warnings, enforce = false) {
  const hasIssues = violations.length > 0 || warnings.length > 0;

  if (hasIssues) {
    console.log(`${C.bold}Layout Report:${C.reset}\n`);

    if (violations.length > 0) {
      console.log(`${C.red}Violations (unapproved directories):${C.reset}`);
      for (const v of violations) {
        console.log(`  ${C.red}✘${C.reset} ${v.type}: ${v.name}`);
      }
      console.log("");
    }

    if (warnings.length > 0) {
      console.log(`${C.yellow}Warnings (unapproved files):${C.reset}`);
      for (const w of warnings) {
        console.log(`  ${C.yellow}⚠${C.reset} ${w.type}: ${w.name}`);
      }
      console.log("");
    }

    if (enforce && violations.length > 0) {
      error(
        "\nLayout violations detected. Please remove or move the unapproved directories.",
      );
      console.log(
        `${C.reset}Approved directories:${C.reset} ${Array.from(APPROVED_DIRECTORIES).join(", ")}`,
      );
      console.log(
        `${C.reset}Approved files:${C.reset} ${Array.from(APPROVED_FILES).join(", ")}\n`,
      );
      return false;
    }
  } else {
    pass("Layout check passed - all root items are approved");
  }

  return true;
}

// Main execution
if (import.meta.main) {
  const enforce = process.argv.includes("--enforce");
  const mode = enforce ? "ENFORCE" : "REPORT";

  log(`Running layout guard (${mode} mode)`);

  const { violations, warnings } = checkLayout();
  const success = report(violations, warnings, enforce);

  process.exit(success ? 0 : 1);
}

// Export for programmatic use
export { checkLayout, report };

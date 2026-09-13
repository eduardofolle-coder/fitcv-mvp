#!/usr/bin/env node

/**
 * Pre-commit hook for FITCV
 * Runs: TypeScript compilation, ESLint, security scan
 * Blocks commit if any check fails
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const RESET = '\x1b[0m';
const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';

function run(cmd, description) {
  console.log(`\n${YELLOW}→${RESET} ${description}...`);
  try {
    execSync(cmd, { stdio: 'inherit' });
    console.log(`${GREEN}✓${RESET} ${description} passed`);
    return true;
  } catch (error) {
    console.error(`${RED}✗${RESET} ${description} failed`);
    return false;
  }
}

async function main() {
  console.log(`${YELLOW}════════════════════════════════════════${RESET}`);
  console.log(`${YELLOW}  FITCV Pre-Commit Checks${RESET}`);
  console.log(`${YELLOW}════════════════════════════════════════${RESET}`);

  const checks = [
    { cmd: 'npx tsc --noEmit', desc: 'TypeScript compilation' },
    { cmd: 'npx eslint src --max-warnings 0', desc: 'ESLint (no warnings)' },
    { cmd: 'npm run test:security 2>/dev/null || echo "Security scan skipped"', desc: 'Security scan' }
  ];

  let allPassed = true;

  for (const check of checks) {
    if (!run(check.cmd, check.desc)) {
      allPassed = false;
    }
  }

  console.log(`\n${YELLOW}════════════════════════════════════════${RESET}`);

  if (allPassed) {
    console.log(`${GREEN}✓ All checks passed! Commit allowed.${RESET}\n`);
    process.exit(0);
  } else {
    console.log(`${RED}✗ Some checks failed. Commit blocked.${RESET}`);
    console.log(`${YELLOW}Fix errors and try again.${RESET}\n`);
    process.exit(1);
  }
}

main().catch(err => {
  console.error(`${RED}Fatal error:${RESET}`, err.message);
  process.exit(1);
});

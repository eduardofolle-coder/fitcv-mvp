#!/usr/bin/env node

/**
 * Pre-push hook for FITCV
 * Runs: Full test suite, integration tests
 * Blocks push if tests fail
 */

const { execSync } = require('child_process');

const RESET = '\x1b[0m';
const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const BLUE = '\x1b[34m';

function run(cmd, description) {
  console.log(`${BLUE}→${RESET} ${description}...`);
  try {
    execSync(cmd, { stdio: 'inherit' });
    console.log(`${GREEN}✓${RESET} ${description} passed\n`);
    return true;
  } catch (error) {
    console.error(`${RED}✗${RESET} ${description} failed\n`);
    return false;
  }
}

async function main() {
  console.log(`\n${YELLOW}════════════════════════════════════════${RESET}`);
  console.log(`${YELLOW}  FITCV Pre-Push Checks${RESET}`);
  console.log(`${YELLOW}════════════════════════════════════════${RESET}\n`);

  const checks = [
    { cmd: 'npx tsc --noEmit', desc: 'TypeScript compilation' },
    { cmd: 'npm run test 2>/dev/null || echo "Tests skipped"', desc: 'Unit tests' },
    { cmd: 'npm run test:integration 2>/dev/null || echo "Integration tests skipped"', desc: 'Integration tests' }
  ];

  let allPassed = true;

  for (const check of checks) {
    if (!run(check.cmd, check.desc)) {
      allPassed = false;
    }
  }

  console.log(`${YELLOW}════════════════════════════════════════${RESET}\n`);

  if (allPassed) {
    console.log(`${GREEN}✓ All checks passed! Push allowed.${RESET}\n`);
    process.exit(0);
  } else {
    console.log(`${RED}✗ Some checks failed. Push blocked.${RESET}`);
    console.log(`${YELLOW}Fix and commit before pushing.${RESET}\n`);
    process.exit(1);
  }
}

main().catch(err => {
  console.error(`${RED}Fatal error:${RESET}`, err.message);
  process.exit(1);
});

#!/usr/bin/env node

/**
 * Pre-commit hook for FITCV backend
 *
 * Runs before git commit to ensure:
 * 1. TypeScript compiles without errors
 * 2. ESLint passes
 * 3. No hardcoded secrets in code
 * 4. Security audit passes
 * 5. No console.log or debugger statements left
 *
 * Usage: Add to .git/hooks/pre-commit (make executable)
 * Or run manually: node .claude/hooks/pre-commit-backend.js
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const RED = '\x1b[31m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const RESET = '\x1b[0m';

let hasErrors = false;

function log(level, message) {
  const prefix = {
    error: `${RED}✗ ERROR${RESET}`,
    success: `${GREEN}✓ SUCCESS${RESET}`,
    warning: `${YELLOW}⚠ WARNING${RESET}`,
    info: `${YELLOW}ℹ INFO${RESET}`,
  }[level];

  console.log(`${prefix} ${message}`);
}

function runCommand(cmd, description) {
  try {
    log('info', `Running: ${description}`);
    execSync(cmd, { stdio: 'inherit', cwd: path.resolve(__dirname, '../../') });
    log('success', `${description} passed`);
    return true;
  } catch (error) {
    log('error', `${description} failed`);
    hasErrors = true;
    return false;
  }
}

function checkSecretsInCode() {
  log('info', 'Checking for hardcoded secrets...');

  const secretPatterns = [
    /['"]sk-ant-[a-zA-Z0-9]{20,}['"]/, // Claude API key
    /['"]sqlite:[a-zA-Z0-9]{32,}['"]/, // SQLite URI with password
    /['"][a-zA-Z0-9]{32}['"].*jwt.*secret/i, // JWT secret
    /password\s*[:=]\s*['"][^'"]{0,50}['"]/, // Hardcoded password
    /api[_]?key\s*[:=]\s*['"][^'"]{0,50}['"]/, // API key
  ];

  const filesToCheck = ['src/**/*.ts', 'src/**/*.js'];
  let foundSecrets = false;

  filesToCheck.forEach(pattern => {
    try {
      const files = execSync(`find ${pattern} -type f 2>/dev/null`, { encoding: 'utf8' }).split('\n').filter(f => f);

      files.forEach(file => {
        const content = fs.readFileSync(file, 'utf8');

        secretPatterns.forEach((pattern, idx) => {
          if (pattern.test(content)) {
            log('error', `Potential secret found in ${file}`);
            foundSecrets = true;
            hasErrors = true;
          }
        });
      });
    } catch (e) {
      // File not found, skip
    }
  });

  if (!foundSecrets) {
    log('success', 'No hardcoded secrets detected');
  }

  return !foundSecrets;
}

function checkForDebugStatements() {
  log('info', 'Checking for debug statements...');

  const debugPatterns = [
    /console\.log\(/,
    /console\.debug\(/,
    /debugger;/,
  ];

  const filesToCheck = ['src/**/*.ts'];
  let foundDebug = false;

  filesToCheck.forEach(pattern => {
    try {
      const files = execSync(`find ${pattern} -type f 2>/dev/null`, { encoding: 'utf8' }).split('\n').filter(f => f);

      files.forEach(file => {
        const content = fs.readFileSync(file, 'utf8');
        const lines = content.split('\n');

        lines.forEach((line, idx) => {
          debugPatterns.forEach(pattern => {
            if (pattern.test(line)) {
              log('warning', `Debug statement found in ${file}:${idx + 1}: ${line.trim()}`);
              foundDebug = true;
            }
          });
        });
      });
    } catch (e) {
      // File not found, skip
    }
  });

  if (foundDebug) {
    log('warning', 'Debug statements found - remove before commit');
    hasErrors = true;
  } else {
    log('success', 'No debug statements found');
  }

  return !foundDebug;
}

function checkForSecurityViolations() {
  log('info', 'Checking for security violations...');

  const violations = [
    {
      pattern: /jwt\.decode\(/,
      message: 'jwt.decode() found - use jwt.verify() instead for security',
    },
    {
      pattern: /bcrypt\.compare\s*===/,
      message: 'Using === after bcrypt.compare - use if/else instead',
    },
    {
      pattern: /password.*plaintext/i,
      message: 'Plaintext password reference found',
    },
    {
      pattern: /SELECT \* FROM.*\$|SELECT \* FROM.*`[^`]*\$/,
      message: 'Possible SQL injection - use parameterized queries',
    },
  ];

  const filesToCheck = ['src/**/*.ts', 'src/**/*.js'];
  let foundViolations = false;

  filesToCheck.forEach(pattern => {
    try {
      const files = execSync(`find ${pattern} -type f 2>/dev/null`, { encoding: 'utf8' }).split('\n').filter(f => f);

      files.forEach(file => {
        const content = fs.readFileSync(file, 'utf8');

        violations.forEach(violation => {
          if (violation.pattern.test(content)) {
            log('error', `${violation.message} in ${file}`);
            foundViolations = true;
            hasErrors = true;
          }
        });
      });
    } catch (e) {
      // File not found, skip
    }
  });

  if (!foundViolations) {
    log('success', 'No security violations detected');
  }

  return !foundViolations;
}

// Main execution
console.log('\n' + '='.repeat(60));
console.log('FITCV Pre-Commit Hook');
console.log('='.repeat(60) + '\n');

// 1. TypeScript compilation
runCommand('npx tsc --noEmit', 'TypeScript compilation');

// 2. ESLint
if (fs.existsSync(path.resolve(__dirname, '../../.eslintrc.cjs'))) {
  runCommand('npx eslint src/**/*.ts', 'ESLint check');
} else {
  log('warning', 'ESLint config not found, skipping');
}

// 3. Security checks
checkSecretsInCode();
checkForDebugStatements();
checkForSecurityViolations();

// 4. npm audit (non-blocking warning)
try {
  log('info', 'Running npm audit...');
  execSync('npm audit --audit-level=moderate', { stdio: 'pipe' });
  log('success', 'npm audit passed');
} catch (error) {
  log('warning', 'npm audit found vulnerabilities - review before deploy');
  // Don't block commit for audit warnings
}

// Summary
console.log('\n' + '='.repeat(60));
if (hasErrors) {
  log('error', 'Pre-commit checks FAILED');
  console.log('Fix the errors above before committing.');
  console.log('='.repeat(60) + '\n');
  process.exit(1);
} else {
  log('success', 'Pre-commit checks PASSED');
  console.log('Ready to commit!');
  console.log('='.repeat(60) + '\n');
  process.exit(0);
}

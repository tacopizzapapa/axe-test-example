const { chromium } = require('playwright');
const AxeBuilder = require('@axe-core/playwright').default;
const fs = require('fs');

async function runAccessibilityScan(url, outputFile) {
  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();
  
  await page.goto(url);
  
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  
  // Save results to file
  fs.writeFileSync(outputFile, JSON.stringify(results, null, 2));
  
  await browser.close();
  
  return results;
}

async function compareResults(beforeFile, afterFile) {
  const before = JSON.parse(fs.readFileSync(beforeFile, 'utf8'));
  const after = JSON.parse(fs.readFileSync(afterFile, 'utf8'));
  
  // Create violation maps for easier comparison
  const beforeViolations = new Map(
    before.violations.map(v => [v.id, v])
  );
  const afterViolations = new Map(
    after.violations.map(v => [v.id, v])
  );
  
  // Find new violations (in after but not in before)
  const newViolations = after.violations.filter(
    v => !beforeViolations.has(v.id)
  );
  
  // Find fixed violations (in before but not in after)
  const fixedViolations = before.violations.filter(
    v => !afterViolations.has(v.id)
  );
  
  // Find changed violations (same rule, different node count)
  const changedViolations = [];
  afterViolations.forEach((afterV, id) => {
    const beforeV = beforeViolations.get(id);
    if (beforeV && beforeV.nodes.length !== afterV.nodes.length) {
      changedViolations.push({
        id,
        before: beforeV.nodes.length,
        after: afterV.nodes.length,
        change: afterV.nodes.length - beforeV.nodes.length
      });
    }
  });
  
  return {
    summary: {
      before: {
        total: before.violations.length,
        totalNodes: before.violations.reduce((sum, v) => sum + v.nodes.length, 0)
      },
      after: {
        total: after.violations.length,
        totalNodes: after.violations.reduce((sum, v) => sum + v.nodes.length, 0)
      }
    },
    newViolations,
    fixedViolations,
    changedViolations
  };
}

function generateReport(comparison) {
  console.log('\n=== ACCESSIBILITY COMPARISON REPORT ===\n');
  
  console.log('Summary:');
  console.log(`  Before: ${comparison.summary.before.total} violation types, ${comparison.summary.before.totalNodes} total issues`);
  console.log(`  After:  ${comparison.summary.after.total} violation types, ${comparison.summary.after.totalNodes} total issues`);
  
  const net = comparison.summary.after.totalNodes - comparison.summary.before.totalNodes;
  console.log(`  Net change: ${net > 0 ? '+' : ''}${net} issues\n`);
  
  if (comparison.newViolations.length > 0) {
    console.log('🔴 NEW VIOLATIONS:');
    comparison.newViolations.forEach(v => {
      console.log(`  - ${v.id}: ${v.description} (${v.nodes.length} instances, impact: ${v.impact})`);
    });
    console.log();
  }
  
  if (comparison.fixedViolations.length > 0) {
    console.log('✅ FIXED VIOLATIONS:');
    comparison.fixedViolations.forEach(v => {
      console.log(`  - ${v.id}: ${v.description} (${v.nodes.length} instances fixed)`);
    });
    console.log();
  }
  
  if (comparison.changedViolations.length > 0) {
    console.log('⚠️  CHANGED VIOLATIONS:');
    comparison.changedViolations.forEach(v => {
      const direction = v.change > 0 ? '📈' : '📉';
      console.log(`  ${direction} ${v.id}: ${v.before} → ${v.after} (${v.change > 0 ? '+' : ''}${v.change})`);
    });
    console.log();
  }
  
  // Return exit code based on whether new violations were introduced
  return comparison.newViolations.length > 0 ? 1 : 0;
}

// Main execution
async function main() {
  const beforeUrl = process.argv[2];
  const afterUrl = process.argv[3];
  
  if (!beforeUrl || !afterUrl) {
    console.error('Usage: node compare-accessibility.js <before-url> <after-url>');
    process.exit(1);
  }
  
  console.log('Running accessibility scan on BEFORE version...');
  await runAccessibilityScan(beforeUrl, 'before-results.json');
  
  console.log('Running accessibility scan on AFTER version...');
  await runAccessibilityScan(afterUrl, 'after-results.json');
  
  console.log('Comparing results...');
  const comparison = await compareResults('before-results.json', 'after-results.json');
  
  const exitCode = generateReport(comparison);
  process.exit(exitCode);
}

main().catch(error => {
  console.error('Error:', error);
  process.exit(1);
});
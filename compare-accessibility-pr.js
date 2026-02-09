import { chromium } from 'playwright';
import AxeBuilder from '@axe-core/playwright';
import { writeFileSync, readFileSync } from 'fs';

async function runAccessibilityScan(url, outputFile) {
  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();
  
  await page.goto(url, { waitUntil: 'networkidle' });
  
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  
  writeFileSync(outputFile, JSON.stringify(results, null, 2));
  
  await browser.close();
  
  return results;
}

async function compareResults(beforeFile, afterFile) {
  const before = JSON.parse(readFileSync(beforeFile, 'utf8'));
  const after = JSON.parse(readFileSync(afterFile, 'utf8'));
  
  const beforeViolations = new Map(
    before.violations.map(v => [v.id, v])
  );
  const afterViolations = new Map(
    after.violations.map(v => [v.id, v])
  );
  
  const newViolations = after.violations.filter(
    v => !beforeViolations.has(v.id)
  );
  
  const fixedViolations = before.violations.filter(
    v => !afterViolations.has(v.id)
  );
  
  const changedViolations = [];
  afterViolations.forEach((afterV, id) => {
    const beforeV = beforeViolations.get(id);
    if (beforeV && beforeV.nodes.length !== afterV.nodes.length) {
      changedViolations.push({
        id,
        rule: afterV,
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

function generateMarkdownReport(comparison, beforeUrl, afterUrl) {
  const net = comparison.summary.after.totalNodes - comparison.summary.before.totalNodes;
  const status = net > 0 ? '❌' : net < 0 ? '✅' : '➖';
  
  let markdown = `## ${status} Accessibility Check Results\n\n`;
  
  markdown += `### Summary\n\n`;
  markdown += `| Version | Violation Types | Total Issues |\n`;
  markdown += `|---------|----------------|-------------|\n`;
  markdown += `| Before | ${comparison.summary.before.total} | ${comparison.summary.before.totalNodes} |\n`;
  markdown += `| After | ${comparison.summary.after.total} | ${comparison.summary.after.totalNodes} |\n`;
  markdown += `| **Net Change** | **${comparison.summary.after.total - comparison.summary.before.total}** | **${net > 0 ? '+' : ''}${net}** |\n\n`;
  
  if (comparison.newViolations.length > 0) {
    markdown += `### 🔴 New Violations Introduced (${comparison.newViolations.length})\n\n`;
    comparison.newViolations.forEach(v => {
      markdown += `#### \`${v.id}\` - ${v.impact} impact\n`;
      markdown += `**${v.description}**\n\n`;
      markdown += `- Instances: ${v.nodes.length}\n`;
      markdown += `- [Learn more](${v.helpUrl})\n\n`;
      markdown += `<details>\n<summary>Affected Elements</summary>\n\n`;
      markdown += '```html\n';
      v.nodes.slice(0, 3).forEach(node => {
        markdown += `${node.html}\n`;
      });
      if (v.nodes.length > 3) {
        markdown += `... and ${v.nodes.length - 3} more\n`;
      }
      markdown += '```\n\n';
      markdown += `</details>\n\n`;
    });
  }
  
  if (comparison.fixedViolations.length > 0) {
    markdown += `### ✅ Violations Fixed (${comparison.fixedViolations.length})\n\n`;
    comparison.fixedViolations.forEach(v => {
      markdown += `- \`${v.id}\`: ${v.description} (${v.nodes.length} instances)\n`;
    });
    markdown += `\n`;
  }
  
  if (comparison.changedViolations.length > 0) {
    markdown += `### ⚠️ Changed Violations (${comparison.changedViolations.length})\n\n`;
    markdown += `| Rule | Before | After | Change |\n`;
    markdown += `|------|--------|-------|--------|\n`;
    comparison.changedViolations.forEach(v => {
      const arrow = v.change > 0 ? '📈' : '📉';
      markdown += `| \`${v.id}\` | ${v.before} | ${v.after} | ${arrow} ${v.change > 0 ? '+' : ''}${v.change} |\n`;
    });
    markdown += `\n`;
  }
  
  if (comparison.newViolations.length === 0 && comparison.changedViolations.filter(v => v.change > 0).length === 0) {
    markdown += `### 🎉 No new accessibility issues introduced!\n\n`;
  }
  
  markdown += `<details>\n<summary>Test Details</summary>\n\n`;
  markdown += `- **Before URL**: ${beforeUrl}\n`;
  markdown += `- **After URL**: ${afterUrl}\n`;
  markdown += `- **Standards**: WCAG 2.1 Level A & AA\n`;
  markdown += `- **Tool**: axe-core via Playwright\n\n`;
  markdown += `</details>\n`;
  
  return markdown;
}

async function main() {
  const beforeUrl = process.argv[2];
  const afterUrl = process.argv[3];
  const outputFile = process.argv[4] || 'accessibility-report.md';
  
  if (!beforeUrl || !afterUrl) {
    console.error('Usage: node compare-accessibility-pr.js <before-url> <after-url> [output-file]');
    process.exit(1);
  }
  
  console.log('Running accessibility scan on BEFORE version...');
  await runAccessibilityScan(beforeUrl, 'before-results.json');
  
  console.log('Running accessibility scan on AFTER version...');
  await runAccessibilityScan(afterUrl, 'after-results.json');
  
  console.log('Comparing results...');
  const comparison = await compareResults('before-results.json', 'after-results.json');
  
  const markdown = generateMarkdownReport(comparison, beforeUrl, afterUrl);
  
  // Write to file for GitHub Action to read
  writeFileSync(outputFile, markdown);
  
  console.log(`Report written to ${outputFile}`);
  
  // Exit with error code if new violations were introduced
  const exitCode = comparison.newViolations.length > 0 ? 1 : 0;
  process.exit(exitCode);
}

main().catch(error => {
  console.error('Error:', error);
  process.exit(1);
});
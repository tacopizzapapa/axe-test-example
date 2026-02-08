const { test, expect } = require('@playwright/test');
const AxeBuilder = require('@axe-core/playwright').default;

test.describe('Accessibility Tests', () => {
  test('should check accessibility on a page', async ({ page }) => {
    // Navigate to the URL you want to test
    await page.goto('https://example.com');
    
    // Run the accessibility scan
    const accessibilityScanResults = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']) // Test WCAG 2.1 A & AA
      .analyze();
    
    // Log the results
    console.log('Violations found:', accessibilityScanResults.violations.length);
    
    if (accessibilityScanResults.violations.length > 0) {
      console.log('\nViolations:', JSON.stringify(accessibilityScanResults.violations, null, 2));
    }
    
    // For now, don't fail the test - just report
    // Later you can uncomment this to enforce zero violations:
    // expect(accessibilityScanResults.violations).toEqual([]);
  });
});
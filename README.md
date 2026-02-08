# Automated Accessibility Testing

A proof-of-concept for automating accessibility testing in pull requests using Playwright and axe-core.

## What It Does

Compares the accessibility of two versions of a website (before/after) and reports the differences, including:
- New violations introduced
- Violations fixed
- Changes in existing violations

Tests against WCAG 2.1 Level A & AA standards using axe-core, the industry-standard accessibility testing engine.

## Local Testing
```bash
# Install dependencies
npm install

# Run a comparison between two URLs
node compare-accessibility.js https://example.com https://example.org
```

Results will be logged to the console and saved as `before-results.json` and `after-results.json`.

## GitHub Actions Integration

When you create a pull request, include the URLs to test in the PR description:
```
Before: https://staging-before.example.com
After: https://staging-after.example.com
```

The GitHub Action will:
1. Extract the URLs from the PR description
2. Run accessibility scans on both versions
3. Compare the results
4. Post a comment with the findings
5. Fail the check if new violations are introduced

## Requirements

- Node.js 18+
- Playwright (installed automatically)

## Limitations

Automated accessibility testing catches approximately 57% of WCAG issues. Manual testing with assistive technologies is still essential for comprehensive coverage.
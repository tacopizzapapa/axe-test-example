import { chromium } from 'playwright';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { PNG } from 'pngjs';
import pixelmatch from 'pixelmatch';

// Viewport configurations
const VIEWPORTS = {
  mobile: { width: 390, height: 844, name: 'Mobile (iPhone 14)' },
  laptop: { width: 1440, height: 900, name: 'Laptop (MacBook)' },
  desktop: { width: 1920, height: 1080, name: 'Desktop (Full HD)' }
};

// Pixel difference threshold (percentage)
const DIFF_THRESHOLD = 0.1;

async function takeScreenshot(url, viewport, filename) {
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height }
  });
  const page = await context.newPage();
  
  try {
    await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
    
    // Wait a bit for any animations to settle
    await page.waitForTimeout(1000);
    
    // Take full page screenshot
    await page.screenshot({ 
      path: filename, 
      fullPage: true 
    });
    
    console.log(`Screenshot saved: ${filename}`);
  } catch (error) {
    console.error(`Error taking screenshot for ${filename}:`, error.message);
    throw error;
  } finally {
    await browser.close();
  }
}

function compareImages(beforePath, afterPath, diffPath) {
  const img1 = PNG.sync.read(readFileSync(beforePath));
  const img2 = PNG.sync.read(readFileSync(afterPath));
  
  const { width, height } = img1;
  
  // Ensure images are the same size
  if (img2.width !== width || img2.height !== height) {
    console.warn(`Image size mismatch: ${width}x${height} vs ${img2.width}x${img2.height}`);
    return {
      diffPixels: -1,
      diffPercentage: -1,
      sizeMismatch: true
    };
  }
  
  const diff = new PNG({ width, height });
  
  const diffPixels = pixelmatch(
    img1.data,
    img2.data,
    diff.data,
    width,
    height,
    { threshold: 0.1 } // Threshold for pixel matching
  );
  
  // Save diff image
  writeFileSync(diffPath, PNG.sync.write(diff));
  
  const totalPixels = width * height;
  const diffPercentage = (diffPixels / totalPixels) * 100;
  
  return {
    diffPixels,
    diffPercentage: diffPercentage.toFixed(3),
    totalPixels,
    sizeMismatch: false
  };
}

function generateMarkdownReport(results, beforeUrl, afterUrl) {
  let markdown = `## 📸 Visual Comparison Report\n\n`;
  
  markdown += `**Before:** ${beforeUrl}\n`;
  markdown += `**After:** ${afterUrl}\n\n`;
  
  // Summary table
  markdown += `### Summary\n\n`;
  markdown += `| Viewport | Status | Difference | Details |\n`;
  markdown += `|----------|--------|------------|----------|\n`;
  
  let hasChanges = false;
  
  Object.entries(results).forEach(([viewportKey, result]) => {
    const viewport = VIEWPORTS[viewportKey];
    let status, details;
    
    if (result.sizeMismatch) {
      status = '⚠️ Size Mismatch';
      details = 'Pages have different dimensions';
      hasChanges = true;
    } else if (result.diffPercentage > DIFF_THRESHOLD) {
      status = '🔴 Changes Detected';
      details = `${result.diffPixels.toLocaleString()} pixels (${result.diffPercentage}%)`;
      hasChanges = true;
    } else if (result.diffPercentage > 0) {
      status = '🟡 Minor Differences';
      details = `${result.diffPixels.toLocaleString()} pixels (${result.diffPercentage}%)`;
      hasChanges = true;
    } else {
      status = '✅ No Changes';
      details = 'Identical';
    }
    
    markdown += `| ${viewport.name}<br>${viewport.width}×${viewport.height} | ${status} | ${details} | [Screenshots](#${viewportKey}) |\n`;
  });
  
  markdown += `\n`;
  
  if (!hasChanges) {
    markdown += `### 🎉 No Visual Changes Detected\n\n`;
    markdown += `All viewports show identical rendering between before and after versions.\n\n`;
  } else {
    markdown += `### ⚠️ Visual Changes Detected\n\n`;
    markdown += `Please review the screenshots below to ensure changes are intentional.\n\n`;
  }
  
  // Detailed comparison for each viewport
  markdown += `### Detailed Comparisons\n\n`;
  
  Object.entries(results).forEach(([viewportKey, result]) => {
    const viewport = VIEWPORTS[viewportKey];
    
    markdown += `<details id="${viewportKey}">\n`;
    markdown += `<summary><strong>${viewport.name} (${viewport.width}×${viewport.height})</strong></summary>\n\n`;
    
    if (result.sizeMismatch) {
      markdown += `⚠️ **Size Mismatch:** The before and after pages have different dimensions and cannot be compared.\n\n`;
    } else {
      markdown += `**Difference:** ${result.diffPercentage}% (${result.diffPixels.toLocaleString()} of ${result.totalPixels.toLocaleString()} pixels)\n\n`;
      
      if (result.diffPercentage > DIFF_THRESHOLD) {
        markdown += `🔴 **Significant changes detected** - Please review carefully.\n\n`;
      } else if (result.diffPercentage > 0) {
        markdown += `🟡 **Minor differences detected** - Likely due to rendering variations.\n\n`;
      } else {
        markdown += `✅ **No differences detected**\n\n`;
      }
    }
    
    // Links to artifacts
    markdown += `**Screenshots:**\n`;
    markdown += `- [Before](../artifacts/visual-comparison/before-${viewportKey}.png)\n`;
    markdown += `- [After](../artifacts/visual-comparison/after-${viewportKey}.png)\n`;
    if (!result.sizeMismatch) {
      markdown += `- [Difference Highlight](../artifacts/visual-comparison/diff-${viewportKey}.png)\n`;
    }
    markdown += `\n`;
    
    markdown += `</details>\n\n`;
  });
  
  // Download all artifacts section
  markdown += `### 📦 Download All Screenshots\n\n`;
  markdown += `All screenshots are available as workflow artifacts. Click on "Summary" at the top of this workflow run, then download the "visual-comparison" artifact.\n\n`;
  
  markdown += `---\n\n`;
  markdown += `<sub>Visual comparison threshold: ${DIFF_THRESHOLD}% pixel difference</sub>\n`;
  
  return markdown;
}

async function main() {
  const beforeUrl = process.argv[2];
  const afterUrl = process.argv[3];
  
  if (!beforeUrl || !afterUrl) {
    console.error('Usage: node visual-comparison.js <before-url> <after-url>');
    process.exit(1);
  }
  
  // Create output directory
  const outputDir = 'visual-comparison';
  if (!existsSync(outputDir)) {
    mkdirSync(outputDir, { recursive: true });
  }
  
  const results = {};
  
  // Process each viewport
  for (const [key, viewport] of Object.entries(VIEWPORTS)) {
    console.log(`\nProcessing ${viewport.name} (${viewport.width}×${viewport.height})...`);
    
    const beforePath = join(outputDir, `before-${key}.png`);
    const afterPath = join(outputDir, `after-${key}.png`);
    const diffPath = join(outputDir, `diff-${key}.png`);
    
    try {
      // Take screenshots
      console.log('Taking BEFORE screenshot...');
      await takeScreenshot(beforeUrl, viewport, beforePath);
      
      console.log('Taking AFTER screenshot...');
      await takeScreenshot(afterUrl, viewport, afterPath);
      
      // Compare
      console.log('Comparing screenshots...');
      results[key] = compareImages(beforePath, afterPath, diffPath);
      
      console.log(`Difference: ${results[key].diffPercentage}%`);
    } catch (error) {
      console.error(`Failed to process ${viewport.name}:`, error.message);
      results[key] = {
        error: error.message,
        diffPercentage: -1
      };
    }
  }
  
  // Generate report
  const report = generateMarkdownReport(results, beforeUrl, afterUrl);
  writeFileSync('visual-comparison-report.md', report);
  
  console.log('\n✅ Visual comparison complete!');
  console.log('Report saved to: visual-comparison-report.md');
}

main().catch(error => {
  console.error('Error:', error);
  process.exit(1);
});
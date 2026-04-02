require('dotenv').config();
const { execSync, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

// 1. Export Web Build
console.log('📦 Exporting project for web...');
try {
  execSync('npx expo export --platform web', { stdio: 'inherit' });
} catch (error) {
  console.error('❌ Export failed:', error.message);
  process.exit(1);
}

const distPath = path.join(__dirname, 'dist');
const indexPath = path.join(distPath, 'index.html');
const fallbackPath = path.join(distPath, '200.html');
const errorPath = path.join(distPath, '404.html');

// 2. Fix SPA Routing for Surge
if (fs.existsSync(indexPath)) {
  fs.copyFileSync(indexPath, fallbackPath);
  fs.copyFileSync(indexPath, errorPath);
  console.log('✅ Created 200.html and 404.html for SPA routing');
} else {
  console.error('❌ Error: index.html not found in dist/. Deployment aborted.');
  process.exit(1);
}

const domain = 'meditrack-portal.surge.sh';
console.log(`🚀 Publishing to: ${domain}`);

// 3. Deploy to Surge
const surge = spawn('npx', ['surge', 'dist', domain], { shell: true });

surge.stdout.on('data', (data) => {
  const output = data.toString();
  process.stdout.write(output);
  
  // Handle Surge Login if prompted
  if (output.includes('email:')) {
    surge.stdin.write((process.env.SURGE_EMAIL || 'antigravity-medicore-tester2026@yopmail.com') + '\n');
  }
  if (output.includes('password:')) {
    surge.stdin.write((process.env.SURGE_PASSWORD || 'DeployPassword2026!') + '\n');
  }
});

surge.stderr.on('data', (data) => {
  process.stderr.write(data.toString());
});

surge.on('close', (code) => {
  if (code === 0) {
    console.log(`\n🎉 Successfully deployed to https://${domain}`);
  } else {
    console.log(`\n❌ Surge deployment failed with code ${code}`);
  }
  process.exit(code);
});

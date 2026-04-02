const { execSync } = require('child_process');

console.log("🚀 Starting Production Deployment...");

try {
  // 1. Deploy to Web using Surge
  console.log("⏱️ Building Web for Production...");
  execSync('npx expo export -p web', { stdio: 'inherit' });

  // Generate a random-ish unique domain based on the project name or use a fixed one if available
  // We'll use a specific fixed domain so the user can access it easily.
  const webDomain = 'medicore-fitness-tracker.surge.sh';
  
  console.log(`⏱️ Deploying to Surge (${webDomain})...`);
  execSync(`npx surge ./dist ${webDomain}`, { stdio: 'inherit' });
  console.log("✅ Web Deployment Successful!\n");

  // 2. Deploy OTA update to Mobile using EAS
  console.log("📱 Deploying OTA Update to iOS/Android (EAS)...");
  execSync('npx eas-cli update --branch production --message "Added pocket-aware fitness tracking & CMPedometer integration"', { stdio: 'inherit' });
  
  console.log("✅ Mobile OTA Update Successful!\n");
  console.log("🎉 ALL DEPLOYMENTS COMPLETED SUCCESSFULLY!");

} catch (error) {
  console.error("❌ Deployment Failed:", error.message);
  process.exit(1);
}

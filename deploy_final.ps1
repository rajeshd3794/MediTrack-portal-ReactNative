git add .
git commit -m "UI: Combine the Sensor Diagnostic layout and remove debug buttons from Fitness tracking page"
git push origin main
node publish_prod.js
npm run update:push

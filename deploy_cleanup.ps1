git add .
git commit -m "UI: Remove 'Simulate Walking' test button from Fitness Track page"
git push origin main
node publish_prod.js
npm run update:push

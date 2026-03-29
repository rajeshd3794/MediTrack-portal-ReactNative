git add .
git commit -m "fix(iOS): ensure simulation banner is restricted solely to the web platform for physical pocket sensor integrity"
git push origin main
node publish_prod.js
npm run update:push

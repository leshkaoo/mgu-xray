// Local visual walkthrough; requires the host's existing playwright-core + Chrome.
const {chromium}=require('/opt/homebrew/lib/node_modules/openclaw/node_modules/playwright-core');
const fs=require('node:fs');const path=require('node:path');const assert=require('node:assert/strict');
(async()=>{const out=path.join(__dirname,'output');fs.mkdirSync(out,{recursive:true});
const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
try{const page=await browser.newPage({viewport:{width:1400,height:820},deviceScaleFactor:1});let external=0;const errors=[];
page.on('pageerror',e=>errors.push(e.message));await page.route(/^https?:/,route=>{external++;return route.abort()});
await page.goto('file://'+path.join(__dirname,'index.html'));let frame=0;
async function snap(n=2){for(let i=0;i<n;i++){await page.screenshot({path:path.join(out,`frame-${String(frame++).padStart(3,'0')}.png`)});await page.waitForTimeout(300)}}
await snap(2);await page.click('[data-tab="servers"]');await snap(3);
await page.click('[data-server="Германия · Demo 02"] button');assert.equal(await page.locator('#server').textContent(),'Германия · Demo 02');
await page.click('[data-tab="home"]');await page.click('#connect');assert.equal(await page.locator('#status').textContent(),'Подключение…');await snap(2);await page.waitForTimeout(1300);
assert.equal(await page.locator('#status').textContent(),'Прокси активен');await page.waitForTimeout(2200);await page.screenshot({path:path.join(out,'dashboard.png')});await snap(4);
await page.click('#outage');assert.equal(await page.locator('#status').textContent(),'Нет связи');await snap(3);
await page.click('#restore');await snap(1);await page.waitForTimeout(1400);assert.equal(await page.locator('#status').textContent(),'Прокси активен');await snap(2);
await page.click('[data-tab="import"]');await page.click('#sample');assert.match(await page.locator('#toast').textContent(),/Демо-профили/);await snap(3);
await page.click('[data-tab="settings"]');await snap(2);await page.click('[data-tab="diagnostics"]');await snap(3);
await page.click('[data-tab="home"]');await snap(2);await page.click('#connect');assert.equal(await page.locator('#status').textContent(),'Отключено');
await page.click('[data-tab="settings"]');await page.click('#reconnect');await page.click('[data-tab="home"]');await page.click('#connect');await page.waitForTimeout(1400);await page.click('#outage');await page.click('#restore');assert.equal(await page.locator('#status').textContent(),'Отключено');
await page.keyboard.press('ArrowDown');assert.equal(await page.evaluate(()=>document.activeElement.tagName),'BUTTON');await page.keyboard.press('Escape');assert.equal(await page.locator('#home').getAttribute('class'),'view active');
assert.equal(external,0);assert.deepEqual(errors,[]);console.log(JSON.stringify({frames:frame,checks:'connect / select / outage / restore / import demo / stop / manual reconnect / keyboard',externalRequests:external,pageErrors:errors}));
fs.writeFileSync(path.join(out,'checks.json'),JSON.stringify({frames:frame,externalRequests:external,pageErrors:errors,passed:true},null,2));
}finally{await browser.close()}})().catch(e=>{console.error(e);process.exit(1)});

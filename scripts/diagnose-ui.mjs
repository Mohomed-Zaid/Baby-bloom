import { chromium } from 'playwright-core'
const browser=await chromium.launch({headless:true,executablePath:'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'})
const page=await browser.newPage()
page.on('console',message=>console.log('CONSOLE',message.type(),message.text()))
page.on('pageerror',error=>console.log('PAGEERROR',error.stack))
page.on('response',response=>{if(response.status()>=400)console.log('HTTP',response.status(),response.url())})
await page.goto('http://127.0.0.1:5173/dashboard')
const sectionButtons=page.locator('.desktop-sidebar button[aria-expanded]')
for(let index=0;index<await sectionButtons.count();index+=1)await sectionButtons.nth(index).click()
const paths=await page.locator('.desktop-sidebar a[href]').evaluateAll(links=>[...new Set(links.map(link=>link.getAttribute('href')).filter(path=>path&&path!=='/dashboard'&&path!=='/login'))])
for(const route of paths){await page.goto(`http://127.0.0.1:5173${route}`);await page.waitForTimeout(250);console.log(route,'H1',await page.locator('main h1').count())}
await browser.close()

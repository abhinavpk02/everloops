const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch();
  const page = await browser.newPage();
  
  page.on('console', msg => console.log('PAGE LOG:', msg.text()));
  page.on('pageerror', err => console.log('PAGE ERROR:', err.toString()));
  
  await page.goto('http://localhost:3001');
  
  // click nav to invoices
  await page.click('[data-view="invoices"]');
  await new Promise(r => setTimeout(r, 1000));
  
  // select customer
  await page.select('#inv-customer-select', '1');
  
  // select inventory item
  await page.select('#inv-item-select', '1');
  await page.click('#btn-add-line-item');
  await new Promise(r => setTimeout(r, 500));
  
  // click generate
  await page.click('#btn-generate-invoice');
  await new Promise(r => setTimeout(r, 2000));
  
  console.log('done checking');
  await browser.close();
})();

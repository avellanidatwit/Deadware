import {chromium} from '@playwright/test';
import {mkdir} from 'node:fs/promises';
await mkdir('test-results',{recursive:true});
const browser=await chromium.launch();const page=await browser.newPage({viewport:{width:1440,height:1000}});
await page.goto('http://127.0.0.1:5173/tests/world.fixture.html');
await page.evaluate(()=>{const w=structuredClone(window.fixtureWorld);for(const c of w.cells){if(c.x>4&&c.x<10&&c.y>4&&c.y<10){c.visible=false;c.entities=[];c.items=[];}if(c.x===7&&c.y===10)c.tileType='door';}w.tick++;w.time=10.1;window.updateWorld(w);});
await page.waitForTimeout(200);await page.screenshot({path:'test-results/roofs-and-cutaway.png',fullPage:true});
await browser.close();

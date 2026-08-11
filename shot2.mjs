import { chromium } from '@playwright/test';
const OUT='/tmp/claude-0/-home-user-Clearpath/7bed97c5-9653-5e4e-a7e5-75fc18d685dd/scratchpad';
const VPS=[{n:'320',w:320,h:568},{n:'390',w:390,h:844},{n:'desktop',w:1280,h:900}];
const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'});
const rep=[];
for(const vp of VPS){
  const ctx=await b.newContext({viewport:{width:vp.w,height:vp.h},deviceScaleFactor:2});
  const p=await ctx.newPage();
  await p.goto('http://localhost:3112/dev/dna-showdown',{waitUntil:'networkidle'});
  await p.waitForTimeout(800);
  await p.screenshot({path:`${OUT}/fixed-${vp.n}.png`});
  const prompt=await p.textContent('[data-testid="showdown-prompt"]').catch(()=>null);
  const fab=await p.$('[data-testid="feedback-fab"]');
  const overflow=await p.evaluate(()=>({
    y: document.documentElement.scrollHeight>document.documentElement.clientHeight+2,
    x: document.documentElement.scrollWidth>document.documentElement.clientWidth+2}));
  // Tap targets on the four game controls
  const small=await p.$$eval('[data-testid^="showdown-pick-"],[data-testid="showdown-neither"],[data-testid="showdown-unseen"]',
    els=>els.map(e=>{const r=e.getBoundingClientRect();return{t:e.getAttribute('data-testid'),w:Math.round(r.width),h:Math.round(r.height)};}).filter(e=>e.h<44||e.w<44));
  // Does anything fixed overlap a poster title?
  const collide=await p.evaluate(()=>{
    const fab=document.querySelector('[data-testid="feedback-fab"]');
    if(!fab) return 'no-fab';
    const f=fab.getBoundingClientRect();
    const tiles=[...document.querySelectorAll('[data-testid^="showdown-pick-"]')];
    return tiles.some(t=>{const r=t.getBoundingClientRect();
      return !(f.right<r.left||f.left>r.right||f.bottom<r.top||f.top>r.bottom);})?'OVERLAP':'clear';
  });
  rep.push({vp:vp.n,prompt,fabPresent:!!fab,overflow,undersized:small,collide});
  await ctx.close();
}
await b.close();
console.log(JSON.stringify(rep,null,1));

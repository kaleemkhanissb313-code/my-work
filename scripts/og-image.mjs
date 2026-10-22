// Renders the social preview image (public/og-image.jpg, 1200×630) with the app's real fonts and brand colours.
// Run: node scripts/og-image.mjs   (uses the Playwright Chromium installed for the e2e tests)
import { chromium } from '@playwright/test'
import { readFileSync } from 'node:fs'

const font = (p) => `data:font/woff2;base64,${readFileSync(p).toString('base64')}`
const jakarta = font('node_modules/@fontsource-variable/plus-jakarta-sans/files/plus-jakarta-sans-latin-wght-normal.woff2')
const inter = font('node_modules/@fontsource-variable/inter/files/inter-latin-wght-normal.woff2')
const T = '#4aa3a6'
const html = `<!doctype html><html><head><style>
@font-face{font-family:J;src:url(${jakarta}) format('woff2');font-weight:100 900}
@font-face{font-family:I;src:url(${inter}) format('woff2');font-weight:100 900}
*{margin:0;box-sizing:border-box}
body{width:1200px;height:630px;background:radial-gradient(700px 420px at 960px 110px,rgba(74,163,166,.32),transparent 70%),linear-gradient(135deg,#111317,#1b2128);color:#f1f3f5;font-family:I;padding:96px 110px;display:flex;flex-direction:column;justify-content:center}
.w{display:flex;align-items:center;gap:28px;font:700 112px/1 J;letter-spacing:-3px}
.c{width:190px;height:190px;border-radius:50%;position:relative;overflow:hidden;background:#f1f3f5;display:grid;place-items:center}
.c:before{content:'';position:absolute;inset:0;background:linear-gradient(225deg,transparent 49.6%,${T} 50%)}
.c span{position:relative;color:#15171c;font:800 92px/1 J;letter-spacing:-4px}
p{margin-top:56px;font:500 33px/1.4 I;color:#c9ced6}
p b{color:${T};font-weight:600}
</style></head><body>
<div class="w"><span style="color:${T}">work</span><div class="c"><span>MY</span></div><span>work</span></div>
<p>Private workspace for life, work, projects &amp; documents<br><b>+ GLAMIEX business manager — sales, payments &amp; reports</b></p>
</body></html>`

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1200, height: 630 } })
await page.setContent(html)
await page.evaluate(() => document.fonts.ready)
await page.screenshot({ path: 'public/og-image.jpg', type: 'jpeg', quality: 88 })
await browser.close()
console.log('public/og-image.jpg written')

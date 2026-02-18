import puppeteer from 'puppeteer'
import iconv from 'iconv-lite'
import { load } from 'cheerio'
import { mkdir, writeFile } from 'node:fs/promises'

export default async function createCrawler(id, pw) {
    const browser = await puppeteer.launch({
        headless: 'new',
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-blink-features=AutomationControlled'],
    })
    let cookie
    try {
        const page = await browser.newPage()
        const loginNetwork = []
        const pushNet = entry => {
            loginNetwork.push({ at: new Date().toISOString(), ...entry })
            if (loginNetwork.length > 200) loginNetwork.shift()
        }
        const shouldTrace = req => {
            const url = req.url()
            const type = req.resourceType()
            return (
                url.includes('dhlottery.co.kr') &&
                (req.method() !== 'GET' || ['document', 'xhr', 'fetch'].includes(type) || url.includes('login'))
            )
        }
        page.on('request', req => {
            if (!shouldTrace(req)) return
            pushNet({
                event: 'request',
                method: req.method(),
                type: req.resourceType(),
                url: req.url(),
                postData: req.postData()?.slice(0, 500) || '',
            })
        })
        page.on('response', res => {
            const req = res.request()
            if (!shouldTrace(req)) return
            const headers = res.headers()
            pushNet({
                event: 'response',
                method: req.method(),
                type: req.resourceType(),
                url: res.url(),
                status: res.status(),
                statusText: res.statusText(),
                contentType: headers['content-type'] || '',
                location: headers.location || '',
            })
        })
        page.on('requestfailed', req => {
            if (!shouldTrace(req)) return
            pushNet({
                event: 'requestfailed',
                method: req.method(),
                type: req.resourceType(),
                url: req.url(),
                errorText: req.failure()?.errorText || '',
            })
        })
        try {
            page.setDefaultTimeout(90000)
            await page.evaluateOnNewDocument(() => {
                Object.defineProperty(navigator, 'webdriver', { get: () => undefined })
            })
            await page.setUserAgent(
                'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36',
            )
            await page.setExtraHTTPHeaders({ 'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7' })
            await page.goto('https://www.dhlottery.co.kr/login', {
                waitUntil: 'domcontentloaded',
                timeout: 90000,
            })

            await Promise.all(['#inpUserId', '#inpUserPswdEncn'].map(s => page.waitForSelector(s, { visible: true })))
            await page.type('#inpUserId', id)
            await page.type('#inpUserPswdEncn', pw)

            const nav = Promise.race([
                page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 90000 }),
                page.waitForFunction(() => !location.href.includes('/login'), { timeout: 90000 }),
            ])
            const loginReq = page
                .waitForRequest(
                    req =>
                        req.method() === 'POST' &&
                        req.url().includes('dhlottery.co.kr') &&
                        !req.url().includes('TRACERAPI'),
                    { timeout: 15000 },
                )
                .catch(() => null)
            const submit = await page.$('#btnLogin, button[type="submit"], input[type="submit"]')
            await (submit ? submit.click() : page.keyboard.press('Enter'))
            let posted = await loginReq
            if (!posted) {
                await page
                    .evaluate(() => {
                        const form = document.querySelector('form')
                        if (!form) return
                        if (typeof form.requestSubmit === 'function') form.requestSubmit()
                        else form.submit()
                    })
                    .catch(() => {})
                posted = await page
                    .waitForRequest(
                        req =>
                            req.method() === 'POST' &&
                            req.url().includes('dhlottery.co.kr') &&
                            !req.url().includes('TRACERAPI'),
                        { timeout: 10000 },
                    )
                    .catch(() => null)
            }
            if (!posted) throw new Error('로그인 요청 미발생(봇판별/submit 미동작 의심)')
            await nav

            if (page.url().includes('login')) throw new Error('로그인 실패')
            cookie = (await page.cookies()).map(c => `${c.name}=${c.value}`).join(';')
        } catch (error) {
            if (process.env.CI) {
                const stamp = Date.now()
                const base = `artifacts/login-failed-${stamp}`
                const url = page.url()
                const title = await page.title().catch(() => '')
                const text = await page
                    .evaluate(() => document.body?.innerText?.replace(/\s+/g, ' ').slice(0, 500) || '')
                    .catch(() => '')
                await mkdir('artifacts', { recursive: true }).catch(() => {})
                await page.screenshot({ path: `${base}.png`, fullPage: true }).catch(() => {})
                await writeFile(`${base}.html`, await page.content().catch(() => ''), 'utf8').catch(() => {})
                await writeFile(
                    `${base}.txt`,
                    [`error=${error.message}`, `url=${url}`, `title=${title}`, `text=${text}`].join('\n'),
                    'utf8',
                ).catch(() => {})
                await writeFile(`${base}-network.json`, JSON.stringify(loginNetwork, null, 2), 'utf8').catch(() => {})
            }
            throw error
        } finally {
            await page.close().catch(() => {})
        }
    } finally {
        await browser.close()
    }

    return {
        async request({ url, headers, method = 'GET', form, parse }) {
            const res = await fetch(new URL(url, 'https://www.dhlottery.co.kr'), {
                method,
                headers: { ...headers, cookie, ...(form && { 'Content-Type': 'application/x-www-form-urlencoded' }) },
                body: form && new URLSearchParams(form),
            })
            return parse === 'json' ? res.json() : Buffer.from(await res.arrayBuffer())
        },
        async html(opts) {
            return load(iconv.decode(await this.request(opts), 'euc-kr'))
        },
    }
}

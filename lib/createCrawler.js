import puppeteer from 'puppeteer'
import iconv from 'iconv-lite'
import { load } from 'cheerio'
import { mkdir, writeFile } from 'node:fs/promises'

const shouldMaskKey = key => /(id|pw|pwd|pass|password|user|login|enc|rsa|token|cookie|session)/i.test(key)
const summarizePostData = raw => {
    if (!raw) return { length: 0, keys: [], masked: '' }
    const params = new URLSearchParams(raw)
    const keys = Array.from(new Set(Array.from(params.keys())))
    if (keys.length === 0) return { length: raw.length, keys: [], masked: `len:${raw.length}` }
    return {
        length: raw.length,
        keys,
        masked: keys
            .map(k => `${k}=${shouldMaskKey(k) ? '__redacted__' : `len:${(params.get(k) || '').length}`}`)
            .join('&')
            .slice(0, 500),
    }
}
const redact = (text, secrets) =>
    secrets.reduce((acc, s) => (s ? acc.split(s).join('[REDACTED]') : acc), text || '')
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))

export default async function createCrawler(id, pw) {
    const browser = await puppeteer.launch({
        headless: 'new',
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-blink-features=AutomationControlled'],
    })
    let cookie
    try {
        const page = await browser.newPage()
        const loginNetwork = []
        const tracerBodies = []
        const tracerState = { checkBotIp: '', isWait: '', waitCnt: '' }
        let loginPostSummary = null
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
                postData: summarizePostData(req.postData() || ''),
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
            const url = res.url()
            if (url.includes('/TRACERAPI/checkBotIp.do') || url.includes('/TRACERAPI/inputQueue.do')) {
                res.text()
                    .then(body => {
                        if (url.includes('/TRACERAPI/checkBotIp.do')) tracerState.checkBotIp = (body || '').trim()
                        if (url.includes('/TRACERAPI/inputQueue.do')) {
                            const isWait = /id="isWait"[^>]*>([^<]*)</i.exec(body || '')?.[1]?.trim() || ''
                            const waitCnt = /id="waitCnt"[^>]*>([^<]*)</i.exec(body || '')?.[1]?.trim() || ''
                            tracerState.isWait = isWait
                            tracerState.waitCnt = waitCnt
                        }
                        tracerBodies.push({
                            at: new Date().toISOString(),
                            url,
                            status: res.status(),
                            contentType: headers['content-type'] || '',
                            bodyPreview: redact(body?.slice(0, 2000) || '', [id, pw]),
                        })
                        if (tracerBodies.length > 20) tracerBodies.shift()
                    })
                    .catch(() => {})
            }
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
            for (let i = 0; i < 40; i += 1) {
                if (tracerState.checkBotIp || tracerState.isWait) break
                await sleep(500)
            }
            if (tracerState.isWait === 'T') throw new Error(`접속 대기열 상태(waitCnt=${tracerState.waitCnt || '?'})`)

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
            const submit = await page.$('#btnLogin')
            await (submit ? submit.click() : page.keyboard.press('Enter'))
            const posted = await loginReq
            if (!posted) throw new Error('로그인 요청 미발생(봇판별/submit 미동작 의심)')
            const postData = posted.postData() || ''
            const params = new URLSearchParams(postData)
            loginPostSummary = {
                url: posted.url(),
                postDataLength: postData.length,
                fields: Array.from(params.keys()),
                fieldValueLengths: Object.fromEntries(
                    Array.from(params.keys()).map(k => [k, params.get(k)?.length || 0]),
                ),
                maskedPostData: summarizePostData(postData),
            }
            await nav

            if (page.url().includes('login')) throw new Error('로그인 실패')
            cookie = (await page.cookies()).map(c => `${c.name}=${c.value}`).join(';')
        } catch (error) {
            if (process.env.CI) {
                const stamp = Date.now()
                const base = `artifacts/login-failed-${stamp}`
                const url = page.url()
                const title = await page.title().catch(() => '')
                const textRaw = await page
                    .evaluate(() => document.body?.innerText?.replace(/\s+/g, ' ').slice(0, 500) || '')
                    .catch(() => '')
                const text = redact(textRaw, [id, pw])
                await mkdir('artifacts', { recursive: true }).catch(() => {})
                await page
                    .evaluate(() => {
                        const selectors = ['#inpUserId', '#inpUserPswdEncn', 'input[type="password"]', 'input[type="text"]']
                        selectors.forEach(s => {
                            const el = document.querySelector(s)
                            if (el && 'value' in el) el.value = ''
                        })
                    })
                    .catch(() => {})
                await page.screenshot({ path: `${base}.png`, fullPage: true }).catch(() => {})
                const html = redact(await page.content().catch(() => ''), [id, pw])
                await writeFile(`${base}.html`, html, 'utf8').catch(() => {})
                await writeFile(
                    `${base}.txt`,
                    [
                        `error=${redact(error.message, [id, pw])}`,
                        `url=${redact(url, [id, pw])}`,
                        `title=${redact(title, [id, pw])}`,
                        `text=${text}`,
                        `tracerCheckBotIp=${tracerState.checkBotIp || 'none'}`,
                        `tracerIsWait=${tracerState.isWait || 'none'}`,
                        `tracerWaitCnt=${tracerState.waitCnt || 'none'}`,
                        `loginPost=${loginPostSummary ? 'captured' : 'none'}`,
                    ].join('\n'),
                    'utf8',
                ).catch(() => {})
                await writeFile(`${base}-network.json`, JSON.stringify(loginNetwork, null, 2), 'utf8').catch(() => {})
                await writeFile(`${base}-login-post.json`, JSON.stringify(loginPostSummary, null, 2), 'utf8').catch(
                    () => {},
                )
                await writeFile(`${base}-tracer-bodies.json`, JSON.stringify(tracerBodies, null, 2), 'utf8').catch(
                    () => {},
                )
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

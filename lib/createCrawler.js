import puppeteer from 'puppeteer'
import iconv from 'iconv-lite'
import { load } from 'cheerio'
import pRetry from 'p-retry'
import { mkdir, writeFile } from 'node:fs/promises'

export default async function createCrawler(id, pw) {
    const browser = await puppeteer.launch({
        headless: 'new',
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
    })
    let cookie
    try {
        cookie = await pRetry(
            async () => {
                const page = await browser.newPage()
                try {
                    page.setDefaultTimeout(90000)
                    await page.goto('https://www.dhlottery.co.kr/login', { waitUntil: 'domcontentloaded' })

                    await Promise.all(
                        ['#inpUserId', '#inpUserPswdEncn'].map(s => page.waitForSelector(s, { visible: true })),
                    )
                    await page.type('#inpUserId', id)
                    await page.type('#inpUserPswdEncn', pw)

                    const nav = Promise.race([
                        page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 90000 }),
                        page.waitForFunction(() => !location.href.includes('/login'), { timeout: 90000 }),
                    ])
                    const btn = await page.$('#btnLogin, button[type="submit"], input[type="submit"]')
                    await (btn ? btn.click() : page.keyboard.press('Enter'))
                    await nav

                    if (page.url().includes('login')) throw new Error('로그인 실패')
                    return (await page.cookies()).map(c => `${c.name}=${c.value}`).join(';')
                } finally {
                    await page.close().catch(() => {})
                }
            },
            {
                retries: 2,
                minTimeout: 3000,
                factor: 2,
                onFailedAttempt: async ({ attemptNumber, retriesLeft, error }) => {
                    if (!process.env.CI) return
                    const pages = await browser.pages().catch(() => [])
                    const page = pages.at(-1)
                    const stamp = Date.now()
                    const base = `.artifacts/login-attempt-${attemptNumber}-${stamp}`
                    const url = page?.url?.() ?? ''
                    const title = await page?.title?.().catch(() => '')
                    const text = await page
                        ?.evaluate(() => document.body?.innerText?.replace(/\s+/g, ' ').slice(0, 500) || '')
                        .catch(() => '')
                    await mkdir('.artifacts', { recursive: true }).catch(() => {})
                    if (page) await page.screenshot({ path: `${base}.png`, fullPage: true }).catch(() => {})
                    if (page) await writeFile(`${base}.html`, await page.content().catch(() => ''), 'utf8').catch(() => {})
                    await writeFile(
                        `${base}.txt`,
                        [`attempt=${attemptNumber}`, `retriesLeft=${retriesLeft}`, `error=${error.message}`, `url=${url}`, `title=${title}`, `text=${text}`].join('\n'),
                        'utf8',
                    ).catch(() => {})
                },
            },
        )
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

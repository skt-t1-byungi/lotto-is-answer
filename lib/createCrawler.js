import puppeteer from 'puppeteer'
import iconv from 'iconv-lite'
import { load } from 'cheerio'
import pRetry from 'p-retry'

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

                    // 로그인 시도 및 페이지 이동 대기
                    const nav = Promise.race([
                        page.waitForNavigation({ waitUntil: 'domcontentloaded' }),
                        page.waitForFunction(() => !location.href.includes('/login')),
                    ])
                    const btn = await page.$('#btnLogin, button[type="submit"]')
                    await (btn ? btn.click() : page.keyboard.press('Enter'))
                    await nav

                    if (page.url().includes('login')) throw new Error('로그인 실패')
                    return (await page.cookies()).map(c => `${c.name}=${c.value}`).join(';')
                } finally {
                    await page.close().catch(() => {})
                }
            },
            { retries: 2, minTimeout: 3000 },
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

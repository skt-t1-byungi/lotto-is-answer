import puppeteer from 'puppeteer'
import iconv from 'iconv-lite'
import { load } from 'cheerio'

export default async function createCrawler(id, pw) {
    const browser = await puppeteer.launch({
        headless: 'new',
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
    })
    let cookie
    try {
        const page = await browser.newPage()
        try {
            await page.goto('https://www.dhlottery.co.kr/login', { waitUntil: 'domcontentloaded' })
            await page.waitForNetworkIdle({ idleTime: 800 })

            await Promise.all(['#inpUserId', '#inpUserPswdEncn'].map(s => page.waitForSelector(s, { visible: true })))
            await page.type('#inpUserId', id)
            await page.type('#inpUserPswdEncn', pw)
            await page.waitForNetworkIdle({ idleTime: 800 })

            await page.waitForSelector('#btnLogin', { visible: true })
            await Promise.all([page.waitForFunction(() => !location.href.includes('/login')), page.click('#btnLogin')])

            if (page.url().includes('login')) throw new Error('로그인 실패')
            cookie = (await page.cookies()).map(c => `${c.name}=${c.value}`).join(';')
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

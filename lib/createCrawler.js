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
        await page.goto('https://www.dhlottery.co.kr/login', { waitUntil: 'networkidle0' })

        // 아이디와 비밀번호 입력 필드를 기다리고 값을 입력합니다.
        await Promise.all(['#inpUserId', '#inpUserPswdEncn'].map(s => page.waitForSelector(s, { visible: true })))
        await page.type('#inpUserId', id)
        await page.type('#inpUserPswdEncn', pw)

        // 로그인 버튼을 클릭하고 네비게이션이나 URL 변경을 기다립니다.
        await Promise.all([
            Promise.race([
                page.waitForNavigation({ waitUntil: 'domcontentloaded' }),
                page.waitForFunction(() => !location.href.includes('/login')),
            ]),
            page.click('#btnLogin'),
        ])

        if (page.url().includes('login')) throw new Error('로그인 실패')
        cookie = (await page.cookies()).map(c => `${c.name}=${c.value}`).join(';')
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

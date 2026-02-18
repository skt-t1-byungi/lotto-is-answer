import puppeteer from 'puppeteer'
import iconv from 'iconv-lite'
import { load } from 'cheerio'
import { mkdir, writeFile } from 'node:fs/promises'

export default async function createCrawler(id, pw) {
    const browser = await puppeteer.launch({
        headless: 'new',
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
    })
    let cookie
    try {
        const page = await browser.newPage()
        try {
            page.setDefaultTimeout(90000)
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
            const btn = await page.$('#btnLogin, button[type="submit"], input[type="submit"]')
            await (btn ? btn.click() : page.keyboard.press('Enter'))
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

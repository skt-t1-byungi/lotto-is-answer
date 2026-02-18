import puppeteer from 'puppeteer'
import iconv from 'iconv-lite'
import { load } from 'cheerio'

/**
 *
 * @param {string} id
 * @param {string} pw
 * @returns
 */
export default async function createCrawler(id, pw) {
    const browser = await puppeteer.launch({
        headless: 'new',
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
        // headless: false, // for debug
    })
    let cookie
    try {
        const page = await browser.newPage()
        await page.goto('https://www.dhlottery.co.kr/login')
        await page.type('#inpUserId', id)
        await page.type('#inpUserPswdEncn', pw)
        const controller = new AbortController()
        const dialogPromise = new Promise((resolve, reject) => {
            const fail = () => {
                page.off('dialog', fail)
                reject(new Error('로그인 실패했습니다.'))
            }
            page.on('dialog', fail)
            controller.signal.addEventListener('abort', () => page.off('dialog', fail), { once: true })
        })
        await Promise.all([
            page.keyboard.press('Enter'),
            (async () => {
                try {
                    return await Promise.race([dialogPromise, page.waitForNavigation()])
                } finally {
                    controller.abort()
                }
            })(),
        ])
        cookie = (await page.cookies()).map(o => `${o.name}=${o.value}`).join(';')
    } finally {
        browser.close()
    }

    return {
        /**
         * @param {{ url: string, headers?: Record<string, string>, method?: string, form?: Record<string, string|number>, parse?: 'json' }} opts
         * @returns {Promise<import('cheerio').CheerioAPI>}
         */
        async html(opts) {
            return load(String(iconv.decode(await this.request(opts), 'euc-kr')))
        },
        async request({ url, headers, method = 'GET', form, parse, ..._rest }) {
            const resolvedUrl = new URL(url, 'https://www.dhlottery.co.kr').href
            const reqHeaders = { ...headers, cookie }

            let body
            if (form) {
                body = new URLSearchParams(
                    Object.fromEntries(Object.entries(form).map(([k, v]) => [k, String(v)])),
                ).toString()
                reqHeaders['Content-Type'] = 'application/x-www-form-urlencoded'
            }

            const resp = await fetch(resolvedUrl, { method, headers: reqHeaders, body })

            if (parse === 'json') return resp.json()
            return Buffer.from(await resp.arrayBuffer())
        },
    }
}

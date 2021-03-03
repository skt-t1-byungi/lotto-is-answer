import puppeteer from 'puppeteer-core'
import findChrome from 'chrome-finder'
import { aico, race } from 'aico'
import phin from 'phin'
import cheerio from 'cheerio'
import iconv from 'iconv-lite'

export default async function createCrawler(id, pw) {
    const browser = await puppeteer.launch({ executablePath: findChrome() })
    let cookie
    try {
        const page = await browser.newPage()
        await page.goto('https://dhlottery.co.kr/user.do?method=login')
        await page.type('[name="userId"]', id)
        await page.type('[name="password"]', pw)
        await Promise.all([
            page.keyboard.press('Enter'),
            race([
                aico(function* (sig) {
                    let stop
                    try {
                        yield new Promise((res, rej) => {
                            const fail = () => rej(new Error('로그인 실패했습니다.'))
                            page.on('dialog', fail)
                            stop = () => {
                                res()
                                page.off('dialog', fail)
                            }
                        })
                    } finally {
                        if (sig.aborted) stop()
                    }
                }),
                page.waitForNavigation(),
            ]),
        ])
        cookie = (await page.cookies()).map(o => o.name + '=' + o.value).join(';')
    } finally {
        browser.close()
    }

    return {
        async html(opts) {
            return cheerio.load(String(iconv.decode(await this.request(opts), 'euc-kr')))
        },
        async request({ url, headers, ...opts }) {
            const resp = await phin({
                ...opts,
                url: new URL(url, 'https://www.dhlottery.co.kr'),
                headers: {
                    ...headers,
                    cookie,
                },
            })
            return resp.body
        },
    }
}

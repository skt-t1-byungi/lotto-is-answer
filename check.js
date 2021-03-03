import parseArgvOrExit from './lib/parseArgvOrExit.js'
import createCrawler from './lib/createCrawler.js'
import createSlackWebhookSender from './lib/createSlackWebhookSender.js'

const { id, pw, url } = parseArgvOrExit({ id: '동행복권ID', pw: '동행복권비번', url: '슬랙웹훅주소' })
const crawler = await createCrawler(id, pw)

const $ = await crawler.html({ url: '/userSsl.do?method=myPage' })
const money = Number($('.total_new strong').text().replace(/,/g, ''))
const buys = $('table.tbl_data')
    .eq(0)
    .find('tbody > tr')
    .filter((_, tr) => $('td.nodata', tr).length === 0)
    .map((_, tr) => {
        const $tds = $('td', tr)
        return {
            date: $tds.eq(0).text().trim(),
            amount: $tds.eq(4).text().trim(),
            result: $tds.eq(5).text().trim(),
        }
    })
    .toArray()

const send = createSlackWebhookSender(url)
await send(`
[로또당첨현황]
${buys.map(o => `\t-구매날짜: ${o.date} | 수량: ${o.amount} | 결과: ${o.result}`).join('\r\n')}

(이제 ${money}원 남아있음..)
`)

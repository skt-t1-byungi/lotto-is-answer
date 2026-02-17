import parseArgvOrExit from './lib/parseArgvOrExit.js'
import createCrawler from './lib/createCrawler.js'
import createSlackWebhookSender from './lib/createSlackWebhookSender.js'
import formatMoney from './lib/formatMoney.js'

function toYmd(date) {
    const y = String(date.getFullYear())
    const m = String(date.getMonth() + 1).padStart(2, '0')
    const d = String(date.getDate()).padStart(2, '0')
    return `${y}${m}${d}`
}

const { id, pw, url } = parseArgvOrExit({ id: '동행복권ID', pw: '동행복권비번', url: '슬랙웹훅주소' })
const crawler = await createCrawler(id, pw)

const userMndp = await crawler.request({
    url: '/mypage/selectUserMndp.do',
    parse: 'json',
})

const money = Number(userMndp?.data?.userMndp?.totalAmt ?? 0)
const endDate = new Date()
const startDate = new Date(endDate)
startDate.setDate(startDate.getDate() - 6)

const ledgerQuery = new URLSearchParams({
    srchStrDt: toYmd(startDate),
    srchEndDt: toYmd(endDate),
    pageNum: '1',
    recordCountPerPage: '10',
}).toString()

const ledger = await crawler.request({
    url: `/mypage/selectMyLotteryledger.do?${ledgerQuery}`,
    parse: 'json',
})

const buys = (ledger?.data?.list ?? []).map(o => ({
    date: o.eltOrdrDt,
    amount: String(o.prchsQty ?? ''),
    result: o.ltWnResult ?? '',
}))

const send = createSlackWebhookSender(url)
await send(
    `
[로또당첨현황]
${
    buys.length
        ? buys.map(o => `\t - 구매날짜: ${o.date} | 수량: ${o.amount} | 결과: ${o.result}`).join('\r\n')
        : '\t- 구매기록 없음'
}

이제 ${formatMoney(money)}원 남았어요
${money <= 5_000 ? '돈이 별로 없네요. 충전해야 합니다.' : ''}
`.trim(),
)

import dayjs from 'dayjs'
import parseArgvOrExit from './lib/parseArgvOrExit.js'
import createCrawler from './lib/createCrawler.js'
import createSlackWebhookSender from './lib/createSlackWebhookSender.js'
import formatMoney from './lib/formatMoney.js'

const { id, pw, url } = parseArgvOrExit({ id: '동행복권ID', pw: '동행복권비번', url: '슬랙웹훅주소' })
const crawler = await createCrawler(id, pw)

const userMndp = await crawler.request({ url: '/mypage/selectUserMndp.do', parse: 'json' })
const totalAmt = +(userMndp?.data?.userMndp?.totalAmt ?? 0)
const end = dayjs()

const ledger = await crawler.request({
    url:
        '/mypage/selectMyLotteryledger.do?' +
        new URLSearchParams({
            srchStrDt: end.subtract(6, 'day').format('YYYYMMDD'),
            srchEndDt: end.format('YYYYMMDD'),
            pageNum: 1,
            recordCountPerPage: 10,
        }),
    parse: 'json',
})

const buys = (ledger?.data?.list || []).map(
    ({ eltOrdrDt: d, prchsQty: a, ltWnResult: r }) => `\t - 구매날짜: ${d} | 수량: ${a ?? ''} | 결과: ${r ?? ''}`,
)

await createSlackWebhookSender(url)(
    `[로또당첨현황]
${buys.length ? buys.join('\r\n') : '\t- 구매기록 없음'}

이제 ${formatMoney(totalAmt)}원 남았어요
${totalAmt <= 5000 ? '돈이 별로 없네요. 충전해야 합니다.' : ''}`.trim(),
)

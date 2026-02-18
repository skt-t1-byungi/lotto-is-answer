import parseArgvOrExit from './lib/parseArgvOrExit.js'
import createCrawler from './lib/createCrawler.js'
import createSlackWebhookSender from './lib/createSlackWebhookSender.js'
import formatMoney from './lib/formatMoney.js'
import getBalance from './lib/getBalance.js'
import getRecentLedger from './lib/getRecentLedger.js'

const { id, pw, url } = parseArgvOrExit({ id: '동행복권ID', pw: '동행복권비번', url: '슬랙웹훅주소' })
const crawler = await createCrawler(id, pw)
const send = createSlackWebhookSender(url)

const [totalAmt, ledger] = await Promise.all([getBalance(crawler), getRecentLedger(crawler)])

const buys = ledger.map(
    ({ eltOrdrDt: d, prchsQty: a, ltWnResult: r }) => `\t - 구매날짜: ${d} | 수량: ${a ?? ''} | 결과: ${r ?? ''}`,
)

await send(
    `[로또당첨현황]
${buys.length ? buys.join('\r\n') : '\t- 구매기록 없음'}

이제 ${formatMoney(totalAmt)}원 남았어요
${totalAmt <= 5000 ? '돈이 별로 없네요. 충전해야 합니다.' : ''}`.trim(),
)

import { randomInt } from 'node:crypto'
import createCrawler from './lib/createCrawler.js'
import parseArgvOrExit from './lib/parseArgvOrExit.js'
import createSlackWebhookSender from './lib/createSlackWebhookSender.js'
import formatMoney from './lib/formatMoney.js'
import getBalance from './lib/getBalance.js'

const {
    id,
    pw,
    url,
    amount: reqAmt,
} = parseArgvOrExit({
    id: '동행복권ID',
    pw: '동행복권비번',
    url: '슬랙웹훅주소',
    amount: '수량',
})
const send = createSlackWebhookSender(url)
const crawler = await createCrawler(id, pw)

const money = await getBalance(crawler)
let amount = Math.min(+reqAmt, Math.floor(money / 1000))

if (amount <= 0) {
    await send(
        `[로또구매] 잔액 부족(${formatMoney(money)}원) 또는 수량 오류. 충전 필요: https://dhlottery.co.kr/payment.do?method=payment`,
    )
    process.exit(1)
}
if (amount < +reqAmt) await send(`[로또구매] 잔액 부족으로 ${amount}장만 구매합니다.`)

const $ = await crawler.html({ url: 'https://ol.dhlottery.co.kr/olotto/game/game645.do' })
const json = await crawler.request({
    method: 'POST',
    url: 'https://ol.dhlottery.co.kr/olotto/game/execBuy.do',
    parse: 'json',
    form: {
        round: $('#curRound').text(),
        direct: 'INTCOM2',
        nBuyAmount: amount * 1000,
        param: JSON.stringify(
            Array.from({ length: amount }, (_, i) => {
                const s = new Set()
                while (s.size < 6) s.add(randomInt(1, 46))
                return {
                    genType: '1',
                    arrGameChoiceNum: [...s].sort((a, b) => a - b).join(','),
                    alpabet: String.fromCharCode(65 + i),
                }
            }),
        ),
        ROUND_DRAW_DATE: $('input[name="ROUND_DRAW_DATE"]').val(),
        WAMT_PAY_TLMT_END_DT: $('input[name="WAMT_PAY_TLMT_END_DT"]').val(),
        gameCnt: amount,
        saleMdaDcd: '10',
    },
})

if (json.result.resultCode !== '100') {
    await send(`[로또구매] 실패\n\`\`\`${JSON.stringify(json, null, 2)}\`\`\``)
    process.exit(1)
}

await send(`[로또구매] ${amount}장 구매 완료 (${json.result.issueDay})
${json.result.arrGameChoiceNum
    .map(
        s =>
            `\t- ${s
                .split('|')
                .slice(1, 7)
                .map(v => (+v > 45 ? v.slice(0, -1) : v))
                .join(',')}`,
    )
    .join('\n')}
잔액: ${formatMoney(money - amount * 1000)}원`)

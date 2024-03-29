import createCrawler from './lib/createCrawler.js'
import parseArgvOrExit from './lib/parseArgvOrExit.js'
import createSlackWebhookSender from './lib/createSlackWebhookSender.js'
import formatMoney from './lib/formatMoney.js'

const {
    id,
    pw,
    url,
    amount: amountStr,
} = parseArgvOrExit({
    id: '동행복권ID',
    pw: '동행복권비번',
    url: '슬랙웹훅주소',
    amount: '수량',
})

const send = createSlackWebhookSender(url)
const crawler = await createCrawler(id, pw)

let $ = await crawler.html({ url: '/userSsl.do?method=myPage' })

const money = Number($('.total_new strong').text().replace(/,/g, ''))
if (money === 0) {
    await send(
        `
[로또구매] 돈이 없어서 구매를 못했어요. 돈을 충전해야 합니다.
https://www.dhlottery.co.kr/payment.do?method=payment
    `,
    )
    process.exit(1)
}

let amount = Number(amountStr)
if (amount != (amount = Math.min(amount, money / 1000))) {
    await send(
        `
[로또구매] 돈이 부족해서 ${amount}장만 삽니다. 미리 충전하세요
https://www.dhlottery.co.kr/payment.do?method=payment
`,
    )
}

$ = await crawler.html({ url: 'https://ol.dhlottery.co.kr/olotto/game/game645.do' })
const round = Number($('#curRound').text())

const json = await crawler.request({
    method: 'POST',
    url: 'https://ol.dhlottery.co.kr/olotto/game/execBuy.do',
    parse: 'json',
    form: {
        round,
        direct: 'INTCOM2',
        nBuyAmount: amount * 1000,
        param: JSON.stringify(
            Array(amount)
                .fill(undefined)
                .map((_, i) => ({
                    genType: '0',
                    arrGameChoiceNum: null,
                    alpabet: String.fromCharCode(65 + i),
                })),
        ),
        gameCnt: amount,
    },
})

if (json.result.resultCode !== '100') {
    await send(`
[로또구매] 구매에 실패했습니다.
---
디버그 응답: 
${'```'}
${JSON.stringify(json, null, 2)}
${'```'}
---
`)
    process.exit(1)
}

await send(`
[로또구매] ${amount}장 구매 했습니다. 
구매날짜: ${json.result.issueDay}
구매한 로또번호: 
${json.result.arrGameChoiceNum.map(str => `\t - ${str.slice(0, -1).split('|').slice(1).join(',')}`).join('\r\n')}
남은돈: ${formatMoney(money - amount * 1000)}원
`)

import dayjs from 'dayjs'

/** 최근 구매/당첨 내역 조회 */
export default async function getRecentLedger(crawler, { days = 7, pageNum = 1, recordCountPerPage = 10 } = {}) {
    const end = dayjs()
    const ledger = await crawler.request({
        url:
            '/mypage/selectMyLotteryledger.do?' +
            new URLSearchParams({
                srchStrDt: end.subtract(days - 1, 'day').format('YYYYMMDD'),
                srchEndDt: end.format('YYYYMMDD'),
                pageNum,
                recordCountPerPage,
            }),
        parse: 'json',
    })
    return ledger?.data?.list || []
}

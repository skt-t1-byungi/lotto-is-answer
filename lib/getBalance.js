/** 예치금 잔액 조회 */
export default async function getBalance(crawler) {
    const userMndp = await crawler.request({ url: '/mypage/selectUserMndp.do', parse: 'json' })
    return +(userMndp?.data?.userMndp?.totalAmt ?? 0)
}

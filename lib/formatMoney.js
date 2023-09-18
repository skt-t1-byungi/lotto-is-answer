export default function formatMoney(n) {
    return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',')
}

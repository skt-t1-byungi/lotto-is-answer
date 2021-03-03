/**
 * @template {object} T
 * @param {T} vars
 * @returns {Record<keyof T, string>}
 */
export default function parseArgvOrExit(vars) {
    const ret = {}
    const keys = Object.keys(vars)
    for (const arg of process.argv) {
        const idx = keys.findIndex(k => arg.startsWith(k + '='))
        if (~idx) {
            const key = keys[idx]
            ret[key] = arg.slice(key.length + 1)
            keys.splice(idx, 1)
            if (keys.length === 0) return ret // EXIT
        }
    }
    console.log(`${keys.map(k => vars[k]).join(',')} 정보가 없습니다`)
    process.exit(1)
}

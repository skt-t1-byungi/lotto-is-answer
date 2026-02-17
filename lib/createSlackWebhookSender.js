export default function createSlackWebhookSender(url) {
    return async text => {
        const resp = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text: text.trim() }),
        })
        const res = await resp.text()
        if (res !== 'ok') throw new Error(`[SlackWebhook] ${res}`)
    }
}

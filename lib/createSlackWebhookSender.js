import phin from 'phin'

export default function createSlackWebhookSender(url) {
    return async text => {
        const res = await phin({
            method: 'post',
            url,
            data: typeof text === 'string' ? { text } : text,
        }).then(resp => String(resp.body))

        if (res !== 'ok') throw new Error(`[SlackWebhook] ${res}`)
    }
}

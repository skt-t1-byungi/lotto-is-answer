# AGENTS.md

Korean lottery (동행복권) automation. Puppeteer + GitHub Actions + Slack.

## Setup

Node 18+, `npm ci`

**Secrets** (repo settings):
- `LOTTO_ID`, `LOTTO_PW` - 동행복권 credentials
- `LOTTO_SLACK_URL` - webhook

## Usage

```bash
node buy.js id=<ID> pw=<PW> url=<URL> amount=<N>
node check.js id=<ID> pw=<PW> url=<URL>
```

**Workflows**: buy.yml (Fri 1:30AM KST), check.yml (Mon/Fri 1AM KST)

## Style

Unix minimal: terse, pragmatic, no abstraction. ES modules, no semicolons, single quotes. CLI-first: parse args, work, exit. No comments unless non-obvious.

## Files

- `buy.js`, `check.js` - main scripts
- `lib/createCrawler.js` - Puppeteer auth/session
- `lib/parseArgvOrExit.js` - arg parser
- `lib/createSlackWebhookSender.js`, `lib/formatMoney.js` - utils

## Notes

- EUC-KR encoding (dhlottery.co.kr)
- Puppeteer headless `--no-sandbox`
- Cookie-based auth, auto balance check

# GitLab Webhooks

This is the custom webhooks for GitLab, which connects to Telegram through a bot.

## Usage

1. Add [Foxy The Bot](https://t.me/foxy_the_bot) to your Telegram Group or Channel
2. Using your Group ID or Channel ID as `chat_id` parameter (could be public or private). [How to?](https://thesmallthings.dev/blog/the-small-bot#group)
3. Open GitLab, go to Settings > Webhooks.
4. Paste this link to the URL input: https://gitlab-hooks.vercel.app/api?chat_id=[your_chat_id]
5. With **Trigger** options, we currently support _Merge Request_ and _Pipeline_ events
6. Add Webhooks, and we are good to go.

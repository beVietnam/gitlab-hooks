import { NowRequest, NowResponse } from "@vercel/node";
import fetch from "node-fetch";

export default async (request: NowRequest, response: NowResponse) => {
  await fetch(
    `https://api.telegram.org/bot${process.env.FOXY_BOT_TOKEN}/sendMessage`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        chat_id: process.env.USE_GITLAB_CHAT_ID,
        parse_mode: "Markdown",
        text: `X-Gitlab-Event: ${request.headers["x-gitlab-event"]}`,
      }),
    }
  );

  response.end();
};

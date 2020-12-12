import { NowRequest, NowRequestBody, NowResponse } from "@vercel/node";
import fetch from "node-fetch";

const TELEGRAM_API = `https://api.telegram.org/bot${process.env.FOXY_BOT_TOKEN}/sendMessage`;

const GitlabEvents = {
  Push: "Push Hook",
  Merge: "Merge Request Hook",
  Pipeline: "Pipeline Hook",
};

function getMessageOnMergeRequest(body: NowRequestBody) {
  const { user, repository, object_attributes } = body;
  return `
    [${repository.name}](${repository.url}) Merge Request opened by ${user.username}
    \n
    *[#${object_attributes.iid} ${object_attributes.title}](${object_attributes.url})*
    \n
    \`\`\`
    ${object_attributes.description}
    \`\`\`
  `;
}

export default async (request: NowRequest, response: NowResponse) => {
  // If you specify a secret token, it is sent with the hook request in the X-Gitlab-Token HTTP header.
  // Your webhook endpoint can check that to verify that the request is legitimate.

  // TODO: Check if secret token is matched

  const event = request.headers["x-gitlab-event"];

  let text = ``;

  switch (event) {
    case GitlabEvents.Merge:
      text = getMessageOnMergeRequest(request.body);
      break;
    case GitlabEvents.Pipeline:
      text = ``;
      break;
    default:
      break;
  }

  await fetch(TELEGRAM_API, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({
      chat_id: process.env.USE_GITLAB_CHAT_ID,
      parse_mode: "MarkdownV2",
      text,
    }),
  });

  // When GitLab sends a webhook, it expects a response in 10 seconds by default.
  // If it does not receive one, it retries the webhook.
  // If the endpoint doesn’t send its HTTP response within those 10 seconds, GitLab may decide the hook failed and retry it.
  response.end();
};

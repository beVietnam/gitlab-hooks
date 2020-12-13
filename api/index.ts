import { NowRequest, NowRequestBody, NowResponse } from "@vercel/node";
import fetch from "node-fetch";

const TELEGRAM_API = `https://api.telegram.org/bot${process.env.FOXY_BOT_TOKEN}/sendMessage`;

const GitlabEvents = {
  Merge: "Merge Request Hook",
  Pipeline: "Pipeline Hook",
};

function escapeContent(content: string) {
  const regex = /\_|\*|\[|\]|\(|\)|\~|\`|\>|\#|\+|\-|\=|\{|\}|\.|\!|\|/g;
  return content.replace(regex, `\\$&`);
}

function getMessageOnMergeRequest(body: NowRequestBody) {
  const { user, project, object_attributes } = body;

  const projectName = escapeContent(project.name);
  const username = escapeContent(user.name);
  const title = escapeContent(object_attributes.title);

  return [
    `Cơ trưởng *${username}* muốn bay thử nghiệm [${projectName}](${project.web_url})\n`,
    `\n`,
    `*[\\#${object_attributes.iid} ${title}](${object_attributes.url})*\n`,
    `${escapeContent(object_attributes.description)}`,
  ].join("");
}

function getMessageOnPipeline(body: NowRequestBody) {
  const { object_attributes, project, user } = body;

  const projectName = escapeContent(project.name);
  const pipelineId = object_attributes.id;
  const pipelineUrl = `[\\#${pipelineId}](${project.web_url}/pipelines/${pipelineId})`;
  const escapedUsername = escapeContent(user.name);

  switch (object_attributes.status) {
    case "success":
      return [
        `🛬 Chuyến bay ${pipelineUrl} hạ cánh thành công\n`,
        `\\- Tổng thời gian bay ${object_attributes.duration}s\n`,
      ].join("");

    case "failed":
      return [
        `💥 Chuyến bay ${pipelineUrl} mất tín hiệu\n`,
        `\\- Tổng thời gian bay ${object_attributes.duration}s\n`,
      ].join("");

    default:
      return [
        `🛫 Khởi hành chuyến bay ${pipelineUrl}\n`,
        `\\- Tổ bay *${projectName}*\n`,
        `\\- Chặng bay *${object_attributes.ref}*\n`,
        `\\- Cơ trưởng *${escapedUsername}*\n`,
      ].join("");
  }
}

function getBodyText(event: string | string[], body: NowRequestBody) {
  switch (event) {
    case GitlabEvents.Merge:
      return getMessageOnMergeRequest(body);
    case GitlabEvents.Pipeline:
      return getMessageOnPipeline(body);
    default:
      return ``;
  }
}

export default async (request: NowRequest, response: NowResponse) => {
  // If you specify a secret token, it is sent with the hook request in the X-Gitlab-Token HTTP header.
  // Your webhook endpoint can check that to verify that the request is legitimate.

  if (process.env.USE_GITLAB_TOKEN) {
    const token = request.headers["x-gitlab-token"];

    if (token !== process.env.USE_GITLAB_TOKEN) {
      response.status(401).json({
        message: "Unauthorized Gitlab Token",
      });

      return;
    }
  }

  const event = request.headers["x-gitlab-event"];
  const text = getBodyText(event, request.body);

  // Right now doesn’t support others event
  if (text.length === 0) {
    response.end();
    return;
  }

  const teleResponse = await fetch(TELEGRAM_API, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({
      chat_id: process.env.USE_GITLAB_CHAT_ID,
      parse_mode: "MarkdownV2",
      disable_web_page_preview: true,
      text,
    }),
  });

  const data = await teleResponse.json();

  // When GitLab sends a webhook, it expects a response in 10 seconds by default.
  // If it does not receive one, it retries the webhook.
  // If the endpoint doesn’t send its HTTP response within those 10 seconds, GitLab may decide the hook failed and retry it.
  response.status(teleResponse.status).json(data);
};

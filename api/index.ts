import { NowRequest, NowRequestBody, NowResponse } from "@vercel/node";
import fetch from "node-fetch";

const TELEGRAM_API = `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`;

const GitlabEvents = {
  Merge: "Merge Request Hook",
  Pipeline: "Pipeline Hook",
};

function secondsToMinutes(seconds: number) {
  if (!seconds) return "";

  let duration = seconds;
  duration = duration % 3600;

  let min = duration / 60;
  duration = duration % 60;

  let sec = duration;

  if (min === 0) {
    return `${sec}s`;
  } else {
    return `${min}m ${sec}s`;
  }
}

function escapeContent(content: string) {
  const regex = /\_|\*|\[|\]|\(|\)|\~|\`|\>|\#|\+|\-|\=|\{|\}|\.|\!|\|/g;
  return content.replace(regex, `\\$&`);
}

function getMessageOnMergeRequest(body: NowRequestBody) {
  const { user, project, object_attributes } = body;

  const projectName = escapeContent(project.name);
  const username = escapeContent(user.name);
  const title = escapeContent(object_attributes.title);

  switch (object_attributes.action) {
    case "merge":
      return `🆒 [\\#${object_attributes.iid} ${projectName}](${project.web_url}) merged by *${username}*\n`;
    case "approved":
      return `🆗 [\\#${object_attributes.iid} ${projectName}](${project.web_url}) approved by *${username}*\n`;
    case "reopen":
      return `🔃 [\\#${object_attributes.iid} ${projectName}](${project.web_url}) reopened by *${username}*\n`;
    case "update":
      return [
        `🆙 [\\#${object_attributes.iid} ${projectName}](${project.web_url}) updated by *${username}*\n`,
        `\n`,
        `*[${title}](${object_attributes.url})*\n`,
        `\n`,
        `${escapeContent(object_attributes.description)}`,
      ].join("");
    case "open":
      return [
        `🆕 [\\#${object_attributes.iid} ${projectName}](${project.web_url}) opened by *${username}*\n`,
        `\n`,
        `*[${title}](${object_attributes.url})*\n`,
        `\n`,
        `${escapeContent(object_attributes.description)}`,
      ].join("");
    case "close":
      return `🚮 [\\#${object_attributes.iid} ${projectName}](${project.web_url}) closed by *${username}*\n`;
    default:
      return "";
  }
}

function getMessageOnPipeline(body: NowRequestBody) {
  const { object_attributes, project, user } = body;

  const projectName = escapeContent(project.name);
  const pipelineId = object_attributes.id;
  const pipelineUrl = `[\\#${pipelineId}](${project.web_url}/pipelines/${pipelineId})`;
  const username = escapeContent(user.name);
  const ref = escapeContent(object_attributes.ref);
  const duration = secondsToMinutes(object_attributes.duration);

  switch (object_attributes.status) {
    case "success":
      return `🏠 ${pipelineUrl} build completed in ${duration}\n`;
    case "failed":
      return `🏚 ${pipelineUrl} build failed in ${duration}\n`;
    case "running":
      return [
        `🏗 ${pipelineUrl} building for *${ref}*\n`,
        `Project *${projectName}*\n`,
        `Issuer *${username}*\n`,
      ].join("");

    case "pending":
    default:
      return "";
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
  if (!request.query || !request.query.chat_id) {
    return response.status(400).json({
      message: "Missing Telegram channel identity",
    });
  }

  console.log("Has chat_id");

  // If you specify a secret token, it is sent with the hook request in the X-Gitlab-Token HTTP header.
  // Your webhook endpoint can check that to verify that the request is legitimate.
  if (process.env.GITLAB_SECRET_TOKEN) {
    const token = request.headers["x-gitlab-token"];

    if (token !== process.env.GITLAB_SECRET_TOKEN) {
      return response.status(401).json({
        message: "Unauthorized Gitlab Token",
      });
    }
  }

  const event = request.headers["x-gitlab-event"];

  const text = getBodyText(event, request.body);

  // Right now doesn’t support others event
  if (text.length === 0) {
    return response.status(200).json({
      message: "Unsupported event",
    });
  }

  console.log("Has text");

  const teleResponse = await fetch(TELEGRAM_API, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({
      chat_id: request.query.chat_id,
      parse_mode: "MarkdownV2",
      disable_web_page_preview: true,
      text,
    }),
  });

  const data = await teleResponse.json();

  console.log("Has data");

  // When GitLab sends a webhook, it expects a response in 10 seconds by default.
  // If it does not receive one, it retries the webhook.
  // If the endpoint doesn’t send its HTTP response within those 10 seconds, GitLab may decide the hook failed and retry it.
  return response.status(teleResponse.status).json(data);
};

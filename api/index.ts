import { NowRequest, NowRequestBody, NowResponse } from "@vercel/node";
import fetch from "node-fetch";

const TELEGRAM_API = `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`;

const GitlabEvents = {
  Merge: "Merge Request Hook",
  Pipeline: "Pipeline Hook",
  Comment: "Note Hook",
  Issue: "Issue Hook",
};

function secondsToMinutes(seconds: number) {
  if (!seconds) return "";

  let duration = seconds;
  duration = duration % 3600;

  let min = Math.floor(duration / 60);
  duration = duration % 60;

  let sec = Math.floor(duration);

  if (min < 1) {
    return `${sec}s`;
  } else {
    return `${min}m ${sec}s`;
  }
}

function escapeContent(content: string) {
  const regex = /\_|\*|\[|\]|\(|\)|\~|\`|\>|\#|\+|\-|\=|\{|\}|\.|\!|\|/g;
  return content.replace(regex, `\\\$&`);
}

function getMessageOnMergeRequest(body: NowRequestBody) {
  const { user, project, object_attributes } = body;

  const projectName = escapeContent(project.name);
  const username = escapeContent(user.name);
  const title = escapeContent(object_attributes.title);
  const mergeRequestLink = `[\\#${object_attributes.iid} ${projectName}](${object_attributes.url})`;

  switch (object_attributes.action) {
    case "merge":
      return `🆒 Applied the upgrade ${mergeRequestLink}\n`;
    case "approved":
      return `🆗 *${username}* agreed the ${mergeRequestLink} upgrade\n`;
    case "reopen":
      return `🔃 *${username}* want to retry the ${mergeRequestLink} upgrade\n`;
    case "update":
      return [
        `🆙 *${username}* updated the ${mergeRequestLink}\n`,
        `\n`,
        `_${escapeContent(object_attributes.last_commit.message)}_`,
        `\n`,
        `${escapeContent(object_attributes.description)}\n`,
      ].join("");
    case "open":
      return [
        `🆕 *${username}* want to upgrade the [${projectName}](${project.web_url}) airplane\n`,
        `\n`,
        `*[\\#${object_attributes.iid} ${title}](${object_attributes.url})*\n`,
        `\n`,
        `${escapeContent(object_attributes.description)}`,
      ].join("");
    case "close":
      return `🚮 *${username}* cancelled the upgrade ${mergeRequestLink}\n`;
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
      return [
        `🛬 Flight test ${pipelineUrl} landed after ${duration}\n`,
        `Carrier *${projectName}*\n`,
        `Captain *${username}*\n`,
        `Journey *${ref}*\n`,
      ].join("");
    case "failed":
      return [
        `💥 Flight test ${pipelineUrl} crashed after ${duration}\n`,
        `Carrier *${projectName}*\n`,
        `Captain *${username}*\n`,
        `Journey *${ref}*\n`,
      ].join("");
    case "running":
      return [
        `🛫 Flight test ${pipelineUrl} is taking off\n`,
        `Carrier *${projectName}*\n`,
        `Captain *${username}*\n`,
        `Journey *${ref}*\n`,
      ].join("");

    case "pending":
    default:
      return "";
  }
}

function getMessageOnComment(body: NowRequestBody) {
  const { object_attributes, project, user, merge_request } = body;

  const username = escapeContent(user.name);
  const projectName = escapeContent(project.name);

  switch (object_attributes.noteable_type) {
    case "MergeRequest":
      // We only want to trigger on Overview comments, not on Changes
      if (!object_attributes.type) {
        return [
          `💬 *${username}* commented on [\\#${merge_request.iid} ${projectName}](${object_attributes.url})\n`,
          `\n`,
          `_${escapeContent(object_attributes.note)}_`,
        ].join("");
      }

      return "";
    case "Snippet":
    case "Issue":
    case "Commit":
    default:
      return "";
  }
}

function getMessageOnIssue(body: NowRequestBody) {
  const { user, object_attributes, project } = body;

  const username = escapeContent(user.name);
  const projectName = escapeContent(project.name);
  const title = escapeContent(object_attributes.title);

  switch (object_attributes.action) {
    case "open":
      return [
        `⚠️ *${username}* has opened an issue on *${projectName}*\n`,
        `\n`,
        `*[\\#${object_attributes.iid} ${title}](${object_attributes.url})*`,
        `\n`,
        `${escapeContent(object_attributes.description)}`,
      ].join("");
    case "close":
      return [
        `🚮 *${username}* has closed an issue on *${projectName}*\n`,
        `\n`,
        `*[\\#${object_attributes.iid} ${title}](${object_attributes.url})*`,
      ].join("");
    case "update":
    default:
      return ``;
  }
}

function getBodyText(event: string | string[], body: NowRequestBody) {
  switch (event) {
    case GitlabEvents.Merge:
      return getMessageOnMergeRequest(body);
    case GitlabEvents.Pipeline:
      return getMessageOnPipeline(body);
    case GitlabEvents.Comment:
      return getMessageOnComment(body);
    case GitlabEvents.Issue:
      return getMessageOnIssue(body);
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

  // If you specify a secret token, it will be sent with the hook request in the X-Gitlab-Token HTTP header.
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

  // When GitLab sends a webhook, it expects a response in 10 seconds by default.
  // If it does not receive one, it retries the webhook.
  // If the endpoint doesn’t send its HTTP response within those 10 seconds, GitLab may decide the hook failed and retry it.
  return response.status(teleResponse.status).json(data);
};

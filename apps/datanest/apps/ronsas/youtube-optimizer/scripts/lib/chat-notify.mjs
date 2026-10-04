/**
 * Minimal chat notifier for CI: posts the same message to Slack and/or
 * Microsoft Teams Incoming Webhooks.
 *
 * Env:
 *   SLACK_WEBHOOK_URL   Slack Incoming Webhook (optional)
 *   TEAMS_WEBHOOK_URL   Teams Incoming Webhook / Workflows URL (optional)
 *
 * Both are optional — when neither is set the call is a no-op. Transport or
 * non-2xx responses are logged only: a notification problem must never turn
 * into an extra CI failure.
 */

/**
 * @param {object} msg
 * @param {string} msg.title            headline, e.g. "CI failing repeatedly on PR #12"
 * @param {string} [msg.subtitle]       one-line context (markdown allowed)
 * @param {[string, string][]} [msg.links]  [label, url] pairs; empty urls are dropped
 * @param {[string, string][]} [msg.metrics]  [label, value] rows rendered as a
 *   compact metrics table (Slack section list / Teams FactSet); values may
 *   contain Slack mrkdwn or markdown links respectively
 * @param {string} [msg.buttonUrl]      primary "open" link
 * @param {string} [msg.buttonText]     label for the primary link
 */
export async function notifyChat(msg) {
  const slack = process.env["SLACK_WEBHOOK_URL"]?.trim();
  const teams = process.env["TEAMS_WEBHOOK_URL"]?.trim();
  if (!slack && !teams) {
    console.log("[notify] no SLACK_WEBHOOK_URL / TEAMS_WEBHOOK_URL — skipping chat notification.");
    return;
  }

  const links = (msg.links ?? []).filter(([, url]) => url);
  const metrics = (msg.metrics ?? []).filter(([label, value]) => label && value);
  const buttonText = msg.buttonText ?? "Open";

  if (slack) {
    const linkLine = links.length
      ? links.map(([label, url]) => `<${url}|${label}>`).join("  ·  ")
      : "_No artifacts were produced._";
    await post("slack", slack, {
      text: msg.title,
      blocks: [
        { type: "section", text: { type: "mrkdwn", text: `:rotating_light: *${msg.title}*` } },
        ...(msg.subtitle
          ? [{ type: "section", text: { type: "mrkdwn", text: msg.subtitle } }]
          : []),
        ...(metrics.length
          ? [
              {
                type: "section",
                text: {
                  type: "mrkdwn",
                  text: `*Metrics:*\n${metrics.map(([l, v]) => `• *${l}:* ${v}`).join("\n")}`,
                },
              },
            ]
          : []),
        { type: "section", text: { type: "mrkdwn", text: `*Diagnostics:*\n${linkLine}` } },
        ...(msg.buttonUrl
          ? [
              {
                type: "actions",
                elements: [
                  {
                    type: "button",
                    text: { type: "plain_text", text: buttonText },
                    url: msg.buttonUrl,
                  },
                ],
              },
            ]
          : []),
      ],
    });
  }

  if (teams) {
    const body = [
      { type: "TextBlock", text: msg.title, weight: "Bolder", size: "Medium", wrap: true },
      ...(msg.subtitle ? [{ type: "TextBlock", text: msg.subtitle, wrap: true, isSubtle: true }] : []),
      ...(metrics.length
        ? [
            { type: "TextBlock", text: "Metrics", weight: "Bolder", wrap: true },
            { type: "FactSet", facts: metrics.map(([title, value]) => ({ title, value })) },
          ]
        : []),
      ...(links.length
        ? [
            {
              type: "TextBlock",
              text: links.map(([label, url]) => `[${label}](${url})`).join(" · "),
              wrap: true,
            },
          ]
        : []),
    ];
    await post("teams", teams, {
      type: "message",
      attachments: [
        {
          contentType: "application/vnd.microsoft.card.adaptive",
          content: {
            $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
            type: "AdaptiveCard",
            version: "1.4",
            body,
            ...(msg.buttonUrl
              ? { actions: [{ type: "Action.OpenUrl", title: buttonText, url: msg.buttonUrl }] }
              : {}),
          },
        },
      ],
    });
  }
}

async function post(kind, url, payload) {
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const text = await res.text();
    if (!res.ok) {
      console.error(`[notify:${kind}] webhook failed [${res.status}]: ${text.slice(0, 500)}`);
      return;
    }
    console.log(`[notify:${kind}] notification sent.`);
  } catch (err) {
    console.error(`[notify:${kind}] request error: ${err.message}`);
  }
}

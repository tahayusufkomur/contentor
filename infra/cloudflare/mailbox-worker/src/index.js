import PostalMime from "postal-mime";

function toHex(buf) {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function sign(secret, body) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body));
  return toHex(sig);
}

export default {
  async email(message, env) {
    const parsed = await PostalMime.parse(message.raw);
    const payload = JSON.stringify({
      from: message.from,
      to: message.to,
      subject: parsed.subject || "",
      text: parsed.text || "",
      html: parsed.html || "",
      message_id: parsed.messageId || "",
      in_reply_to: parsed.inReplyTo || "",
      references: Array.isArray(parsed.references)
        ? parsed.references.join(" ")
        : parsed.references || "",
    });
    const signature = await sign(env.MAILBOX_INBOUND_SECRET, payload);
    const resp = await fetch(env.WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Mailbox-Signature": signature },
      body: payload,
    });
    // On webhook failure, log and (for 5xx) reject so Cloudflare retries / the sender is notified.
    if (!resp.ok) {
      console.error(`mailbox inbound webhook returned ${resp.status}`);
      if (resp.status >= 500) {
        message.setReject("Temporary failure delivering to mailbox");
      }
    }
  },
};

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

const MAX_FILE_BYTES = 10 * 1024 * 1024;
const MAX_TOTAL_BYTES = 20 * 1024 * 1024;

function toBase64(u8) {
  let s = "";
  const chunk = 0x8000;
  for (let i = 0; i < u8.length; i += chunk) {
    s += String.fromCharCode(...u8.subarray(i, i + chunk));
  }
  return btoa(s);
}

function packAttachments(parsedAttachments) {
  const out = [];
  let total = 0;
  for (const a of parsedAttachments || []) {
    const content = a.content instanceof ArrayBuffer ? new Uint8Array(a.content) : null;
    const size = content ? content.length : 0;
    const base = {
      filename: a.filename || "attachment",
      content_type: a.mimeType || "",
      size,
    };
    if (!content || size > MAX_FILE_BYTES || total + size > MAX_TOTAL_BYTES) {
      out.push({ ...base, omitted: true });
      continue;
    }
    total += size;
    out.push({ ...base, content_b64: toBase64(content) });
  }
  return out;
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
      attachments: packAttachments(parsed.attachments),
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

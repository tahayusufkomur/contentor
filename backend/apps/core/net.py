"""Client-IP resolution behind the Cloudflare tunnel.

Prod topology: Cloudflare edge → cloudflared tunnel → Caddy → Django, with
no published origin ports — so CF-Connecting-IP cannot be spoofed end-to-end.
Dev hits REMOTE_ADDR directly."""


def client_ip(request):
    cf = request.META.get("HTTP_CF_CONNECTING_IP")
    if cf:
        return cf.strip()
    xff = request.META.get("HTTP_X_FORWARDED_FOR")
    if xff:
        return xff.split(",")[0].strip()
    return request.META.get("REMOTE_ADDR", "")

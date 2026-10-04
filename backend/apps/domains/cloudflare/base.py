from __future__ import annotations


class CloudflareError(Exception):
    def __init__(self, message: str, *, code: str = "CLOUDFLARE_ERROR") -> None:
        super().__init__(message)
        self.code = code

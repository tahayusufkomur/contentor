#!/usr/bin/env python3
"""Mirror the real demo/* objects from the prod bucket into dev MinIO.

Host-run (NOT inside docker): reads SOURCE (prod) creds from .env.prod and
DEST (dev MinIO) config from .env, then copies demo/photos/* and
demo/videos/* so locally-seeded tenants get the exact media prod shows.

The prod bucket is READ-ONLY source. Writes are refused to any endpoint
that doesn't look like local MinIO. Idempotent: existing keys are skipped
unless --force.

Usage:
    python3 scripts/mirror_demo_assets.py [--force] [--dry-run] [--prefix demo/photos/]

Design: docs/superpowers/specs/2026-07-04-dev-demo-assets-design.md
"""

import argparse
import sys
from pathlib import Path

try:
    import boto3
    from botocore.config import Config
    from botocore.exceptions import ClientError
except ImportError:
    sys.exit("boto3 is required on the host: pip3 install boto3")

REPO_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_PREFIXES = ("demo/photos/", "demo/videos/")


def load_env(path: Path) -> dict:
    if not path.exists():
        sys.exit(f"Missing {path} — cannot read bucket config.")
    env = {}
    for line in path.read_text().splitlines():
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            key, _, value = line.partition("=")
            env[key.strip()] = value.strip().strip("'\"")
    return env


def require(env: dict, keys: list[str], source: str) -> None:
    missing = [k for k in keys if not env.get(k)]
    if missing:
        sys.exit(f"{source} is missing required vars: {', '.join(missing)}")


def s3_client(endpoint: str, access_key: str, secret_key: str):
    return boto3.client(
        "s3",
        aws_access_key_id=access_key,
        aws_secret_access_key=secret_key,
        endpoint_url=endpoint,
        # Path-style + v4 keep MinIO happy and are harmless for Hetzner
        # (same choice as backend/apps/core/storage.py).
        config=Config(signature_version="s3v4", s3={"addressing_style": "path"}),
    )


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--force", action="store_true", help="re-copy keys that already exist in dest")
    parser.add_argument("--dry-run", action="store_true", help="list what would be copied, copy nothing")
    parser.add_argument(
        "--prefix",
        action="append",
        help=f"source prefix to mirror (repeatable; default: {', '.join(DEFAULT_PREFIXES)})",
    )
    args = parser.parse_args()
    prefixes = tuple(args.prefix) if args.prefix else DEFAULT_PREFIXES

    src_path = REPO_ROOT / ".env.prod"
    if not src_path.exists():
        # Expected on machines without prod creds — skip quietly (exit 0) so
        # `make dev` isn't blocked. Any REAL failure below exits non-zero.
        print("NOTE: .env.prod not found — skipping demo-asset mirror; seeded media will 404 until 'make seed-demo-assets' runs on a machine with prod creds.")
        return 0
    src_env = load_env(src_path)
    dst_env = load_env(REPO_ROOT / ".env")
    require(src_env, ["AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY", "AWS_ENDPOINT", "AWS_BUCKET_NAME"], ".env.prod")
    require(
        dst_env,
        ["AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY", "AWS_ENDPOINT_EXTERNAL", "AWS_BUCKET_NAME"],
        ".env",
    )

    dst_endpoint = dst_env["AWS_ENDPOINT_EXTERNAL"]
    # HARD GUARD: only ever write to local MinIO. Never a real/prod endpoint.
    if not ("localhost" in dst_endpoint or "minio" in dst_endpoint or "127.0.0.1" in dst_endpoint):
        sys.exit(f"Refusing to write: dest endpoint {dst_endpoint!r} does not look like local MinIO.")
    if dst_endpoint == src_env["AWS_ENDPOINT"]:
        sys.exit("Refusing to run: source and dest endpoints are identical.")

    src = s3_client(src_env["AWS_ENDPOINT"], src_env["AWS_ACCESS_KEY_ID"], src_env["AWS_SECRET_ACCESS_KEY"])
    dst = s3_client(dst_endpoint, dst_env["AWS_ACCESS_KEY_ID"], dst_env["AWS_SECRET_ACCESS_KEY"])
    src_bucket = src_env["AWS_BUCKET_NAME"]
    dst_bucket = dst_env["AWS_BUCKET_NAME"]

    try:
        dst.head_bucket(Bucket=dst_bucket)
    except ClientError:
        # Bucket missing (fresh volume, minio-init not run yet) — create it.
        # Safe: the endpoint guard above guarantees dest is local MinIO only.
        try:
            dst.create_bucket(Bucket=dst_bucket)
            print(f"created dest bucket {dst_bucket!r}")
        except Exception as e:
            sys.exit(f"Dev MinIO bucket {dst_bucket!r} unreachable at {dst_endpoint} — is the dev stack up? (make dev): {e}")
    except Exception:
        sys.exit(f"Dev MinIO unreachable at {dst_endpoint} — is the dev stack up? (make dev)")

    copied = skipped = failed = bytes_copied = 0
    for prefix in prefixes:
        paginator = src.get_paginator("list_objects_v2")
        for page in paginator.paginate(Bucket=src_bucket, Prefix=prefix):
            for obj in page.get("Contents", []):
                key = obj["Key"]
                if key.endswith("/"):  # prefix marker, not an object
                    continue
                if not args.force:
                    try:
                        dst.head_object(Bucket=dst_bucket, Key=key)
                        skipped += 1
                        continue
                    except ClientError as e:
                        if e.response["Error"]["Code"] not in ("404", "NoSuchKey"):
                            raise
                if args.dry_run:
                    print(f"would copy {key} ({obj['Size'] / 1e6:.1f} MB)")
                    copied += 1
                    continue
                try:
                    body = src.get_object(Bucket=src_bucket, Key=key)
                    dst.put_object(
                        Bucket=dst_bucket,
                        Key=key,
                        Body=body["Body"].read(),
                        ContentType=body.get("ContentType", "application/octet-stream"),
                    )
                    copied += 1
                    bytes_copied += obj["Size"]
                    print(f"copied  {key} ({obj['Size'] / 1e6:.1f} MB)")
                except Exception as e:  # keep going; report at end
                    failed += 1
                    print(f"FAILED  {key}: {e}", file=sys.stderr)

    verb = "would copy" if args.dry_run else "copied"
    print(f"\n{verb} {copied}, skipped {skipped}, failed {failed} ({bytes_copied / 1e6:.1f} MB)")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())

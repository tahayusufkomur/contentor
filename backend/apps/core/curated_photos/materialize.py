"""Copy-on-use: turn a public-schema CuratedPhoto into a tenant media.Photo.

The Photo row points at the SHARED platform object (no storage duplication).
Deleting the tenant Photo later never touches storage (media has no S3 delete
hook), and catalog rows are only ever disabled — so the reference cannot break.
"""


def materialize_curated_photo(row):
    """Create (or reuse, dedup by s3_key) a Photo in the CURRENT tenant
    schema. Callers must already be inside the tenant context. Function-local
    import: core is SHARED_APPS, media is TENANT_APPS."""
    from apps.media.models import Photo

    existing = Photo.objects.filter(s3_key=row.image_key).first()
    if existing is not None:
        return existing
    return Photo.objects.create(
        s3_key=row.image_key,
        title=row.title,
        alt_text=row.alt_text,
        content_type="image/png",
        width=row.width,
        height=row.height,
    )

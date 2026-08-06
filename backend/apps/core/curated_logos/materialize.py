"""Copy-on-use: turn a public-schema CuratedLogo into a tenant media.Photo.

Same non-duplicating reference model as curated_photos/materialize.py.
CuratedLogo carries no width/height/alt_text — media.Photo allows null dims,
so those land as None/row.title respectively.
"""


def materialize_curated_logo(row):
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
        alt_text=row.title,
        content_type="image/png",
        width=None,
        height=None,
    )

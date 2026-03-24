from django.db import migrations


def backfill_logo_and_sections(apps, schema_editor):
    Photo = apps.get_model("media", "Photo")
    TenantConfig = apps.get_model("tenant_config", "TenantConfig")

    for config in TenantConfig.objects.all():
        changed = False

        # Backfill logo
        if config.logo_url and not config.logo_id:
            photo = Photo.objects.create(s3_key=config.logo_url, title="Logo")
            config.logo = photo
            changed = True

        # Backfill landing_sections image references
        sections = config.landing_sections
        if isinstance(sections, dict):
            # Hero bg_image_url
            hero = sections.get("hero")
            if isinstance(hero, dict) and hero.get("bg_image_url") and not hero.get("bg_image_photo_id"):
                photo = Photo.objects.create(s3_key=hero["bg_image_url"], title="Hero background")
                hero["bg_image_photo_id"] = str(photo.pk)
                changed = True

            # About image_url
            about = sections.get("about")
            if isinstance(about, dict) and about.get("image_url") and not about.get("image_photo_id"):
                photo = Photo.objects.create(s3_key=about["image_url"], title="About image")
                about["image_photo_id"] = str(photo.pk)
                changed = True

        if changed:
            config.save()


class Migration(migrations.Migration):
    dependencies = [
        ("tenant_config", "0007_tenantconfig_logo"),
        ("media", "0001_initial"),
    ]

    operations = [
        migrations.RunPython(backfill_logo_and_sections, migrations.RunPython.noop),
    ]

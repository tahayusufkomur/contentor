from django.db import migrations

END = "__end__"  # interview_slides.END: no slide is due any more


def baseline(apps, schema_editor):
    """Setups already under way get no slide for a question already behind them."""
    TenantConfig = apps.get_model("tenant_config", "TenantConfig")
    for config in TenantConfig.objects.all():
        iv = (config.setup_flow or {}).get("interview")
        if not iv or not iv.get("turns") or "slides" in iv or "slides_from" in iv:
            continue
        iv["slides_from"] = iv.get("asked") or END
        config.save(update_fields=["setup_flow"])


class Migration(migrations.Migration):
    dependencies = [
        ("tenant_config", "0035_focuscreation_covers"),
    ]

    operations = [
        migrations.RunPython(baseline, migrations.RunPython.noop),
    ]

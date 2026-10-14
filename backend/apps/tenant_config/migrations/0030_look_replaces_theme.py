"""The look (``style`` + ``palette``) is the only site theme: a site still on
the legacy ``theme``/``font_family`` pair takes its niche's best look, then
both columns go. Runs in each tenant schema via ``migrate_schemas``.
"""

from django.db import migrations


def give_every_site_a_look(apps, schema_editor):
    from apps.tenant_config import sections

    TenantConfig = apps.get_model("tenant_config", "TenantConfig")
    configs = list(TenantConfig.objects.filter(style=""))
    if not configs:
        return
    niche = "general"
    schema = getattr(schema_editor.connection, "schema_name", "")
    with schema_editor.connection.cursor() as cursor:
        cursor.execute("SELECT template_niche FROM public.core_tenant WHERE schema_name = %s", [schema])
        row = cursor.fetchone()
        if row and row[0]:
            niche = row[0]
    style = sections.default_style(niche)
    for config in configs:
        config.style = style
        config.palette = ""
        config.pages = sections.restyle_pages(config.pages or {}, style)
        config.save(update_fields=["style", "palette", "pages"])


class Migration(migrations.Migration):
    dependencies = [
        ("tenant_config", "0029_delete_logocandidate"),
    ]

    operations = [
        migrations.RunPython(give_every_site_a_look, migrations.RunPython.noop),
        migrations.RemoveField(model_name="tenantconfig", name="theme"),
        migrations.RemoveField(model_name="tenantconfig", name="font_family"),
    ]

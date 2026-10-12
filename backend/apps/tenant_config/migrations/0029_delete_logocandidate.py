from django.db import migrations


class Migration(migrations.Migration):
    dependencies = [
        ("tenant_config", "0028_logocandidate"),
    ]

    operations = [
        migrations.DeleteModel(name="LogoCandidate"),
    ]

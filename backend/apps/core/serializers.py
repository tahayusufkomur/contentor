from rest_framework import serializers


class CreatorSignupSerializer(serializers.Serializer):
    email = serializers.EmailField()
    name = serializers.CharField(max_length=150)
    # The temporary address an earlier send of this signup got: a resend keeps it.
    site = serializers.CharField(required=False, allow_blank=True, default="", max_length=63)
    # The creator's language (the page's) and the site's; anything else resolves to English.
    locale = serializers.CharField(required=False, allow_blank=True, default="", max_length=10)
    site_locale = serializers.CharField(required=False, allow_blank=True, default="", max_length=10)

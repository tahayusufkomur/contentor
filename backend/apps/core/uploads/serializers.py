from rest_framework import serializers

from apps.core.storage import is_blocked_content_type, is_tenant_scoped_key


def _validate_content_type(value):
    if is_blocked_content_type(value):
        raise serializers.ValidationError("This content type is not allowed for uploads.")
    return value


def _validate_tenant_s3_key(value):
    if not is_tenant_scoped_key(value):
        raise serializers.ValidationError("s3_key must be within this tenant's storage.")
    return value


class PresignRequestSerializer(serializers.Serializer):
    filename = serializers.CharField(max_length=255)
    content_type = serializers.CharField(max_length=100)
    category = serializers.ChoiceField(choices=["video", "download", "branding", "library", "photo"])
    course_slug = serializers.CharField(max_length=200, required=False)
    lesson_id = serializers.IntegerField(required=False)
    file_id = serializers.IntegerField(required=False)
    video_id = serializers.IntegerField(required=False)

    def validate_content_type(self, value):
        return _validate_content_type(value)


class UploadCompleteSerializer(serializers.Serializer):
    s3_key = serializers.CharField(max_length=500)
    category = serializers.ChoiceField(choices=["video", "download", "branding", "library", "photo"])

    def validate_s3_key(self, value):
        return _validate_tenant_s3_key(value)

    lesson_id = serializers.IntegerField(required=False)
    download_id = serializers.IntegerField(required=False)
    video_id = serializers.IntegerField(required=False)
    file_size = serializers.IntegerField(required=False)
    duration_seconds = serializers.IntegerField(required=False)

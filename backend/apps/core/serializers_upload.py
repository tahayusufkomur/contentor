from rest_framework import serializers


class PresignRequestSerializer(serializers.Serializer):
    filename = serializers.CharField(max_length=255)
    content_type = serializers.CharField(max_length=100)
    category = serializers.ChoiceField(choices=["video", "download", "branding"])
    course_slug = serializers.CharField(max_length=200, required=False)
    lesson_id = serializers.IntegerField(required=False)
    file_id = serializers.IntegerField(required=False)


class UploadCompleteSerializer(serializers.Serializer):
    s3_key = serializers.CharField(max_length=500)
    category = serializers.ChoiceField(choices=["video", "download", "branding"])
    lesson_id = serializers.IntegerField(required=False)
    download_id = serializers.IntegerField(required=False)
    file_size = serializers.IntegerField(required=False)
    duration_seconds = serializers.IntegerField(required=False)

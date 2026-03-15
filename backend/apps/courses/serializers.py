from rest_framework import serializers

from apps.core.access import can_access
from apps.core.storage import generate_presigned_download_url

from .models import Course, Enrollment, Lesson, Module, Progress


class LessonSerializer(serializers.ModelSerializer):
    video_signed_url = serializers.SerializerMethodField()

    class Meta:
        model = Lesson
        fields = [
            "id",
            "module",
            "title",
            "order",
            "video_url",
            "duration_seconds",
            "content_html",
            "is_free_preview",
            "video_signed_url",
        ]
        read_only_fields = ["id"]

    def get_video_signed_url(self, obj):
        if not obj.video_url:
            return None
        request = self.context.get("request")
        if not request or not request.user.is_authenticated:
            return None
        user = request.user
        # Owners and coaches always get signed URLs
        if user.role in ("owner", "coach"):
            return generate_presigned_download_url(obj.video_url)
        # Enrolled students get signed URLs
        course = obj.module.course
        if Enrollment.objects.filter(user=user, course=course).exists():
            return generate_presigned_download_url(obj.video_url)
        # Free preview lessons get signed URLs for authenticated users
        if obj.is_free_preview:
            return generate_presigned_download_url(obj.video_url)
        return None


class ModuleSerializer(serializers.ModelSerializer):
    lessons = LessonSerializer(many=True, read_only=True)

    class Meta:
        model = Module
        fields = ["id", "course", "title", "order", "lessons"]
        read_only_fields = ["id"]


class CourseListSerializer(serializers.ModelSerializer):
    lesson_count = serializers.SerializerMethodField()
    enrolled_count = serializers.SerializerMethodField()

    class Meta:
        model = Course
        fields = [
            "id",
            "title",
            "slug",
            "description",
            "instructor",
            "thumbnail_url",
            "price",
            "pricing_type",
            "is_published",
            "order",
            "created_at",
            "updated_at",
            "lesson_count",
            "enrolled_count",
        ]
        read_only_fields = ["id", "slug", "created_at", "updated_at"]

    def get_lesson_count(self, obj):
        return Lesson.objects.filter(module__course=obj).count()

    def get_enrolled_count(self, obj):
        return obj.enrollments.count()


class CourseDetailSerializer(serializers.ModelSerializer):
    modules = serializers.SerializerMethodField()
    is_enrolled = serializers.SerializerMethodField()
    lesson_count = serializers.SerializerMethodField()
    enrolled_count = serializers.SerializerMethodField()

    class Meta:
        model = Course
        fields = [
            "id",
            "title",
            "slug",
            "description",
            "instructor",
            "thumbnail_url",
            "price",
            "pricing_type",
            "is_published",
            "order",
            "created_at",
            "updated_at",
            "modules",
            "is_enrolled",
            "lesson_count",
            "enrolled_count",
        ]
        read_only_fields = ["id", "slug", "created_at", "updated_at"]

    def get_modules(self, obj):
        modules = obj.modules.all()
        return ModuleSerializer(modules, many=True, context=self.context).data

    def get_is_enrolled(self, obj):
        request = self.context.get("request")
        if not request or not request.user.is_authenticated:
            return False
        return Enrollment.objects.filter(user=request.user, course=obj).exists()

    def get_lesson_count(self, obj):
        return Lesson.objects.filter(module__course=obj).count()

    def get_enrolled_count(self, obj):
        return obj.enrollments.count()


class CourseCreateUpdateSerializer(serializers.ModelSerializer):
    class Meta:
        model = Course
        fields = [
            "title",
            "description",
            "thumbnail_url",
            "price",
            "pricing_type",
            "is_published",
            "order",
        ]


class ModuleCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model = Module
        fields = ["title", "order"]


class LessonCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model = Lesson
        fields = [
            "title",
            "order",
            "video_url",
            "duration_seconds",
            "content_html",
            "is_free_preview",
        ]


class EnrollmentSerializer(serializers.ModelSerializer):
    class Meta:
        model = Enrollment
        fields = ["id", "user", "course", "enrolled_at", "payment_id"]
        read_only_fields = ["id", "user", "course", "enrolled_at"]


class ProgressUpdateSerializer(serializers.ModelSerializer):
    class Meta:
        model = Progress
        fields = ["completed", "watched_seconds"]

from dataclasses import asdict

from django.db import transaction
from django.db.models import Prefetch
from rest_framework import serializers

from apps.core.access import AccessInfo, ContentAccessService, content_currency
from apps.core.storage import generate_presigned_download_url, sign_if_s3_key
from apps.filters.models import FilterOption
from apps.filters.serializers import FilterOptionSerializer
from apps.tags.serializers import TagSerializer, tag_ids_field

from .models import Course, Enrollment, Lesson, Module, Progress, Video


class LessonSerializer(serializers.ModelSerializer):
    video_signed_url = serializers.SerializerMethodField()
    video_url = serializers.SerializerMethodField()
    duration_seconds = serializers.SerializerMethodField()
    content_html = serializers.SerializerMethodField()

    class Meta:
        model = Lesson
        fields = [
            "id",
            "module",
            "title",
            "order",
            "video_id",
            "video_url",
            "duration_seconds",
            "content_html",
            "is_free_preview",
            "video_signed_url",
        ]
        read_only_fields = ["id"]

    def _get_s3_key(self, obj):
        if obj.video and obj.video.s3_key:
            return obj.video.s3_key
        return obj.video_url

    def get_video_url(self, obj):
        return self._get_s3_key(obj)

    def get_duration_seconds(self, obj):
        if obj.video and obj.video.duration_seconds:
            return obj.video.duration_seconds
        return obj.duration_seconds

    def _is_unlocked(self, obj) -> bool:
        """Whether the requester may see this lesson's paid content (video AND
        written body). Mirrors the access decision made by CourseDetailSerializer,
        which passes `course_has_access` in context."""
        if obj.is_free_preview:
            return True
        request = self.context.get("request")
        if not request or not request.user.is_authenticated:
            return False
        if request.user.role in ("owner", "coach"):
            return True
        return bool(self.context.get("course_has_access"))

    def get_content_html(self, obj):
        # The lesson body is paid content just like the video — don't leak it
        # to visitors/students who haven't unlocked the course.
        return obj.content_html if self._is_unlocked(obj) else ""

    def get_video_signed_url(self, obj):
        s3_key = self._get_s3_key(obj)
        if not s3_key:
            return None
        request = self.context.get("request")
        if not request or not request.user.is_authenticated:
            return None
        if self._is_unlocked(obj):
            return generate_presigned_download_url(s3_key)
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
    thumbnail_signed_url = serializers.SerializerMethodField()
    access_info = serializers.SerializerMethodField()
    filter_options = FilterOptionSerializer(many=True, read_only=True)
    tags = TagSerializer(many=True, read_only=True)

    class Meta:
        model = Course
        fields = [
            "id",
            "title",
            "slug",
            "description",
            "instructor",
            "thumbnail_url",
            "thumbnail_id",
            "price",
            "pricing_type",
            "is_published",
            "order",
            "created_at",
            "updated_at",
            "lesson_count",
            "enrolled_count",
            "thumbnail_signed_url",
            "access_info",
            "filter_options",
            "tags",
        ]
        read_only_fields = ["id", "slug", "created_at", "updated_at"]

    def get_lesson_count(self, obj):
        return Lesson.objects.filter(module__course=obj).count()

    def get_enrolled_count(self, obj):
        return obj.enrollments.count()

    def get_thumbnail_signed_url(self, obj):
        if obj.thumbnail_id and obj.thumbnail and obj.thumbnail.s3_key:
            return generate_presigned_download_url(obj.thumbnail.s3_key)
        return sign_if_s3_key(obj.thumbnail_url)

    def get_access_info(self, obj):
        access_map = self.context.get("access_map")
        if access_map and obj.pk in access_map:
            return asdict(access_map[obj.pk])
        request = self.context.get("request")
        if not request or not request.user.is_authenticated:
            pricing_type = obj.pricing_type
            if pricing_type == "free":
                return asdict(AccessInfo(has_access=True, pricing_type=pricing_type, access_reason="free"))
            return asdict(
                AccessInfo(
                    has_access=False,
                    pricing_type=pricing_type,
                    price=obj.price,
                    currency=content_currency(obj),
                    unlock_methods=["purchase"],
                )
            )
        service = ContentAccessService()
        return asdict(service.get_access_info(request.user, obj))


class CourseDetailSerializer(serializers.ModelSerializer):
    modules = serializers.SerializerMethodField()
    is_enrolled = serializers.SerializerMethodField()
    lesson_count = serializers.SerializerMethodField()
    enrolled_count = serializers.SerializerMethodField()
    thumbnail_signed_url = serializers.SerializerMethodField()
    access_info = serializers.SerializerMethodField()
    unlock_options = serializers.SerializerMethodField()
    filter_options = FilterOptionSerializer(many=True, read_only=True)
    tags = TagSerializer(many=True, read_only=True)

    class Meta:
        model = Course
        fields = [
            "id",
            "title",
            "slug",
            "description",
            "instructor",
            "thumbnail_url",
            "thumbnail_id",
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
            "thumbnail_signed_url",
            "access_info",
            "unlock_options",
            "filter_options",
            "tags",
        ]
        read_only_fields = ["id", "slug", "created_at", "updated_at"]

    def get_modules(self, obj):
        request = self.context.get("request")
        course_has_access = False
        if request and request.user.is_authenticated:
            service = ContentAccessService()
            course_has_access = service.check_access(request.user, obj)
        modules = obj.modules.prefetch_related(
            Prefetch("lessons", queryset=Lesson.objects.select_related("video"))
        ).all()
        return ModuleSerializer(
            modules, many=True, context={**self.context, "course_has_access": course_has_access}
        ).data

    def get_access_info(self, obj):
        access_map = self.context.get("access_map")
        if access_map and obj.pk in access_map:
            return asdict(access_map[obj.pk])
        request = self.context.get("request")
        if not request or not request.user.is_authenticated:
            pricing_type = obj.pricing_type
            if pricing_type == "free":
                return asdict(AccessInfo(has_access=True, pricing_type=pricing_type, access_reason="free"))
            return asdict(
                AccessInfo(
                    has_access=False,
                    pricing_type=pricing_type,
                    price=obj.price,
                    currency=content_currency(obj),
                    unlock_methods=["purchase"],
                )
            )
        service = ContentAccessService()
        return asdict(service.get_access_info(request.user, obj))

    def get_unlock_options(self, obj):
        service = ContentAccessService()
        return service.get_unlock_options(obj)

    def get_is_enrolled(self, obj):
        request = self.context.get("request")
        if not request or not request.user.is_authenticated:
            return False
        return Enrollment.objects.filter(user=request.user, course=obj).exists()

    def get_lesson_count(self, obj):
        return Lesson.objects.filter(module__course=obj).count()

    def get_enrolled_count(self, obj):
        return obj.enrollments.count()

    def get_thumbnail_signed_url(self, obj):
        if obj.thumbnail_id and obj.thumbnail and obj.thumbnail.s3_key:
            return generate_presigned_download_url(obj.thumbnail.s3_key)
        return sign_if_s3_key(obj.thumbnail_url)


class _NestedLessonSerializer(serializers.ModelSerializer):
    """Lesson payload inside a nested course create. Order is positional."""

    class Meta:
        model = Lesson
        fields = [
            "title",
            "video",
            "video_url",
            "duration_seconds",
            "content_html",
            "is_free_preview",
        ]


class _NestedModuleSerializer(serializers.Serializer):
    """Module payload inside a nested course create. Order is positional."""

    title = serializers.CharField(max_length=200)
    lessons = _NestedLessonSerializer(many=True, required=False)


class CourseCreateUpdateSerializer(serializers.ModelSerializer):
    filter_option_ids = serializers.PrimaryKeyRelatedField(
        many=True,
        queryset=FilterOption.objects.all(),
        source="filter_options",
        required=False,
    )
    tag_ids = tag_ids_field("course")
    modules = _NestedModuleSerializer(many=True, required=False, write_only=True)

    class Meta:
        model = Course
        fields = [
            "title",
            "description",
            "thumbnail_url",
            "thumbnail",
            "price",
            "pricing_type",
            "is_published",
            "order",
            "filter_option_ids",
            "tag_ids",
            "modules",
        ]

    def validate_modules(self, value):
        if self.instance is not None:
            raise serializers.ValidationError(
                "Curriculum can only be set at creation. Use the module/lesson endpoints to edit."
            )
        return value

    def create(self, validated_data):
        modules_data = validated_data.pop("modules", [])
        with transaction.atomic():
            course = super().create(validated_data)
            for module_index, module_data in enumerate(modules_data, start=1):
                module = Module.objects.create(course=course, title=module_data["title"], order=module_index)
                for lesson_index, lesson_data in enumerate(module_data.get("lessons", []), start=1):
                    Lesson.objects.create(module=module, order=lesson_index, **lesson_data)
        return course


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
            "video",
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


class VideoSerializer(serializers.ModelSerializer):
    video_signed_url = serializers.SerializerMethodField()
    tags = TagSerializer(many=True, read_only=True)

    class Meta:
        model = Video
        fields = [
            "id",
            "title",
            "description",
            "s3_key",
            "duration_seconds",
            "file_size",
            "thumbnail_url",
            "video_signed_url",
            "tags",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "file_size", "created_at", "updated_at"]

    def get_video_signed_url(self, obj):
        if not obj.s3_key:
            return None
        return generate_presigned_download_url(obj.s3_key)


class VideoCreateSerializer(serializers.ModelSerializer):
    tag_ids = tag_ids_field("video")

    class Meta:
        model = Video
        fields = ["title", "description", "s3_key", "duration_seconds", "thumbnail_url", "tag_ids"]


class ProgressSerializer(serializers.ModelSerializer):
    class Meta:
        model = Progress
        fields = ["id", "lesson", "completed", "watched_seconds", "updated_at"]
        read_only_fields = ["id", "updated_at"]


class ProgressUpdateSerializer(serializers.ModelSerializer):
    class Meta:
        model = Progress
        fields = ["completed", "watched_seconds"]

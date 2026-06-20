from dataclasses import asdict

from django.db.models import Q
from django.shortcuts import get_object_or_404
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response

from apps.core.access import ContentAccessService
from apps.core.pagination import StandardPagination, apply_ordering
from apps.core.permissions import IsCoachOrOwner

from .models import Course, CourseCategory, Enrollment, Lesson, Module, Progress, Video
from .serializers import (
    CourseCategorySerializer,
    CourseCreateUpdateSerializer,
    CourseDetailSerializer,
    CourseListSerializer,
    EnrollmentSerializer,
    LessonCreateSerializer,
    ModuleCreateSerializer,
    ProgressUpdateSerializer,
    VideoCreateSerializer,
    VideoSerializer,
)

# ──────────────────────────────────────────────
# Course list / create
# ──────────────────────────────────────────────


@api_view(["GET", "POST"])
@permission_classes([AllowAny])
def course_list_create(request):
    if request.method == "GET":
        return _course_list(request)
    # POST requires coach or owner
    if not request.user.is_authenticated or request.user.role not in ("owner", "coach"):
        return Response({"detail": "Permission denied."}, status=status.HTTP_403_FORBIDDEN)
    return _course_create(request)


def _course_list(request):
    qs = Course.objects.all()

    # Unauthenticated users or students only see published courses
    if not request.user.is_authenticated or request.user.role not in ("owner", "coach"):
        qs = qs.filter(is_published=True)

    # Search filter
    search = request.query_params.get("search")
    if search:
        qs = qs.filter(Q(title__icontains=search) | Q(description__icontains=search))

    # Pricing type filter
    pricing_type = request.query_params.get("pricing_type")
    if pricing_type:
        qs = qs.filter(pricing_type=pricing_type)

    qs = apply_ordering(qs, request, ["title", "created_at"])
    paginate = "limit" in request.query_params or "offset" in request.query_params

    service = ContentAccessService() if request.user.is_authenticated else None

    if paginate:
        paginator = StandardPagination()
        page = paginator.paginate_queryset(qs, request)
        page_items = list(page)
        access_map = service.bulk_check_access(request.user, page_items) if service else {}
        serializer = CourseListSerializer(page_items, many=True, context={"request": request, "access_map": access_map})
        return paginator.get_paginated_response(serializer.data)

    access_map = service.bulk_check_access(request.user, qs) if service else {}
    serializer = CourseListSerializer(qs, many=True, context={"request": request, "access_map": access_map})
    return Response(serializer.data)


def _course_create(request):
    serializer = CourseCreateUpdateSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    course = serializer.save(instructor=request.user)
    return Response(
        CourseDetailSerializer(course, context={"request": request}).data,
        status=status.HTTP_201_CREATED,
    )


# ──────────────────────────────────────────────
# Course detail / update / delete
# ──────────────────────────────────────────────


@api_view(["GET", "PUT", "DELETE"])
@permission_classes([AllowAny])
def course_detail(request, slug):
    course = get_object_or_404(Course, slug=slug)

    if request.method == "GET":
        # Unpublished courses require coach or owner
        if not course.is_published:
            if not request.user.is_authenticated or request.user.role not in ("owner", "coach"):
                return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)
        serializer = CourseDetailSerializer(course, context={"request": request})
        return Response(serializer.data)

    if request.method == "PUT":
        if not request.user.is_authenticated or request.user.role not in ("owner", "coach"):
            return Response({"detail": "Permission denied."}, status=status.HTTP_403_FORBIDDEN)
        serializer = CourseCreateUpdateSerializer(course, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(CourseDetailSerializer(course, context={"request": request}).data)

    if request.method == "DELETE":
        if not request.user.is_authenticated or request.user.role != "owner":
            return Response({"detail": "Permission denied."}, status=status.HTTP_403_FORBIDDEN)
        course.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


# ──────────────────────────────────────────────
# Enrollment
# ──────────────────────────────────────────────


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def enroll(request, slug):
    course = get_object_or_404(Course, slug=slug)

    if Enrollment.objects.filter(user=request.user, course=course).exists():
        return Response(
            {"detail": "Already enrolled."},
            status=status.HTTP_409_CONFLICT,
        )

    if course.pricing_type == "paid":
        access_service = ContentAccessService()
        info = access_service.get_access_info(request.user, course)
        if not info.has_access:
            return Response(
                {"detail": "This course requires purchase or subscription.", "access_info": asdict(info)},
                status=status.HTTP_400_BAD_REQUEST,
            )

    enrollment = Enrollment.objects.create(user=request.user, course=course)
    serializer = EnrollmentSerializer(enrollment)
    return Response(serializer.data, status=status.HTTP_201_CREATED)


# ──────────────────────────────────────────────
# Progress
# ──────────────────────────────────────────────


def _has_unlocked_access(user, course) -> bool:
    """Paid access paths that create no Enrollment row (direct purchase, bundle,
    subscription plan). Free courses still require enrolling first."""
    info = ContentAccessService().get_access_info(user, course)
    return bool(info.has_access) and info.access_reason in ("purchased", "bundle", "subscription")


@api_view(["GET", "POST"])
@permission_classes([IsAuthenticated])
def course_progress(request, slug):
    """GET: list all progress for a course. POST: create/update progress for a lesson."""
    course = get_object_or_404(Course, slug=slug)
    user = request.user
    # Enrolled, unlocked (purchase/bundle/subscription/free), or staff.
    is_staff = user.role in ("owner", "coach")
    if (
        not is_staff
        and not Enrollment.objects.filter(user=user, course=course).exists()
        and not _has_unlocked_access(user, course)
    ):
        return Response({"detail": "Not enrolled."}, status=status.HTTP_403_FORBIDDEN)

    if request.method == "GET":
        lessons = Lesson.objects.filter(module__course=course)
        progress_qs = Progress.objects.filter(user=user, lesson__in=lessons)
        from .serializers import ProgressSerializer

        return Response(ProgressSerializer(progress_qs, many=True).data)

    # POST
    lesson_id = request.data.get("lesson")
    if not lesson_id:
        return Response({"detail": "lesson field is required."}, status=status.HTTP_400_BAD_REQUEST)
    lesson = get_object_or_404(Lesson, pk=lesson_id, module__course=course)
    progress, _created = Progress.objects.get_or_create(user=user, lesson=lesson)
    serializer = ProgressUpdateSerializer(progress, data=request.data, partial=True)
    serializer.is_valid(raise_exception=True)
    serializer.save()
    return Response(serializer.data)


@api_view(["PATCH"])
@permission_classes([IsAuthenticated])
def update_progress(request, slug, lesson_id):
    course = get_object_or_404(Course, slug=slug)
    lesson = get_object_or_404(Lesson, pk=lesson_id, module__course=course)

    user = request.user
    # Must be enrolled, have access (purchase/bundle/subscription/free), or be staff.
    is_staff = user.role in ("owner", "coach")
    if (
        not is_staff
        and not Enrollment.objects.filter(user=user, course=course).exists()
        and not _has_unlocked_access(user, course)
    ):
        return Response({"detail": "Not enrolled."}, status=status.HTTP_403_FORBIDDEN)

    progress, _created = Progress.objects.get_or_create(user=user, lesson=lesson)
    serializer = ProgressUpdateSerializer(progress, data=request.data, partial=True)
    serializer.is_valid(raise_exception=True)
    serializer.save()
    return Response(serializer.data)


# ──────────────────────────────────────────────
# Enrolled courses
# ──────────────────────────────────────────────


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def enrolled_courses(request):
    """List the student's courses: enrollments plus courses unlocked by an
    active subscription plan (which create no Enrollment row), each with a
    progress percentage."""

    def course_entry(course):
        total_lessons = Lesson.objects.filter(module__course=course).count()
        completed_lessons = Progress.objects.filter(
            user=request.user, lesson__module__course=course, completed=True
        ).count()
        progress_percent = round((completed_lessons / total_lessons) * 100) if total_lessons > 0 else 0
        course_data = CourseListSerializer(course, context={"request": request}).data
        course_data["progress_percent"] = progress_percent
        return course_data

    result = []
    seen_ids = set()
    enrollments = Enrollment.objects.filter(user=request.user, is_active=True).select_related("course")
    for enrollment in enrollments:
        course_data = course_entry(enrollment.course)
        course_data["enrolled_at"] = enrollment.enrolled_at
        result.append(course_data)
        seen_ids.add(enrollment.course_id)

    # Courses included in an active subscription plan.
    from django.contrib.contenttypes.models import ContentType
    from django.utils import timezone

    from apps.billing.models import Subscription, SubscriptionPlanAccess

    now = timezone.now()
    active_plan_ids = Subscription.objects.filter(
        student=request.user, status="active", current_period_end__gt=now
    ).values_list("plan_id", flat=True)
    if active_plan_ids:
        course_ct = ContentType.objects.get_for_model(Course)
        sub_course_ids = set(
            SubscriptionPlanAccess.objects.filter(plan_id__in=active_plan_ids, content_type=course_ct).values_list(
                "object_id", flat=True
            )
        )
        for course in Course.objects.filter(pk__in=sub_course_ids - seen_ids, is_published=True):
            course_data = course_entry(course)
            course_data["via_subscription"] = True
            result.append(course_data)

    return Response(result)


# ──────────────────────────────────────────────
# Module CRUD
# ──────────────────────────────────────────────


@api_view(["POST"])
@permission_classes([IsCoachOrOwner])
def module_create(request, slug):
    course = get_object_or_404(Course, slug=slug)
    serializer = ModuleCreateSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    module = serializer.save(course=course)
    return Response(
        {"id": module.id, "course": module.course_id, "title": module.title, "order": module.order},
        status=status.HTTP_201_CREATED,
    )


@api_view(["PUT", "DELETE"])
@permission_classes([IsCoachOrOwner])
def module_detail(request, slug, module_id):
    course = get_object_or_404(Course, slug=slug)
    module = get_object_or_404(Module, pk=module_id, course=course)

    if request.method == "PUT":
        serializer = ModuleCreateSerializer(module, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(
            {"id": module.id, "course": module.course_id, "title": module.title, "order": module.order},
        )

    if request.method == "DELETE":
        module.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


# ──────────────────────────────────────────────
# Lesson CRUD
# ──────────────────────────────────────────────


@api_view(["POST"])
@permission_classes([IsCoachOrOwner])
def lesson_create(request, slug, module_id):
    course = get_object_or_404(Course, slug=slug)
    module = get_object_or_404(Module, pk=module_id, course=course)
    serializer = LessonCreateSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    lesson = serializer.save(module=module)
    return Response(
        LessonCreateSerializer(lesson).data,
        status=status.HTTP_201_CREATED,
    )


@api_view(["PUT", "DELETE"])
@permission_classes([IsCoachOrOwner])
def lesson_detail(request, slug, lesson_id):
    course = get_object_or_404(Course, slug=slug)
    lesson = get_object_or_404(Lesson, pk=lesson_id, module__course=course)

    if request.method == "PUT":
        serializer = LessonCreateSerializer(lesson, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(LessonCreateSerializer(lesson).data)

    if request.method == "DELETE":
        lesson.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


# ──────────────────────────────────────────────
# Video Library
# ──────────────────────────────────────────────


@api_view(["GET", "POST"])
@permission_classes([IsCoachOrOwner])
def video_list_create(request):
    if request.method == "GET":
        qs = Video.objects.all()
        search = request.query_params.get("search")
        if search:
            qs = qs.filter(Q(title__icontains=search) | Q(description__icontains=search))
        qs = apply_ordering(qs, request, ["title", "created_at", "file_size", "duration_seconds"])
        paginator = StandardPagination()
        page = paginator.paginate_queryset(qs, request)
        return paginator.get_paginated_response(VideoSerializer(page, many=True).data)

    serializer = VideoCreateSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    video = serializer.save()
    return Response(VideoSerializer(video).data, status=status.HTTP_201_CREATED)


@api_view(["GET", "PUT", "DELETE"])
@permission_classes([IsCoachOrOwner])
def video_detail(request, pk):
    video = get_object_or_404(Video, pk=pk)

    if request.method == "GET":
        return Response(VideoSerializer(video).data)

    if request.method == "PUT":
        serializer = VideoCreateSerializer(video, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(VideoSerializer(video).data)

    if request.method == "DELETE":
        video.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


# ──────────────────────────────────────────────
# Course categories (coach-managed taxonomy)
# ──────────────────────────────────────────────


@api_view(["GET", "POST"])
@permission_classes([IsCoachOrOwner])
def category_list_create(request):
    if request.method == "GET":
        qs = CourseCategory.objects.all()
        return Response(CourseCategorySerializer(qs, many=True).data)

    serializer = CourseCategorySerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    category = serializer.save()
    return Response(
        CourseCategorySerializer(category).data, status=status.HTTP_201_CREATED
    )


@api_view(["GET", "PUT", "DELETE"])
@permission_classes([IsCoachOrOwner])
def category_detail(request, pk):
    category = get_object_or_404(CourseCategory, pk=pk)

    if request.method == "GET":
        return Response(CourseCategorySerializer(category).data)

    if request.method == "PUT":
        serializer = CourseCategorySerializer(category, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(CourseCategorySerializer(category).data)

    if request.method == "DELETE":
        category.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)

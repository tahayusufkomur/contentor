from django.db.models import Q
from django.shortcuts import get_object_or_404
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response

from apps.core.permissions import IsCoachOrOwner, IsOwner

from .models import Course, Enrollment, Lesson, Module, Progress
from .serializers import (
    CourseCreateUpdateSerializer,
    CourseDetailSerializer,
    CourseListSerializer,
    EnrollmentSerializer,
    LessonCreateSerializer,
    ModuleCreateSerializer,
    ProgressUpdateSerializer,
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

    serializer = CourseListSerializer(qs, many=True, context={"request": request})
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
    enrollment = Enrollment.objects.create(user=request.user, course=course)
    serializer = EnrollmentSerializer(enrollment)
    return Response(serializer.data, status=status.HTTP_201_CREATED)


# ──────────────────────────────────────────────
# Progress
# ──────────────────────────────────────────────

@api_view(["PATCH"])
@permission_classes([IsAuthenticated])
def update_progress(request, slug, lesson_id):
    course = get_object_or_404(Course, slug=slug)
    lesson = get_object_or_404(Lesson, pk=lesson_id, module__course=course)

    user = request.user
    # Must be enrolled or owner/coach
    is_staff = user.role in ("owner", "coach")
    if not is_staff and not Enrollment.objects.filter(user=user, course=course).exists():
        return Response({"detail": "Not enrolled."}, status=status.HTTP_403_FORBIDDEN)

    progress, _created = Progress.objects.get_or_create(user=user, lesson=lesson)
    serializer = ProgressUpdateSerializer(progress, data=request.data, partial=True)
    serializer.is_valid(raise_exception=True)
    serializer.save()
    return Response(serializer.data)


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

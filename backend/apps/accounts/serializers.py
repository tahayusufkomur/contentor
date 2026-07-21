from rest_framework import serializers

from .models import User


class UserSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ["id", "email", "name", "avatar_url", "role", "is_superuser", "date_joined"]
        read_only_fields = ["id", "email", "role", "is_superuser", "date_joined"]


class StudentListSerializer(serializers.ModelSerializer):
    enrolled_count = serializers.SerializerMethodField()
    courses = serializers.SerializerMethodField()
    overall_progress = serializers.SerializerMethodField()
    subscription = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = [
            "id",
            "email",
            "name",
            "avatar_url",
            "role",
            "date_joined",
            "last_login",
            "enrolled_count",
            "last_display_mode",
            "last_platform",
            "courses",
            "overall_progress",
            "subscription",
        ]
        read_only_fields = fields

    def get_enrolled_count(self, obj):
        return obj.enrollments.filter(is_active=True).count()

    def get_courses(self, obj):
        from apps.courses.models import Enrollment, Progress, Lesson
        enrollments = Enrollment.objects.filter(user=obj, is_active=True).select_related("course")
        res = []
        for e in enrollments:
            course = e.course
            total_lessons = Lesson.objects.filter(module__course=course).count()
            completed_lessons = Progress.objects.filter(user=obj, lesson__module__course=course, completed=True).count()
            progress_pct = int((completed_lessons / total_lessons) * 100) if total_lessons > 0 else 0
            res.append({
                "id": course.id,
                "title": course.title,
                "progress_percent": progress_pct,
                "completed_lessons": completed_lessons,
                "total_lessons": total_lessons,
            })
        return res

    def get_overall_progress(self, obj):
        courses = self.get_courses(obj)
        if not courses:
            return 0
        return int(sum(c["progress_percent"] for c in courses) / len(courses))

    def get_subscription(self, obj):
        from apps.billing.models import Subscription
        sub = Subscription.objects.filter(student=obj, status="active").select_related("plan").first()
        if not sub:
            return None
        return {
            "plan_name": sub.plan.name,
            "status": sub.status,
            "amount": f"${sub.billing_amount}/mo" if sub.billing_amount else "Free",
        }


class MagicLinkRequestSerializer(serializers.Serializer):
    email = serializers.EmailField()


class MagicLinkVerifySerializer(serializers.Serializer):
    token = serializers.CharField()


class MagicLinkVerifyCodeSerializer(serializers.Serializer):
    email = serializers.EmailField()
    code = serializers.CharField(min_length=6, max_length=6)

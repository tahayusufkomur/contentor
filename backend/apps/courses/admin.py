from django.contrib import admin
from .models import Course, Module, Lesson, Enrollment, Progress

class ModuleInline(admin.TabularInline):
    model = Module
    extra = 0

class LessonInline(admin.TabularInline):
    model = Lesson
    extra = 0

@admin.register(Course)
class CourseAdmin(admin.ModelAdmin):
    list_display = ("title", "instructor", "pricing_type", "is_published", "created_at")
    list_filter = ("pricing_type", "is_published")
    search_fields = ("title",)
    prepopulated_fields = {"slug": ("title",)}
    inlines = [ModuleInline]

@admin.register(Module)
class ModuleAdmin(admin.ModelAdmin):
    list_display = ("title", "course", "order")
    inlines = [LessonInline]

@admin.register(Lesson)
class LessonAdmin(admin.ModelAdmin):
    list_display = ("title", "module", "order", "is_free_preview")

@admin.register(Enrollment)
class EnrollmentAdmin(admin.ModelAdmin):
    list_display = ("user", "course", "enrolled_at")

@admin.register(Progress)
class ProgressAdmin(admin.ModelAdmin):
    list_display = ("user", "lesson", "completed", "watched_seconds")

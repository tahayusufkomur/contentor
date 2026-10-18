"""Studio admin-kit registrations for course content."""

from apps.adminkit.options import ModelAdmin, admin_action
from apps.adminkit.sites import studio_site

from .models import Course


@studio_site.register(Course)
class CourseAdmin(ModelAdmin):
    icon = "book-open"
    description = "Quick edits and publishing. Build course content in Content → Courses."
    list_display = ("title", "pricing_type", "price", "is_published", "order", "created_at")
    search_fields = ("title",)
    list_filters = ("is_published", "pricing_type", "filter_options", "tags")
    ordering = ("order",)
    fields = ("title", "description", "pricing_type", "price", "order")
    # Published only through the Publish action, which checks every lesson is filled in.
    readonly_fields = ("slug", "is_published")
    # Creation needs slug generation + module/lesson authoring — the dedicated
    # course builder owns that flow.
    can_create = False
    can_delete = False

    @admin_action(label="Publish", style="primary")
    def publish(self, request, queryset):
        ready = [c.pk for c in queryset if c.is_published or not c.not_ready()]
        updated = queryset.filter(pk__in=ready).update(is_published=True)
        held = queryset.count() - len(ready)
        note = f" {held} kept as draft(s): every lesson needs a video or text first." if held else ""
        return f"Published {updated} course(s).{note}"

    @admin_action(
        label="Unpublish", style="danger", confirm="Unpublish selected courses? Students lose access to them."
    )
    def unpublish(self, request, queryset):
        updated = queryset.update(is_published=False)
        return f"Unpublished {updated} course(s)."

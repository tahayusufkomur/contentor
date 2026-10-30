"""Studio admin-kit registrations for course content."""

from django.utils.translation import gettext_lazy, ngettext

from apps.adminkit.options import ModelAdmin, admin_action
from apps.adminkit.sites import studio_site

from .models import Course


@studio_site.register(Course)
class CourseAdmin(ModelAdmin):
    key = "courses"
    label = gettext_lazy("Course")
    label_plural = gettext_lazy("Courses")
    icon = "book-open"
    description = gettext_lazy("Quick edits and publishing. Build course content in Content → Courses.")
    field_labels = {
        "title": gettext_lazy("Title"),
        "description": gettext_lazy("Description"),
        "pricing_type": gettext_lazy("Pricing"),
        "price": gettext_lazy("Price"),
        "order": gettext_lazy("Order"),
        "is_published": gettext_lazy("Published"),
        "created_at": gettext_lazy("Created"),
        "slug": gettext_lazy("Slug"),
        "filter_options": gettext_lazy("Filters"),
        "tags": gettext_lazy("Tags"),
    }
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

    @admin_action(label=gettext_lazy("Publish"), style="primary")
    def publish(self, request, queryset):
        ready = [c.pk for c in queryset if c.is_published or not c.not_ready()]
        updated = queryset.filter(pk__in=ready).update(is_published=True)
        held = queryset.count() - len(ready)
        message = ngettext("Published %(count)d course.", "Published %(count)d courses.", updated) % {"count": updated}
        if held:
            message += " " + ngettext(
                "%(count)d kept as a draft: every lesson needs a video or text first.",
                "%(count)d kept as drafts: every lesson needs a video or text first.",
                held,
            ) % {"count": held}
        return message

    @admin_action(
        label=gettext_lazy("Unpublish"),
        style="danger",
        confirm=gettext_lazy("Unpublish selected courses? Students lose access to them."),
    )
    def unpublish(self, request, queryset):
        updated = queryset.update(is_published=False)
        return ngettext("Unpublished %(count)d course.", "Unpublished %(count)d courses.", updated) % {"count": updated}

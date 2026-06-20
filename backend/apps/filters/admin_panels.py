"""Studio admin-kit registrations for the custom filter taxonomy."""

from apps.adminkit.options import ModelAdmin
from apps.adminkit.sites import studio_site

from .models import FilterGroup, FilterOption


@studio_site.register(FilterGroup)
class FilterGroupAdmin(ModelAdmin):
    icon = "filter"
    description = "Define filters (e.g. Level, Style) that group your courses and events."
    list_display = ("name", "applies_to", "order", "option_count")
    search_fields = ("name",)
    ordering = ("order", "name")
    fields = ("name", "applies_to", "order")
    readonly_fields = ("slug",)

    def option_count(self, obj):
        return obj.options.count()

    option_count.short_description = "Options"


@studio_site.register(FilterOption)
class FilterOptionAdmin(ModelAdmin):
    icon = "tag"
    description = "The selectable values within a filter (e.g. Beginner under Level)."
    list_display = ("name", "group", "order")
    search_fields = ("name",)
    list_filters = ("group",)
    ordering = ("order", "name")
    fields = ("group", "name", "order")
    readonly_fields = ("slug",)

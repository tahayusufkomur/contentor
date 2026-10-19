from rest_framework import serializers

from . import designs
from .models import Design


class DesignSerializer(serializers.ModelSerializer):
    """A design with its target's title and what the renderer needs to draw it: the link of its photo, her
    logo and the site's look (designs.design_payload). Every row of a list shares one `context`, where
    designs.py and `get_title` keep what they have read, so a list reads each of those once."""

    title = serializers.SerializerMethodField()
    photos = serializers.SerializerMethodField()
    logo_url = serializers.SerializerMethodField()
    look = serializers.SerializerMethodField()

    class Meta:
        model = Design
        fields = [
            "id",
            "kind",
            "target_kind",
            "target_key",
            "state",
            "recipe",
            "made_by",
            "run_id",
            "created_at",
            "updated_at",
            "kept_at",
            "title",
            "photos",
            "logo_url",
            "look",
        ]

    def get_title(self, design):
        """A series is its title; a course or download is looked up (all of its kind in one read: a site has tens)."""
        kind = design.target_kind
        if kind not in designs.BY_ID:
            return design.target_key
        titles = self.context.setdefault("id_titles", {})
        if kind not in titles:
            titles[kind] = {str(pk): title for pk, title in designs._model(kind).objects.values_list("pk", "title")}
        return titles[kind].get(design.target_key, "")

    def get_photos(self, design):
        return designs.design_payload(design, self.context)["photos"]

    def get_logo_url(self, design):
        return designs.site_look(self.context)[1]

    def get_look(self, design):
        return designs.site_look(self.context)[0]

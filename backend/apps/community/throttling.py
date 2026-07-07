from rest_framework.throttling import UserRateThrottle


class CommunityPostThrottle(UserRateThrottle):
    scope = "community_posts"


class CommunityCommentThrottle(UserRateThrottle):
    scope = "community_comments"

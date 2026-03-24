# Zoom Meeting Admin Settings

## Summary

Remove broadcast mode from LiveClass. Add 7 coach-configurable Zoom meeting settings as flat model fields with sensible defaults. Settings are always visible in the create form.

## Changes

### 1. Model (`apps/live/models.py`)

**Remove:**
- `mode` field (conference/broadcast choices)
- `max_participants` property

**Add fields:**

| Field | Type | Default | Zoom API mapping |
|-------|------|---------|-----------------|
| `waiting_room` | BooleanField | `True` | `settings.waiting_room` |
| `mute_on_entry` | BooleanField | `True` | `settings.mute_upon_entry` |
| `auto_recording` | CharField(`none`, `cloud`) | `"none"` | `settings.auto_recording` |
| `chat_scope` | CharField(`host_only`, `everyone`) | `"everyone"` | `settings.meeting_chat.allow_participants_chat_with` (1=host, 3=everyone) |
| `screen_sharing` | CharField(`host`, `all`) | `"host"` | `settings.who_can_share_screen` |
| `participant_video` | BooleanField | `True` | `settings.participant_video` |
| `duration` | PositiveIntegerField | `60` | top-level `duration` |

### 2. Zoom Service (`apps/live/zoom_service.py`)

Change `create_zoom_meeting(title, mode)` signature to:

```python
def create_zoom_meeting(
    title: str,
    *,
    waiting_room: bool = True,
    mute_on_entry: bool = True,
    auto_recording: str = "none",
    chat_scope: str = "everyone",
    screen_sharing: str = "host",
    participant_video: bool = True,
    duration: int = 60,
) -> dict:
```

Map fields to Zoom API:
```python
meeting_settings = {
    "host_video": True,
    "participant_video": participant_video,
    "join_before_host": False,
    "mute_upon_entry": mute_on_entry,
    "auto_recording": auto_recording,
    "waiting_room": waiting_room,
    "who_can_share_screen": screen_sharing,
    "meeting_chat": {
        "enable": True,
        "allow_participants_chat_with": 1 if chat_scope == "host_only" else 3,
    },
}
```

Top-level payload includes `"duration": duration`.

### 3. Serializers (`apps/live/serializers.py`)

- Remove `mode` and `max_participants` from `LiveClassSerializer`
- Remove `mode` from `LiveClassCreateSerializer`
- Add all 7 new fields to both serializers

### 4. Views (`apps/live/views.py`)

- `live_class_start`: pass new settings to `create_zoom_meeting` from the `live_class` instance
- `live_class_join`: remove `mode` from response

### 5. Frontend Admin (`app/admin/live/page.tsx`)

- Remove mode selector (conference/broadcast buttons)
- Remove mode/max_participants from list display badge
- Add always-visible controls:
  - `waiting_room`: toggle switch
  - `mute_on_entry`: toggle switch
  - `participant_video`: toggle switch
  - `auto_recording`: select (None / Cloud)
  - `chat_scope`: select (Host Only / Everyone)
  - `screen_sharing`: select (Host Only / All Participants)
  - `duration`: number input (minutes)
- Update `LiveClass` TypeScript interface
- Update `handleCreate` to send new fields

### 6. Frontend Live Page (`app/live/[id]/page.tsx`)

- Remove `mode` from `LiveClassData` and `JoinResponse` interfaces

### 7. Migration

- Single migration: remove `mode`, add 7 new fields with defaults

## Defaults Rationale

- `waiting_room: True` — security first for education
- `mute_on_entry: True` — avoids noise in classes
- `auto_recording: "none"` — opt-in to avoid storage costs
- `chat_scope: "everyone"` — interactive by default
- `screen_sharing: "host"` — coach controls content
- `participant_video: True` — engagement by default
- `duration: 60` — standard class length

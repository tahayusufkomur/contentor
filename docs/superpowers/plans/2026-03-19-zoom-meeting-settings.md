# Zoom Meeting Admin Settings Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove broadcast mode and add 7 coach-configurable Zoom meeting settings to live class creation.

**Architecture:** Flat model fields on LiveClass with sensible defaults. Settings flow from model -> serializer -> view -> zoom_service -> Zoom API. Frontend admin form shows all settings always-visible with toggles and selects.

**Tech Stack:** Django, DRF, Next.js (React), Tailwind CSS, shadcn/ui (Switch, Input, Label, Select components)

---

## Chunk 1: Backend — Model, Migration, Service, Serializer, Views

### Task 1: Update LiveClass Model

**Files:**
- Modify: `backend/apps/live/models.py`

- [ ] **Step 1: Remove `mode` field and `max_participants` property, add 7 new fields**

Replace the full model with:

```python
import uuid

from django.conf import settings
from django.db import connection, models


class LiveClass(models.Model):
    title = models.CharField(max_length=200)
    description = models.TextField(blank=True, default="")
    instructor = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="live_classes",
    )
    status = models.CharField(
        max_length=20,
        choices=[
            ("draft", "Draft"),
            ("scheduled", "Scheduled"),
            ("live", "Live"),
            ("ended", "Ended"),
        ],
        default="draft",
    )
    # Zoom meeting settings (coach-configurable)
    waiting_room = models.BooleanField(default=True)
    mute_on_entry = models.BooleanField(default=True)
    auto_recording = models.CharField(
        max_length=10,
        choices=[("none", "None"), ("cloud", "Cloud")],
        default="none",
    )
    chat_scope = models.CharField(
        max_length=20,
        choices=[("host_only", "Host Only"), ("everyone", "Everyone")],
        default="everyone",
    )
    screen_sharing = models.CharField(
        max_length=10,
        choices=[("host", "Host Only"), ("all", "All Participants")],
        default="host",
    )
    participant_video = models.BooleanField(default=True)
    duration = models.PositiveIntegerField(default=60)
    # Pricing
    pricing_type = models.CharField(
        max_length=20,
        choices=[("free", "Free"), ("paid", "Paid"), ("subscription", "Subscription")],
        default="free",
    )
    price = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    thumbnail_url = models.CharField(max_length=2000, blank=True, default="")
    room_name = models.CharField(max_length=255, unique=True, editable=False)
    # Zoom Meeting identifiers (populated on start)
    zoom_meeting_id = models.CharField(max_length=255, blank=True, default="")
    zoom_passcode = models.CharField(max_length=50, blank=True, default="")
    zoom_join_url = models.CharField(max_length=2000, blank=True, default="")
    scheduled_at = models.DateTimeField(null=True, blank=True)
    started_at = models.DateTimeField(null=True, blank=True)
    ended_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        app_label = "live"
        ordering = ["-created_at"]

    def __str__(self):
        return self.title

    def save(self, *args, **kwargs):
        if not self.room_name:
            tenant_slug = getattr(connection.tenant, "slug", "unknown")
            self.room_name = f"{tenant_slug}-{uuid.uuid4().hex[:12]}"
        super().save(*args, **kwargs)
```

- [ ] **Step 2: Generate migration**

Run: `docker compose exec django python manage.py makemigrations live`
Expected: Migration `0003_*.py` created — removes `mode`, adds 7 new fields.

- [ ] **Step 3: Commit**

```bash
git add backend/apps/live/models.py backend/apps/live/migrations/0003_*.py
git commit -m "feat(live): remove broadcast mode, add zoom meeting settings to model"
```

---

### Task 2: Update Zoom Service

**Files:**
- Modify: `backend/apps/live/zoom_service.py`

- [ ] **Step 1: Update `create_zoom_meeting` signature and Zoom API payload**

Replace the `create_zoom_meeting` function with:

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
    """Create a Zoom meeting. Returns dict with meeting_id, passcode, join_url."""
    token = get_zoom_access_token()

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

    res = http_requests.post(
        f"{ZOOM_API_BASE}/users/me/meetings",
        json={
            "topic": title,
            "type": 2,
            "duration": duration,
            "settings": meeting_settings,
        },
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
        },
        timeout=10,
    )
    if res.status_code != 201:
        logger.error("Zoom create meeting failed (%s): %s", res.status_code, res.text)
    res.raise_for_status()
    data = res.json()
    logger.info("Zoom meeting created: %s", data["id"])

    return {
        "meeting_id": str(data["id"]),
        "passcode": data.get("password", ""),
        "join_url": data.get("join_url", ""),
    }
```

- [ ] **Step 2: Commit**

```bash
git add backend/apps/live/zoom_service.py
git commit -m "feat(live): pass zoom meeting settings to Zoom API"
```

---

### Task 3: Update Serializers

**Files:**
- Modify: `backend/apps/live/serializers.py`

- [ ] **Step 1: Replace serializers to remove mode, add new fields**

```python
from rest_framework import serializers

from apps.core.storage import generate_presigned_download_url

from .models import LiveClass


class LiveClassSerializer(serializers.ModelSerializer):
    thumbnail_signed_url = serializers.SerializerMethodField()

    class Meta:
        model = LiveClass
        fields = [
            "id",
            "title",
            "description",
            "instructor",
            "status",
            "waiting_room",
            "mute_on_entry",
            "auto_recording",
            "chat_scope",
            "screen_sharing",
            "participant_video",
            "duration",
            "pricing_type",
            "price",
            "thumbnail_url",
            "thumbnail_signed_url",
            "room_name",
            "scheduled_at",
            "started_at",
            "ended_at",
            "created_at",
        ]
        read_only_fields = [
            "id",
            "instructor",
            "status",
            "room_name",
            "started_at",
            "ended_at",
            "created_at",
        ]

    def get_thumbnail_signed_url(self, obj):
        if not obj.thumbnail_url:
            return None
        if obj.thumbnail_url.startswith("http"):
            return obj.thumbnail_url
        return generate_presigned_download_url(obj.thumbnail_url)


class LiveClassCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model = LiveClass
        fields = [
            "title",
            "description",
            "waiting_room",
            "mute_on_entry",
            "auto_recording",
            "chat_scope",
            "screen_sharing",
            "participant_video",
            "duration",
            "pricing_type",
            "price",
            "thumbnail_url",
            "scheduled_at",
        ]
```

- [ ] **Step 2: Commit**

```bash
git add backend/apps/live/serializers.py
git commit -m "feat(live): update serializers with zoom settings fields"
```

---

### Task 4: Update Views

**Files:**
- Modify: `backend/apps/live/views.py`

- [ ] **Step 1: Update `live_class_start` to pass settings, remove mode from `live_class_join`**

Replace `live_class_start`:

```python
@api_view(["POST"])
@permission_classes([IsCoachOrOwner])
def live_class_start(request, pk):
    live_class = get_object_or_404(LiveClass, pk=pk)
    if live_class.status not in ("draft", "scheduled"):
        return Response(
            {"detail": f"Cannot start a class with status '{live_class.status}'."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    try:
        meeting = create_zoom_meeting(
            live_class.title,
            waiting_room=live_class.waiting_room,
            mute_on_entry=live_class.mute_on_entry,
            auto_recording=live_class.auto_recording,
            chat_scope=live_class.chat_scope,
            screen_sharing=live_class.screen_sharing,
            participant_video=live_class.participant_video,
            duration=live_class.duration,
        )
        live_class.zoom_meeting_id = meeting["meeting_id"]
        live_class.zoom_passcode = meeting["passcode"]
        live_class.zoom_join_url = meeting["join_url"]
        live_class.status = "live"
        live_class.started_at = timezone.now()
        live_class.save(
            update_fields=[
                "zoom_meeting_id",
                "zoom_passcode",
                "zoom_join_url",
                "status",
                "started_at",
            ]
        )
    except Exception as e:
        logger.exception("Failed to start live class %s", pk)
        return Response(
            {"detail": f"Failed to start: {e}"},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )

    return Response(LiveClassSerializer(live_class).data)
```

Replace `live_class_join` response (remove `mode` key):

```python
    return Response({
        "signature": signature,
        "meeting_number": live_class.zoom_meeting_id,
        "password": live_class.zoom_passcode,
        "user_name": display_name,
        "user_email": request.user.email,
        "is_host": is_host,
    })
```

- [ ] **Step 2: Commit**

```bash
git add backend/apps/live/views.py
git commit -m "feat(live): pass zoom settings from model to Zoom API on start"
```

---

## Chunk 2: Frontend — Admin Form and Live Page Cleanup

### Task 5: Update Admin Live Classes Page

**Files:**
- Modify: `frontend-customer/src/app/admin/live/page.tsx`

- [ ] **Step 1: Replace the full page with updated form and list**

```tsx
'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Play, Square, Trash2, Radio, Clock, CheckCircle2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { clientFetch } from '@/lib/api-client'

interface LiveClass {
  id: number
  title: string
  description: string
  status: string
  waiting_room: boolean
  mute_on_entry: boolean
  auto_recording: string
  chat_scope: string
  screen_sharing: string
  participant_video: boolean
  duration: number
  pricing_type: string
  price: string
  room_name: string
  scheduled_at: string | null
  started_at: string | null
  ended_at: string | null
  created_at: string
}

const statusConfig: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  draft: { label: 'Draft', color: 'bg-muted text-muted-foreground', icon: <Clock className="h-3 w-3" /> },
  scheduled: { label: 'Scheduled', color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400', icon: <Clock className="h-3 w-3" /> },
  live: { label: 'Live', color: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400', icon: <Radio className="h-3 w-3 animate-pulse" /> },
  ended: { label: 'Ended', color: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400', icon: <CheckCircle2 className="h-3 w-3" /> },
}

export default function LiveClassesPage() {
  const router = useRouter()
  const [classes, setClasses] = useState<LiveClass[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [creating, setCreating] = useState(false)

  // Form state
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [pricingType, setPricingType] = useState('free')
  const [price, setPrice] = useState('')
  const [waitingRoom, setWaitingRoom] = useState(true)
  const [muteOnEntry, setMuteOnEntry] = useState(true)
  const [participantVideo, setParticipantVideo] = useState(true)
  const [autoRecording, setAutoRecording] = useState('none')
  const [chatScope, setChatScope] = useState('everyone')
  const [screenSharing, setScreenSharing] = useState('host')
  const [duration, setDuration] = useState(60)

  const fetchClasses = useCallback(async () => {
    try {
      const data = await clientFetch<LiveClass[]>('/api/v1/live/')
      setClasses(data)
    } catch {
      // ignore
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchClasses() }, [fetchClasses])

  function resetForm() {
    setTitle('')
    setDescription('')
    setPricingType('free')
    setPrice('')
    setWaitingRoom(true)
    setMuteOnEntry(true)
    setParticipantVideo(true)
    setAutoRecording('none')
    setChatScope('everyone')
    setScreenSharing('host')
    setDuration(60)
  }

  async function handleCreate() {
    setCreating(true)
    try {
      await clientFetch<LiveClass>('/api/v1/live/', {
        method: 'POST',
        body: JSON.stringify({
          title,
          description,
          pricing_type: pricingType,
          ...(pricingType !== 'free' && price ? { price: parseFloat(price) } : {}),
          waiting_room: waitingRoom,
          mute_on_entry: muteOnEntry,
          participant_video: participantVideo,
          auto_recording: autoRecording,
          chat_scope: chatScope,
          screen_sharing: screenSharing,
          duration,
        }),
      })
      resetForm()
      setShowCreate(false)
      fetchClasses()
    } catch {
      // ignore
    } finally {
      setCreating(false)
    }
  }

  async function handleStart(id: number) {
    try {
      await clientFetch(`/api/v1/live/${id}/start/`, { method: 'POST' })
      router.push(`/live/${id}`)
    } catch {
      // ignore
    }
  }

  async function handleStop(id: number) {
    try {
      await clientFetch(`/api/v1/live/${id}/stop/`, { method: 'POST' })
      fetchClasses()
    } catch {
      // ignore
    }
  }

  async function handleDelete(id: number) {
    try {
      await clientFetch(`/api/v1/live/${id}/`, { method: 'DELETE' })
      fetchClasses()
    } catch {
      // ignore
    }
  }

  const selectClasses = "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Live Classes</h1>
          <p className="text-sm text-muted-foreground">Host live sessions with your students.</p>
        </div>
        <Button onClick={() => setShowCreate(true)} className="gap-2">
          <Plus className="h-4 w-4" /> Create Live Class
        </Button>
      </div>

      {showCreate && (
        <div className="rounded-lg border bg-card p-6 space-y-4">
          <h2 className="text-lg font-semibold">New Live Class</h2>

          <div className="space-y-2">
            <Label htmlFor="title">Title</Label>
            <Input id="title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Friday Flow Session" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="desc">Description (optional)</Label>
            <Input id="desc" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What will you cover?" />
          </div>

          <div className="space-y-2">
            <Label htmlFor="duration">Duration (minutes)</Label>
            <Input id="duration" type="number" min="15" max="480" value={duration} onChange={(e) => setDuration(parseInt(e.target.value) || 60)} />
          </div>

          <div className="rounded-lg border p-4 space-y-4">
            <h3 className="text-sm font-semibold">Meeting Settings</h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <Label>Waiting Room</Label>
                  <p className="text-xs text-muted-foreground">Screen who enters</p>
                </div>
                <Switch checked={waitingRoom} onCheckedChange={setWaitingRoom} />
              </div>

              <div className="flex items-center justify-between gap-2">
                <div>
                  <Label>Mute on Entry</Label>
                  <p className="text-xs text-muted-foreground">Mute participants on join</p>
                </div>
                <Switch checked={muteOnEntry} onCheckedChange={setMuteOnEntry} />
              </div>

              <div className="flex items-center justify-between gap-2">
                <div>
                  <Label>Participant Video</Label>
                  <p className="text-xs text-muted-foreground">Camera on at join</p>
                </div>
                <Switch checked={participantVideo} onCheckedChange={setParticipantVideo} />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="autoRecording">Auto Recording</Label>
                <select id="autoRecording" value={autoRecording} onChange={(e) => setAutoRecording(e.target.value)} className={selectClasses}>
                  <option value="none">None</option>
                  <option value="cloud">Cloud</option>
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="chatScope">Chat</Label>
                <select id="chatScope" value={chatScope} onChange={(e) => setChatScope(e.target.value)} className={selectClasses}>
                  <option value="everyone">Everyone</option>
                  <option value="host_only">Host Only</option>
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="screenSharing">Screen Sharing</Label>
                <select id="screenSharing" value={screenSharing} onChange={(e) => setScreenSharing(e.target.value)} className={selectClasses}>
                  <option value="host">Host Only</option>
                  <option value="all">All Participants</option>
                </select>
              </div>
            </div>
          </div>

          <div className="flex gap-4">
            <div className="space-y-2">
              <Label htmlFor="pricing">Access</Label>
              <select id="pricing" value={pricingType} onChange={(e) => setPricingType(e.target.value)} className={selectClasses}>
                <option value="free">Free</option>
                <option value="paid">Paid</option>
                <option value="subscription">Subscription</option>
              </select>
            </div>
            {pricingType !== 'free' && (
              <div className="space-y-2">
                <Label htmlFor="price">Price</Label>
                <Input id="price" type="number" min="0" step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="0.00" />
              </div>
            )}
          </div>

          <div className="flex gap-2">
            <Button onClick={handleCreate} disabled={!title.trim() || creating}>
              {creating ? 'Creating...' : 'Create'}
            </Button>
            <Button variant="ghost" onClick={() => { setShowCreate(false); resetForm() }}>Cancel</Button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        </div>
      ) : classes.length === 0 ? (
        <div className="rounded-xl border border-dashed bg-brand-surface p-12 text-center">
          <p className="text-muted-foreground">No live classes yet. Create one to get started.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {classes.map((lc) => {
            const cfg = statusConfig[lc.status] || statusConfig.draft
            return (
              <div key={lc.id} className="flex items-center justify-between rounded-lg border bg-card p-4">
                <div className="flex items-center gap-4 min-w-0">
                  <div className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${cfg.color}`}>
                    {cfg.icon} {cfg.label}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-medium truncate">{lc.title}</p>
                      <span className="rounded-full bg-secondary px-2 py-0.5 text-[10px] font-medium text-secondary-foreground">
                        {lc.duration} min
                      </span>
                      {lc.pricing_type === 'free' ? (
                        <span className="rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-medium text-green-700 dark:bg-green-900/30 dark:text-green-400">Free</span>
                      ) : (
                        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
                          ${parseFloat(lc.price).toFixed(0)}
                        </span>
                      )}
                    </div>
                    {lc.description && <p className="text-xs text-muted-foreground truncate">{lc.description}</p>}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {(lc.status === 'draft' || lc.status === 'scheduled') && (
                    <Button size="sm" onClick={() => handleStart(lc.id)} className="gap-1.5">
                      <Play className="h-3.5 w-3.5" /> Go Live
                    </Button>
                  )}
                  {lc.status === 'live' && (
                    <>
                      <Button size="sm" variant="outline" onClick={() => router.push(`/live/${lc.id}`)}>
                        Join
                      </Button>
                      <Button size="sm" variant="destructive" onClick={() => handleStop(lc.id)} className="gap-1.5">
                        <Square className="h-3.5 w-3.5" /> End
                      </Button>
                    </>
                  )}
                  {lc.status !== 'live' && (
                    <Button size="sm" variant="ghost" onClick={() => handleDelete(lc.id)}>
                      <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
                    </Button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend-customer/src/app/admin/live/page.tsx
git commit -m "feat(live): replace mode selector with zoom meeting settings in admin form"
```

---

### Task 6: Clean Up Live Room Page

**Files:**
- Modify: `frontend-customer/src/app/live/[id]/page.tsx`

- [ ] **Step 1: Remove `mode` from TypeScript interfaces**

In `LiveClassData` interface, remove:
```
mode: string
```

In `JoinResponse` interface, remove:
```
mode: string
```

- [ ] **Step 2: Commit**

```bash
git add frontend-customer/src/app/live/[id]/page.tsx
git commit -m "feat(live): remove mode from live room page interfaces"
```

---

### Task 7: Run Migration and Verify

- [ ] **Step 1: Run migration**

Run: `cd contentor && docker compose exec django python manage.py migrate_schemas`
Expected: Migration applies successfully.

- [ ] **Step 2: Run linter**

Run: `cd contentor && pre-commit run --all-files`
Expected: All checks pass.

- [ ] **Step 3: Start dev and smoke test**

Run: `cd contentor && make dev`
Verify:
1. Admin live class page loads without errors
2. Create form shows all 7 settings (3 toggles + 3 selects + duration input)
3. Creating a live class works
4. "Go Live" starts meeting with settings applied

- [ ] **Step 4: Final commit if any formatting fixes needed**

```bash
git add -u
git commit -m "chore(live): formatting fixes"
```

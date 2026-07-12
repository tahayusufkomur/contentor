# Inline Edit Panel — Design Spec

## Summary

Replace all existing edit UX across admin pages with a single shared `InlineEditPanel<T>` component. Clicking the edit icon on any row expands a form panel below that row. Only one panel is open at a time. Save triggers a PATCH/PUT, then collapses the panel and refreshes the list.

## Goals

- Consistent edit experience across all admin list pages
- Remove per-page edit UI code (in-row input swaps, top form panels)
- Support different field sets per model via declarative config
- Keep it simple — no form library, just useState driven

## Prerequisite: MediaBrowser `renderExpandedRow` Support

The current `MediaBrowser` component renders list rows via `renderListRow` which returns `TableCell` fragments inside a single `TableRow`. There is no mechanism to inject a second row after it.

**Required change:** Add a `renderExpandedRow?: (item: T) => ReactNode | null` prop. Implementation:

```tsx
// Inside MediaBrowser's items.map:
<React.Fragment key={id ?? i}>
  <TableRow ...>{selectable && <td>...</td>}{renderListRow(item)}</TableRow>
  {renderExpandedRow?.(item)}
</React.Fragment>
```

The caller supplies:

```tsx
renderExpandedRow={(item) =>
  editingId === getItemId(item) ? (
    <TableRow>
      <TableCell colSpan={columns.length + (selectable ? 1 : 0)}>
        <InlineEditPanel ... />
      </TableCell>
    </TableRow>
  ) : null
}
```

The `colSpan` must account for the checkbox column when selection is enabled.

**Gallery view:** Inline editing is list-view only. In gallery view, the edit icon is not shown. Users switch to list view to edit.

## Component: `InlineEditPanel<T>`

**Location:** `src/components/admin/inline-edit-panel.tsx`

### Props

```typescript
interface FieldConfig<T> {
  key: keyof T & string
  label: string
  type: "text" | "number" | "select" | "toggle" | "datetime" | "textarea" | "image"
  options?: { label: string; value: string }[]    // for "select" type
  showWhen?: (values: Partial<T>) => boolean       // conditional visibility
  placeholder?: string
  required?: boolean
}

interface InlineEditPanelProps<T> {
  item: T
  fields: FieldConfig<T>[]
  onSave: (values: Partial<T>) => Promise<void>
  onCancel: () => void
  saving?: boolean
}
```

### Field Types

| Type | Renders | Notes |
|------|---------|-------|
| `text` | `<Input>` | Standard text input |
| `number` | `<Input type="number">` | Numeric input |
| `select` | `<Select>` with options | Dropdown |
| `toggle` | `<Switch>` | Boolean on/off |
| `datetime` | `<Input type="datetime-local">` | Date and time picker |
| `textarea` | `<Textarea>` | Multi-line text |
| `image` | Thumbnail preview + photo picker button | Opens inline photo picker |

### Behavior

- Initializes form state from `item` prop using the `fields[].key` values
- `showWhen` evaluated on every render to show/hide conditional fields (e.g., price only when pricing_type is "paid")
- **`onSave` receives all form field values** (not just changed ones) — the parent decides what to send to the API. This avoids issues with PUT endpoints that expect full objects.
- Cancel button calls `onCancel`, parent sets `editingId` to null
- **Escape key** also triggers `onCancel`
- Form layout: responsive grid, 2-3 columns on desktop, 1 on mobile
- Save/Cancel buttons right-aligned at the bottom
- **Save button disabled** when `saving` is true or any `required` field is empty
- **Error handling:** If `onSave` throws, the panel stays open (does not collapse). Parent should show a toast on error.
- Panel manages form field state internally. Parent manages save lifecycle state (`saving` boolean).

## Image Field: Photo Picker

The `image` field type renders:
1. Current thumbnail preview (small, 48x48) or placeholder if none
2. A "Choose Photo" button that opens a small inline photo browser (not a full modal)
3. The picker fetches from `/api/v1/photos/` with search support
4. Selecting a photo sets the field value to the photo ID
5. A "Clear" button to remove the current photo

This is a new sub-component: `src/components/admin/photo-picker.tsx`. It is a focused, minimal picker — not a full media library rebuild.

## Pages & Field Configs

### Courses (`/admin/courses/`)
- **Fields:** title, pricing_type (select: free/paid), price (number, showWhen paid), is_published (toggle), thumbnail (image)
- **API:** `PUT /api/v1/courses/{slug}/`
- **ID type:** string (slug), not numeric — `editingId` is `string | null` for this page
- **Replaces:** Currently links to detail page for editing. Inline edit added for quick edits; detail page link remains for full course/module/lesson editing.

### Videos (`/admin/videos/`)
- **Fields:** title, description (textarea), thumbnail (image)
- **API:** `PUT /api/v1/courses/videos/{id}/`
- **Replaces:** Current in-row input swap for title/description

### Downloads (`/admin/downloads/`)
- **Fields:** title, pricing_type (select: free/paid), price (number, showWhen paid)
- **API:** `PATCH /api/v1/downloads/{id}/`
- **Replaces:** Current in-row input swap for title + access toggle

### Photos (`/admin/photos/`)
- **Fields:** title, alt_text
- **API:** `PUT /api/v1/photos/{id}/`
- **Replaces:** Current in-row input swap for title/alt_text

### Live Classes (`/admin/live/` — Live Classes tab)
- **Fields:** title, description (textarea), pricing_type (select), price (number, showWhen paid), auto_recording (toggle), scheduled_at (datetime), thumbnail (image)
- **API:** `PUT /api/v1/live/{id}/`
- **Replaces:** Edit path through the top form panel only. See note below on create vs edit separation.

### Live Streams (`/admin/live/` — Live Streams tab)
- **Fields:** title, description (textarea), pricing_type (select), price (number, showWhen paid), auto_recording (toggle), scheduled_at (datetime), thumbnail (image)
- **API:** `PUT /api/v1/live-streams/{id}/`
- **Replaces:** Edit path through the top form panel

### Zoom Classes (`/admin/live/` — Zoom Classes tab)
- **Fields:** title, description (textarea), zoom_link (text), pricing_type (select), price (number, showWhen paid), scheduled_at (datetime), thumbnail (image)
- **API:** `PUT /api/v1/zoom-classes/{id}/`
- **Replaces:** Edit path through the top form panel

### Onsite Events (`/admin/live/` — Onsite Events tab)
- **Fields:** title, description (textarea), location (text), address (text), max_capacity (number), pricing_type (select), price (number, showWhen paid), scheduled_at (datetime), thumbnail (image)
- **API:** `PUT /api/v1/onsite-events/{id}/`
- **Replaces:** Edit path through the top form panel

## What Gets Removed

- Videos page: `editingId`-based in-row input swap, inline Save/Cancel within the row
- Downloads page: `editingId`-based in-row input swap
- Photos page: `editingId`-based in-row input swap
- Live page (all tabs): **edit path** through `showForm` top panel, `openEdit()` function, related edit state
- Related state variables: `editTitle`, `editAccess`, `title`, `description`, `pricingType`, `price`, `scheduledAt`, etc. — replaced by InlineEditPanel's internal state

## What Stays

- **Create flows remain unchanged.** On the live page, the top form panel stays for creating new items only. The `showForm` + `openCreate()` path is preserved. Only the `openEdit()` path is removed and replaced by InlineEditPanel.
- Upload flows (video chunked upload, download file upload, photo upload) remain as-is.
- Course detail page link (for module/lesson editing) remains alongside the new inline edit.

## Not In Scope

- Student page (read-only, no update API)
- Settings/Design pages (single-record forms, not list items)
- Course detail editing (modules/lessons — separate editor page)
- Create/upload flows (remain as-is)

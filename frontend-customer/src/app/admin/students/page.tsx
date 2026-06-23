"use client"

import { useCallback, useRef } from "react"
import Link from "next/link"
import { Users, Mail, Receipt, Smartphone, Globe } from "lucide-react"
import { TableCell } from "@/components/ui/table"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { clientFetch, batchedAsync } from "@/lib/api-client"
import { toast } from "sonner"
import {
  MediaBrowser,
  type MediaBrowserHandle,
  type FetchPageParams,
  type FetchPageResult,
} from "@/components/admin/media-browser"

export const dynamic = "force-dynamic"

interface Student {
  id: number
  email: string
  name: string
  avatar_url: string
  date_joined: string
  last_login: string | null
  enrolled_count: number
  last_display_mode?: string
  last_platform?: string
}

function getInitials(name: string) {
  return name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase()
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  })
}

const SORT_OPTIONS = [
  { label: "Newest", value: "-date_joined" },
  { label: "Oldest", value: "date_joined" },
  { label: "Name A-Z", value: "name" },
  { label: "Name Z-A", value: "-name" },
]

export default function StudentsPage() {
  const browserRef = useRef<MediaBrowserHandle>(null)

  const fetchPage = useCallback(
    async (params: FetchPageParams): Promise<FetchPageResult<Student>> => {
      const sp = new URLSearchParams()
      sp.set("limit", String(params.limit))
      sp.set("offset", String(params.offset))
      sp.set("ordering", params.ordering)
      if (params.search) sp.set("search", params.search)
      const data = await clientFetch<
        | { results: Student[]; next: string | null; count: number }
        | Student[]
      >(`/api/v1/auth/students/?${sp.toString()}`)

      if (Array.isArray(data)) {
        return { results: data, next: null, count: data.length }
      }
      return { results: data.results, next: data.next, count: data.count }
    },
    []
  )

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Students</h1>
          <p className="text-sm text-muted-foreground">
            View and manage your enrolled students.
          </p>
        </div>
      </div>

      <MediaBrowser<Student>
        ref={browserRef}
        persistKey="students"
        fetchPage={fetchPage}
        sortOptions={SORT_OPTIONS}
        defaultSort="-date_joined"
        galleryEnabled={false}
        emptyIcon={Users}
        emptyMessage="No students yet."
        getItemId={(s) => s.id}
        onDelete={async (selection) => {
          await batchedAsync(
            selection.ids.map((id) => () =>
              clientFetch(`/api/v1/auth/students/${id}/`, { method: "DELETE" })
            )
          )
          toast.success("Students deleted")
          browserRef.current?.refresh()
        }}
        listColumns={[
          { label: "Student", key: "student" },
          { label: "Enrolled Courses", key: "enrolled" },
          { label: "Joined", key: "joined" },
          { label: "Last Active", key: "active" },
          { label: "Payments", key: "payments" },
        ]}
        renderListRow={(student) => (
          <>
            <TableCell>
              <div className="flex items-center gap-3">
                <Avatar className="h-8 w-8">
                  <AvatarImage src={student.avatar_url} />
                  <AvatarFallback className="text-xs">
                    {getInitials(student.name || student.email)}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0">
                  <p className="font-medium truncate">
                    {student.name || "Unnamed"}
                  </p>
                  <p className="text-xs text-muted-foreground truncate flex items-center gap-1">
                    <Mail className="h-3 w-3" />
                    {student.email}
                  </p>
                  {student.last_display_mode && (
                    <span className="inline-flex items-center gap-1 rounded-md border border-border px-1.5 py-0.5 text-xs text-muted-foreground">
                      {student.last_display_mode === "pwa" ? (
                        <Smartphone className="h-3 w-3" />
                      ) : (
                        <Globe className="h-3 w-3" />
                      )}
                      {student.last_display_mode === "pwa" ? "PWA" : "Web"}
                      {student.last_platform ? ` · ${student.last_platform}` : ""}
                    </span>
                  )}
                </div>
              </div>
            </TableCell>
            <TableCell>
              <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary">
                {student.enrolled_count}{" "}
                {student.enrolled_count === 1 ? "course" : "courses"}
              </span>
            </TableCell>
            <TableCell className="text-muted-foreground">
              {formatDate(student.date_joined)}
            </TableCell>
            <TableCell className="text-muted-foreground">
              {student.last_login
                ? formatDate(student.last_login)
                : "Never"}
            </TableCell>
            <TableCell>
              <Link
                href={`/admin/students/${student.id}`}
                className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
                onClick={(e) => e.stopPropagation()}
              >
                <Receipt className="h-3.5 w-3.5" />
                View
              </Link>
            </TableCell>
          </>
        )}
      />
    </div>
  )
}

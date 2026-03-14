import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export const dynamic = 'force-dynamic'

export default function AdminDashboard() {
  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold">Dashboard</h1>
      <div className="grid gap-4 md:grid-cols-3">
        <Card><CardHeader><CardTitle>Students</CardTitle></CardHeader><CardContent><p className="text-3xl font-bold">0</p></CardContent></Card>
        <Card><CardHeader><CardTitle>Courses</CardTitle></CardHeader><CardContent><p className="text-3xl font-bold">0</p></CardContent></Card>
        <Card><CardHeader><CardTitle>Revenue</CardTitle></CardHeader><CardContent><p className="text-3xl font-bold">$0</p></CardContent></Card>
      </div>
    </div>
  )
}

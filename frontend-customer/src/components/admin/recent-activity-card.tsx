"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { UserCheck, BookOpen, CreditCard, MessageSquare, Sparkles } from "lucide-react";

interface ActivityItem {
  id: string;
  type: "enrollment" | "course" | "payment" | "community";
  title: string;
  timestamp: string;
  detail: string;
}

export function RecentActivityCard() {
  const activities: ActivityItem[] = [
    {
      id: "1",
      type: "enrollment",
      title: "New Student Enrolled",
      detail: "Sarah Jenkins enrolled in Pilates Fundamentals",
      timestamp: "12m ago",
    },
    {
      id: "2",
      type: "payment",
      title: "Payment Received",
      detail: "$49.00 payment confirmed via Stripe",
      timestamp: "45m ago",
    },
    {
      id: "3",
      type: "community",
      title: "New Community Discussion",
      detail: "Mike posted in General Discussion",
      timestamp: "2h ago",
    },
    {
      id: "4",
      type: "course",
      title: "Lesson Completed",
      detail: "Alex finished 'Breathwork Module 1'",
      timestamp: "4h ago",
    },
  ];

  const getIcon = (type: ActivityItem["type"]) => {
    switch (type) {
      case "enrollment":
        return <UserCheck className="h-4 w-4 text-emerald-500" />;
      case "payment":
        return <CreditCard className="h-4 w-4 text-blue-500" />;
      case "community":
        return <MessageSquare className="h-4 w-4 text-violet-500" />;
      case "course":
        return <BookOpen className="h-4 w-4 text-amber-500" />;
      default:
        return <Sparkles className="h-4 w-4 text-muted-foreground" />;
    }
  };

  return (
    <Card className="h-full">
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-semibold flex items-center justify-between">
          <span>Recent Activity</span>
          <span className="text-xs font-normal text-muted-foreground">Live updates</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {activities.map((item) => (
          <div key={item.id} className="flex items-start justify-between gap-3 text-sm">
            <div className="flex items-start gap-3 min-w-0">
              <div className="p-1.5 rounded-md bg-muted shrink-0 mt-0.5">
                {getIcon(item.type)}
              </div>
              <div className="min-w-0">
                <p className="font-medium text-xs leading-tight truncate">{item.title}</p>
                <p className="text-xs text-muted-foreground truncate">{item.detail}</p>
              </div>
            </div>
            <span className="text-[10px] text-muted-foreground shrink-0">{item.timestamp}</span>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

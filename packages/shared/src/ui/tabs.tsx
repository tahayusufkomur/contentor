"use client";

import * as React from "react";
import { cn } from "../lib/utils";

interface TabsContextValue {
  value: string;
  onValueChange: (v: string) => void;
}

const TabsContext = React.createContext<TabsContextValue>({
  value: "",
  onValueChange: () => {},
});

interface TabsProps extends React.HTMLAttributes<HTMLDivElement> {
  defaultValue?: string;
  value?: string;
  onValueChange?: (value: string) => void;
}

function Tabs({
  defaultValue = "",
  value: controlledValue,
  onValueChange,
  className,
  children,
  ...props
}: TabsProps) {
  const [internal, setInternal] = React.useState(defaultValue);
  const value = controlledValue ?? internal;
  const handleChange = onValueChange ?? setInternal;

  return (
    <TabsContext.Provider value={{ value, onValueChange: handleChange }}>
      <div className={cn("", className)} {...props}>
        {children}
      </div>
    </TabsContext.Provider>
  );
}

function TabsList({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        // A long language can make the tabs wider than the screen: the list scrolls
        // sideways (justify-start keeps its first tab reachable) instead of running
        // off it. The list hugs its tabs, so start vs centre looks the same otherwise.
        "inline-flex h-9 max-w-full items-center justify-start overflow-x-auto overflow-y-hidden rounded-lg bg-muted p-1 text-muted-foreground [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
        className,
      )}
      {...props}
    />
  );
}

function TabsTrigger({
  className,
  value,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { value: string }) {
  const ctx = React.useContext(TabsContext);
  const ref = React.useRef<HTMLButtonElement>(null);
  const active = ctx.value === value;
  // On a narrow screen the list scrolls: bring the open tab into view.
  React.useEffect(() => {
    if (active)
      ref.current?.scrollIntoView?.({ inline: "nearest", block: "nearest" });
  }, [active]);

  return (
    <button
      ref={ref}
      className={cn(
        "inline-flex items-center justify-center whitespace-nowrap rounded-md border border-transparent px-3 py-1 text-sm font-medium ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50",
        active && "border-border bg-background text-foreground",
        className,
      )}
      onClick={() => ctx.onValueChange(value)}
      {...props}
    />
  );
}

function TabsContent({
  className,
  value,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & { value: string }) {
  const ctx = React.useContext(TabsContext);
  if (ctx.value !== value) return null;

  return (
    <div
      className={cn(
        "mt-2 ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        className,
      )}
      {...props}
    />
  );
}

export { Tabs, TabsList, TabsTrigger, TabsContent };

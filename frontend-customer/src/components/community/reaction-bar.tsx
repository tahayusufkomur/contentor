export function ReactionBar(props: { kind: "posts" | "comments"; id: number; count: number; mine: string | null }) { return <span className="text-sm text-muted-foreground">❤️ {props.count}</span>; }

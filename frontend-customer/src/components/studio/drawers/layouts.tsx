"use client";

// The Layouts drawer: "Your set" (the layout and colours of the cover she kept last), then the six layouts.

import {
  Layout,
  type SimpleControlsProps,
} from "@/components/studio/simple-controls";

export function LayoutsDrawer({
  recipe,
  set,
  edit,
}: Pick<SimpleControlsProps, "recipe" | "set" | "edit">) {
  return <Layout recipe={recipe} set={set} edit={edit} columns={2} />;
}

"use client";

import { useEffect, useRef, useState } from "react";
import {
  createProgressController,
  type ProgressController,
} from "../navigation/navigation-state";
import { useNavigation } from "../navigation/navigation-provider";
import { ProgressLine } from "./progress-line";

export function NavigationProgress({ delayMs = 150 }: { delayMs?: number }) {
  const { isNavigating } = useNavigation();
  const [visible, setVisible] = useState(false);
  const ref = useRef<ProgressController | null>(null);

  if (ref.current === null) {
    ref.current = createProgressController({
      delayMs,
      onShow: () => setVisible(true),
      onHide: () => setVisible(false),
    });
  }

  useEffect(() => {
    const controller = ref.current;
    if (!controller) return;
    if (isNavigating) controller.start();
    else controller.finish();
  }, [isNavigating]);

  useEffect(() => () => ref.current?.dispose(), []);

  if (!visible) return null;
  return (
    <div className="fixed inset-x-0 top-0 z-[100]">
      <ProgressLine />
    </div>
  );
}

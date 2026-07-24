"use client";

import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { createAsyncRunner, errorMessage } from "./async-runner";

export interface UseAsyncActionOptions {
  /** false: silent. string: fixed message. default true: errorMessage(err). */
  errorToast?: boolean | string;
  successToast?: string;
  onSuccess?: () => void;
  /** When set, replaces the default error toast entirely — the default
   *  toast never fires, so `errorToast: false` alongside it is redundant. */
  onError?: (err: unknown) => void;
}

export function useAsyncAction<Args extends unknown[]>(
  fn: (...args: Args) => Promise<void> | void,
  options: UseAsyncActionOptions = {},
) {
  const [loading, setLoading] = useState(false);
  const fnRef = useRef(fn);
  fnRef.current = fn;
  const optionsRef = useRef(options);
  optionsRef.current = options;

  const run = useMemo(
    () =>
      createAsyncRunner<Args>((...args) => fnRef.current(...args), {
        setLoading,
        onSuccess: () => {
          const o = optionsRef.current;
          if (o.successToast) toast.success(o.successToast);
          o.onSuccess?.();
        },
        onError: (err) => {
          const o = optionsRef.current;
          if (o.onError) {
            o.onError(err);
            return;
          }
          if (o.errorToast === false) return;
          toast.error(
            typeof o.errorToast === "string" ? o.errorToast : errorMessage(err),
          );
        },
      }),
    [],
  );

  return { run, loading };
}

import { useEffect, useRef } from "react";
import type { UseFormReturn, FieldValues } from "react-hook-form";

/**
 * Debounced auto-save for react-hook-form fields.
 *
 * Watches all form fields and calls `setter` after `delay`ms of inactivity.
 * Uses a ref-based timer to prevent re-subscription on re-render.
 *
 * IMPORTANT: `setter` must be a stable reference — extract it via
 * Zustand selector (e.g., `useStore(s => s.setData)`) to avoid
 * infinite effect re-runs.
 */
export function useFormAutoSave<T extends FieldValues>(
  form: UseFormReturn<T>,
  setter: (data: T) => void,
  delay = 500,
) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    const subscription = form.watch((data) => {
      clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        if (data) {
          setter(data as T);
        }
      }, delay);
    });
    return () => {
      subscription.unsubscribe();
      clearTimeout(timerRef.current);
    };
  }, [form, setter, delay]);
}

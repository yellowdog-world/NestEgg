"use client";

import { useMemo, useState, useCallback, type ReactNode } from "react";
import type { Simulator } from "@/simulators/types";

function loadStored<I>(key: string, defaultInput: I): I {
  if (typeof window === "undefined") return defaultInput;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return defaultInput;
    return { ...defaultInput, ...JSON.parse(raw) };
  } catch {
    return defaultInput;
  }
}

function saveStored<I>(key: string, value: I) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // private browsing / storage full 등 무시
  }
}

type Props<I, O> = {
  simulator: Simulator<I, O>;
  preset?: Partial<I>;
  renderForm: (input: I, setInput: (next: I) => void) => ReactNode;
  renderResult: (output: O, input: I) => ReactNode;
};

export function SimulatorShell<I extends object, O>({
  simulator,
  preset,
  renderForm,
  renderResult,
}: Props<I, O>) {
  const storageKey = `sim:${simulator.name}`;

  const [input, setInputState] = useState<I>(() => {
    const stored = loadStored(storageKey, simulator.defaultInput);
    return { ...stored, ...preset } as I;
  });

  const setInput = useCallback(
    (next: I) => {
      setInputState(next);
      saveStored(storageKey, next);
    },
    [storageKey],
  );

  const { output, error } = useMemo(() => {
    const parsed = simulator.schema.safeParse(input);
    if (!parsed.success) {
      return {
        output: null,
        error: parsed.error.issues.map((i) => i.message).join(", "),
      };
    }
    try {
      return { output: simulator.compute(parsed.data) as O, error: null };
    } catch (e) {
      return { output: null, error: e instanceof Error ? e.message : "compute error" };
    }
  }, [input, simulator]);

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <section className="rounded-xl border border-neutral-200 bg-white p-5">
        <h2 className="mb-4 text-base font-medium tracking-wide text-neutral-600 uppercase">
          입력
        </h2>
        <div className="flex flex-col gap-3">{renderForm(input, setInput)}</div>
      </section>

      <section className="rounded-xl border border-neutral-200 bg-white p-5">
        <h2 className="mb-4 text-base font-medium tracking-wide text-neutral-600 uppercase">
          결과
        </h2>
        {error && (
          <p className="rounded-md bg-red-50 px-3 py-2 text-base text-red-800">{error}</p>
        )}
        {output && renderResult(output, input)}
      </section>
    </div>
  );
}

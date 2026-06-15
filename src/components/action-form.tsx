"use client";

import { useActionState, useEffect, useRef } from "react";
import clsx from "clsx";

type State = { ok?: boolean; error?: string };

export function ActionForm({
  action,
  children,
  className,
  successMessage = "Saved.",
}: {
  action: (state: State, formData: FormData) => Promise<State>;
  children: React.ReactNode;
  className?: string;
  successMessage?: string;
}) {
  const [state, formAction, pending] = useActionState(action, {});
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.ok) formRef.current?.reset();
  }, [state.ok]);

  return (
    <form ref={formRef} action={formAction} className={clsx("space-y-4", className)}>
      {children}
      {state.error ? <p className="rounded-md border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">{state.error}</p> : null}
      {state.ok ? <p className="rounded-md border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-200">{successMessage}</p> : null}
      <button
        disabled={pending}
        className="w-full rounded-md bg-[#ef174b] px-4 py-3 text-sm font-bold text-white shadow-lg shadow-red-950/40 transition hover:bg-[#ff2a5d] disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? "Working..." : "Save"}
      </button>
    </form>
  );
}

export function Field({
  label,
  name,
  type = "text",
  required,
  placeholder,
  defaultValue,
}: {
  label: string;
  name: string;
  type?: string;
  required?: boolean;
  placeholder?: string;
  defaultValue?: string | number;
}) {
  return (
    <label className="block text-sm text-zinc-300">
      <span className="mb-2 block font-medium">{label}</span>
      <input
        name={name}
        type={type}
        required={required}
        placeholder={placeholder}
        defaultValue={defaultValue}
        className="w-full rounded-md border border-white/10 bg-zinc-950 px-3 py-2.5 text-white outline-none ring-[#ef174b]/40 transition placeholder:text-zinc-600 focus:border-[#ef174b] focus:ring-2"
      />
    </label>
  );
}

export function TextArea({ label, name, placeholder }: { label: string; name: string; placeholder?: string }) {
  return (
    <label className="block text-sm text-zinc-300">
      <span className="mb-2 block font-medium">{label}</span>
      <textarea
        name={name}
        placeholder={placeholder}
        rows={3}
        className="w-full rounded-md border border-white/10 bg-zinc-950 px-3 py-2.5 text-white outline-none ring-[#ef174b]/40 transition placeholder:text-zinc-600 focus:border-[#ef174b] focus:ring-2"
      />
    </label>
  );
}

export function Select({
  label,
  name,
  options,
  required,
}: {
  label: string;
  name: string;
  options: { value: string; label: string }[];
  required?: boolean;
}) {
  return (
    <label className="block text-sm text-zinc-300">
      <span className="mb-2 block font-medium">{label}</span>
      <select
        name={name}
        required={required}
        className="w-full rounded-md border border-white/10 bg-zinc-950 px-3 py-2.5 text-white outline-none ring-[#ef174b]/40 transition focus:border-[#ef174b] focus:ring-2"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

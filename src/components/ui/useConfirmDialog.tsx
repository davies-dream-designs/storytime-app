"use client";

import { useCallback, useState } from "react";
import Button from "@/components/ui/Button";

type DialogVariant = "default" | "danger";

type ConfirmOptions = {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: DialogVariant;
};

type AlertOptions = {
  title: string;
  message: string;
  confirmLabel?: string;
  variant?: DialogVariant;
};

type DialogState =
  | (ConfirmOptions & {
      mode: "confirm";
      resolve: (confirmed: boolean) => void;
    })
  | (AlertOptions & {
      mode: "alert";
      resolve: () => void;
    });

export function useConfirmDialog() {
  const [dialog, setDialog] = useState<DialogState | null>(null);

  const close = useCallback(
    (confirmed: boolean) => {
      if (!dialog) return;
      if (dialog.mode === "confirm") {
        dialog.resolve(confirmed);
      } else {
        dialog.resolve();
      }
      setDialog(null);
    },
    [dialog]
  );

  const confirm = useCallback((options: ConfirmOptions) => {
    return new Promise<boolean>((resolve) => {
      setDialog({ ...options, mode: "confirm", resolve });
    });
  }, []);

  const alert = useCallback((options: AlertOptions) => {
    return new Promise<void>((resolve) => {
      setDialog({ ...options, mode: "alert", resolve });
    });
  }, []);

  const Dialog = useCallback(() => {
    if (!dialog) return null;

    const isDanger = dialog.variant === "danger";
    const confirmLabel =
      dialog.confirmLabel ?? (dialog.mode === "alert" ? "OK" : "Continue");

    return (
      <div
        className="fixed inset-0 z-[100] flex items-end bg-night-900/55 px-4 pb-4 pt-10 backdrop-blur-sm sm:items-center sm:justify-center sm:p-6"
        role="presentation"
        onMouseDown={(event) => {
          if (event.target === event.currentTarget) {
            close(false);
          }
        }}
      >
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="storycot-confirm-title"
          className="w-full max-w-md rounded-3xl bg-white p-5 shadow-2xl"
        >
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-bold uppercase tracking-wide text-star-600">
                Storycot
              </p>
              <h2
                id="storycot-confirm-title"
                className="mt-1 font-display text-2xl font-bold text-night-800"
              >
                {dialog.title}
              </h2>
            </div>
            <button
              type="button"
              aria-label="Close dialog"
              onClick={() => close(false)}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-night-100 bg-white text-xl font-bold leading-none text-night-600 shadow-sm transition hover:bg-night-50"
            >
              ×
            </button>
          </div>
          <p className="mt-4 whitespace-pre-line text-sm leading-6 text-night-500">
            {dialog.message}
          </p>
          <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            {dialog.mode === "confirm" ? (
              <Button
                variant="secondary"
                onClick={() => close(false)}
                className="justify-center"
              >
                {dialog.cancelLabel ?? "Cancel"}
              </Button>
            ) : null}
            <Button
              variant={isDanger ? "danger" : "primary"}
              onClick={() => close(true)}
              className="justify-center"
            >
              {confirmLabel}
            </Button>
          </div>
        </div>
      </div>
    );
  }, [close, dialog]);

  return { confirm, alert, ConfirmDialog: Dialog };
}

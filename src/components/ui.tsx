"use client";
import type { ReactNode } from "react";
import { X } from "lucide-react";
import * as Dialog from "@radix-ui/react-dialog";
import { clsx } from "clsx";
import { ActionButton, type ActionButtonProps } from "./action-button";

export function Button({
  children,
  variant = "secondary",
  className,
  ...props
}: ActionButtonProps & { variant?: "primary" | "secondary" | "ghost" | "danger" }) {
  return (
    <ActionButton className={clsx("btn", `btn-${variant}`, className)} {...props}>
      {children}
    </ActionButton>
  );
}

export function IconButton({
  label,
  children,
  className,
  ...props
}: ActionButtonProps & { label: string }) {
  return (
    <ActionButton aria-label={label} className={clsx("icon-btn", className)} {...props}>
      {children}
    </ActionButton>
  );
}

export function Modal({
  title,
  description,
  children,
  onClose,
}: {
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  onClose: () => void;
}) {
  return (
    <Dialog.Root open onOpenChange={(value) => !value && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="modal-overlay" />
        <Dialog.Content
          className="modal"
          onOpenAutoFocus={(e) => {
            e.preventDefault();
            const el = e.currentTarget as HTMLElement;
            setTimeout(() => el?.querySelector<HTMLElement>("input,select,button")?.focus(), 0);
          }}
        >
          <div className="modal-header">
            <div>
              <Dialog.Title>{title}</Dialog.Title>
              <Dialog.Description>{description || " "}</Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <IconButton label="Close dialog" tooltip={false}>
                <X size={20} />
              </IconButton>
            </Dialog.Close>
          </div>
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export function Field({
  label,
  children,
  hint,
  className,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
  className?: string;
}) {
  return (
    <label className={clsx("field", className)}>
      <span>{label}</span>
      {children}
      {hint && <small>{hint}</small>}
    </label>
  );
}

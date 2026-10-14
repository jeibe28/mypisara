"use client";

import {
  Children,
  isValidElement,
  type ComponentPropsWithRef,
  type ReactNode,
} from "react";
import * as Tooltip from "@radix-ui/react-tooltip";

export type ActionButtonProps = ComponentPropsWithRef<"button"> & {
  tooltip?: string | false;
};

function buttonText(children: ReactNode): string {
  return Children.toArray(children)
    .map((child) => {
      if (typeof child === "string" || typeof child === "number")
        return String(child);
      if (isValidElement<{ children?: ReactNode }>(child))
        return buttonText(child.props.children);
      return "";
    })
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

export function TooltipProvider({ children }: { children: ReactNode }) {
  return (
    <Tooltip.Provider delayDuration={450} skipDelayDuration={150}>
      {children}
    </Tooltip.Provider>
  );
}

export function ActionButton({
  children,
  tooltip,
  title,
  type = "submit",
  ...props
}: ActionButtonProps) {
  const text = buttonText(children);
  // Visible labels already explain their action. Reserve tooltips for controls
  // that use only an icon or image and need a short text cue.
  const hint = text ? undefined : (tooltip ?? title ?? props["aria-label"]);
  const button = (
    <button
      type={type}
      aria-label={props["aria-label"] ?? (!text ? title : undefined)}
      {...props}
    >
      {children}
    </button>
  );
  if (!hint || props.disabled) return button;
  return (
    <Tooltip.Root>
      <Tooltip.Trigger asChild>{button}</Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Content
          className="action-tooltip"
          sideOffset={7}
          collisionPadding={12}
        >
          {hint}
          <Tooltip.Arrow className="action-tooltip-arrow" />
        </Tooltip.Content>
      </Tooltip.Portal>
    </Tooltip.Root>
  );
}

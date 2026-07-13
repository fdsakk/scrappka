"use client";

import { ContextMenu as ContextMenuPrimitive } from "@base-ui/react/context-menu";
import type * as React from "react";
import { cn } from "#/lib/utils";

export const ContextMenu: typeof ContextMenuPrimitive.Root =
	ContextMenuPrimitive.Root;

export const ContextMenuPortal: typeof ContextMenuPrimitive.Portal =
	ContextMenuPrimitive.Portal;

export const ContextMenuGroup: typeof ContextMenuPrimitive.Group =
	ContextMenuPrimitive.Group;

export function ContextMenuTrigger({
	className,
	...props
}: ContextMenuPrimitive.Trigger.Props): React.ReactElement {
	return (
		<ContextMenuPrimitive.Trigger
			className={className}
			data-slot="context-menu-trigger"
			{...props}
		/>
	);
}

export function ContextMenuPopup({
	children,
	className,
	portalProps,
	...props
}: ContextMenuPrimitive.Popup.Props & {
	portalProps?: ContextMenuPrimitive.Portal.Props;
}): React.ReactElement {
	return (
		<ContextMenuPortal {...portalProps}>
			<ContextMenuPrimitive.Positioner
				className="z-50"
				data-slot="context-menu-positioner"
			>
				<ContextMenuPrimitive.Popup
					className={cn(
						"relative flex not-[class*='w-']:min-w-32 origin-(--transform-origin) rounded-lg border bg-popover not-dark:bg-clip-padding shadow-lg/5 outline-none before:pointer-events-none before:absolute before:inset-0 before:rounded-[calc(var(--radius-lg)-1px)] before:shadow-[0_1px_--theme(--color-black/4%)] focus:outline-none dark:before:shadow-[0_-1px_--theme(--color-white/6%)]",
						className,
					)}
					data-slot="context-menu-popup"
					{...props}
				>
					<div className="max-h-(--available-height) w-full overflow-y-auto p-1">
						{children}
					</div>
				</ContextMenuPrimitive.Popup>
			</ContextMenuPrimitive.Positioner>
		</ContextMenuPortal>
	);
}

export function ContextMenuItem({
	className,
	inset,
	variant = "default",
	...props
}: ContextMenuPrimitive.Item.Props & {
	inset?: boolean;
	variant?: "default" | "destructive";
}): React.ReactElement {
	return (
		<ContextMenuPrimitive.Item
			className={cn(
				"flex min-h-8 cursor-default select-none items-center gap-2 rounded-sm px-2 py-1 text-base text-foreground outline-none data-disabled:pointer-events-none data-highlighted:bg-accent data-inset:ps-8 data-[variant=destructive]:text-destructive-foreground data-highlighted:text-accent-foreground data-disabled:opacity-64 sm:min-h-7 sm:text-sm [&>svg:not([class*='opacity-'])]:opacity-80 [&>svg:not([class*='size-'])]:size-4.5 sm:[&>svg:not([class*='size-'])]:size-4 [&>svg]:pointer-events-none [&>svg]:-mx-0.5 [&>svg]:shrink-0",
				className,
			)}
			data-inset={inset}
			data-slot="context-menu-item"
			data-variant={variant}
			{...props}
		/>
	);
}

export function ContextMenuSeparator({
	className,
	...props
}: ContextMenuPrimitive.Separator.Props): React.ReactElement {
	return (
		<ContextMenuPrimitive.Separator
			className={cn("mx-2 my-1 h-px bg-border", className)}
			data-slot="context-menu-separator"
			{...props}
		/>
	);
}

export function ContextMenuLabel({
	className,
	inset,
	...props
}: ContextMenuPrimitive.GroupLabel.Props & {
	inset?: boolean;
}): React.ReactElement {
	return (
		<ContextMenuPrimitive.GroupLabel
			className={cn(
				"px-2 py-1.5 font-medium text-muted-foreground text-xs data-inset:ps-9 sm:data-inset:ps-8",
				className,
			)}
			data-inset={inset}
			data-slot="context-menu-label"
			{...props}
		/>
	);
}

export { ContextMenuPrimitive };

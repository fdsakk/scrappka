import type { QueryClient } from "@tanstack/react-query";
import { createRootRouteWithContext, Outlet } from "@tanstack/react-router";

interface MyRouterContext {
	queryClient: QueryClient;
}

export const Route = createRootRouteWithContext<MyRouterContext>()({
	component: Root,
});

function Root() {
	return (
		<div className="min-h-screen bg-background text-foreground antialiased dark">
			<Outlet />
		</div>
	);
}

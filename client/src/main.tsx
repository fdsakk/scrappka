import { QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "@tanstack/react-router";
import { createRoot } from "react-dom/client";
import { getRouter } from "./router";
import "./styles.css";

const router = getRouter();
const rootElement = document.getElementById("app");

if (!rootElement) {
	throw new Error("Missing #app root element");
}

createRoot(rootElement).render(
	<QueryClientProvider client={router.options.context.queryClient}>
		<RouterProvider router={router} />
	</QueryClientProvider>,
);

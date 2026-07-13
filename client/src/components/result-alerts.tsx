import { Alert, AlertDescription, AlertTitle } from "#/components/ui/alert";

export function ErrorAlert({ message }: { message: string }) {
	return (
		<Alert variant="error">
			<AlertTitle>Error</AlertTitle>
			<AlertDescription>
				<span className="break-all font-mono">{message}</span>
			</AlertDescription>
		</Alert>
	);
}

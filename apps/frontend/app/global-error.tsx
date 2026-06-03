"use client";

import { useEffect } from "react";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "../components/ui/card";

type GlobalErrorProps = {
  error: Error & { digest?: string };
  reset: () => void;
};

export default function GlobalError({ error, reset }: GlobalErrorProps) {
  useEffect(() => {
    console.error("Global application error", error);
  }, [error]);

  return (
    <html>
      <body className="min-h-screen bg-background p-4 text-foreground">
        <main className="mx-auto mt-16 max-w-xl">
          <Card className="border-border bg-card text-card-foreground shadow-sm">
            <CardHeader>
              <CardTitle>Application error</CardTitle>
              <CardDescription className="text-muted-foreground">
                Something went wrong while rendering the app shell.
              </CardDescription>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              Refresh or retry to continue.
            </CardContent>
            <CardFooter>
              <Button type="button" onClick={reset}>
                Try again
              </Button>
            </CardFooter>
          </Card>
        </main>
      </body>
    </html>
  );
}

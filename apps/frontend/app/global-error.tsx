"use client";

import { useEffect } from "react";
import { useLabels } from "./use-labels";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "../components/ui/card";

type GlobalErrorProps = {
  error: Error & { digest?: string };
  reset: () => void;
};

export default function GlobalError({ error, reset }: GlobalErrorProps) {
  const t = useLabels();
  useEffect(() => {
    console.error("Global application error", error);
  }, [error]);

  return (
    <html>
      <body className="min-h-screen bg-background p-4 text-foreground">
        <main className="mx-auto mt-16 max-w-xl">
          <Card className="border-border bg-card text-card-foreground shadow-sm">
            <CardHeader>
              <CardTitle>{t.globalErrorTitle}</CardTitle>
              <CardDescription className="text-muted-foreground">
                {t.globalErrorDescription}
              </CardDescription>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              {t.globalErrorRetryHint}
            </CardContent>
            <CardFooter>
              <Button type="button" onClick={reset}>
                {t.tryAgain}
              </Button>
            </CardFooter>
          </Card>
        </main>
      </body>
    </html>
  );
}

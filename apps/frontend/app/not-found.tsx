"use client";

import Link from "next/link";
import { SearchX } from "lucide-react";
import { useLabels } from "./use-labels";
import { buttonVariants } from "../components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card";

export default function NotFound() {
  const t = useLabels();

  return (
    <main className="flex min-h-screen items-center justify-center bg-background p-4 text-foreground">
      <Card className="w-full max-w-xl border-border bg-card text-card-foreground shadow-sm">
        <CardHeader>
          <div className="mb-2 inline-flex h-9 w-9 items-center justify-center rounded-xl bg-muted text-muted-foreground">
            <SearchX className="h-4 w-4" />
          </div>
          <CardTitle>{t.notFoundTitle}</CardTitle>
          <CardDescription className="text-muted-foreground">
            {t.notFoundDescription}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Link href="/dashboard" className={buttonVariants()}>
            {t.backToDashboard}
          </Link>
        </CardContent>
      </Card>
    </main>
  );
}

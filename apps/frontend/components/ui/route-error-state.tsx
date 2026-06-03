"use client";

import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { Button, buttonVariants } from "./button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "./card";
import { cn } from "@/lib/utils";

type RouteErrorStateProps = {
  title?: string;
  description?: string;
  reset: () => void;
  homeHref?: string;
  className?: string;
};

export function RouteErrorState({
  title = "Something went wrong",
  description = "Please try again. If the issue persists, contact support.",
  reset,
  homeHref = "/dashboard",
  className
}: RouteErrorStateProps) {
  return (
    <main className={cn("flex min-h-[60vh] items-center justify-center p-4", className)}>
      <Card className="w-full max-w-xl border-border bg-card text-card-foreground shadow-sm">
        <CardHeader className="space-y-2">
          <div className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-destructive/10 text-destructive">
            <AlertTriangle className="h-4 w-4" />
          </div>
          <CardTitle>{title}</CardTitle>
          <CardDescription className="text-muted-foreground">{description}</CardDescription>
        </CardHeader>
        <CardContent />
        <CardFooter className="flex flex-wrap gap-2">
          <Button type="button" onClick={reset}>
            Try again
          </Button>
          <Link href={homeHref} className={buttonVariants({ variant: "outline" })}>
            Go to dashboard
          </Link>
        </CardFooter>
      </Card>
    </main>
  );
}



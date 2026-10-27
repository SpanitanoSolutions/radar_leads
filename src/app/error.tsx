"use client";

import { ErrorRecuperable } from "@/components/ErrorRecuperable";

export default function Error({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return <ErrorRecuperable error={error} retry={retry} />;
}

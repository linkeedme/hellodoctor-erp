"use client";

import { db } from "@/db/client";

export function ComponenteProibido() {
  return <div>{String(db)}</div>;
}

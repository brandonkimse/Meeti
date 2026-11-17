"use client";

import { useParams } from "next/navigation";
import { HangoutScreen } from "@/components/hangout/HangoutScreen";

export default function HangoutPage() {
  const { id } = useParams<{ id: string }>();
  return <HangoutScreen id={id} />;
}

"use client";

import { useParams } from "next/navigation";
import { PlanForm } from "@/components/PlanForm";

export default function PlanInGroup() {
  const { id } = useParams<{ id: string }>();
  return <PlanForm groupId={id} />;
}

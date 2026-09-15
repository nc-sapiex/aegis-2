import { getObservationById } from "@/data-access/observations";
import { FindingDetail } from "@/components/findings/finding-detail";
import { requirePermission } from "@/lib/guards";
import { notFound } from "next/navigation";

interface FindingPageProps {
  params: Promise<{ id: string }>;
}

export default async function FindingPage({ params }: FindingPageProps) {
  const { id } = await params;
  const session = await requirePermission("observation:read");
  const observation = await getObservationById(session, id);

  if (!observation) {
    notFound();
  }

  return <FindingDetail observation={observation} session={session} />;
}

import { getRequiredSession } from "@/data-access/session";
import { getObservationById } from "@/data-access/observations";
import { FindingDetail } from "@/components/findings/finding-detail";
import { notFound } from "next/navigation";

interface FindingPageProps {
  params: Promise<{ id: string }>;
}

export default async function FindingPage({ params }: FindingPageProps) {
  const { id } = await params;
  const session = await getRequiredSession();
  const observation = await getObservationById(session, id);

  if (!observation) {
    notFound();
  }

  return <FindingDetail observation={observation} session={session} />;
}

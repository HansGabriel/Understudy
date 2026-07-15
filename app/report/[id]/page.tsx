import ReportClient from "./report-client";

export default async function ReportPage({ params }: PageProps<"/report/[id]">) {
  const { id } = await params;
  return <ReportClient sessionId={id} />;
}

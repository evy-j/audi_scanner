import { ReportViewer } from "@/components/reports/report-viewer";

export default async function ReportPage({ params }: { params: Promise<{ reportId: string }> }) {
  const { reportId } = await params;
  return <ReportViewer reportId={reportId} />;
}

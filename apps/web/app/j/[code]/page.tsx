import { redirect } from "next/navigation";

export default async function Page({ params }: { params: Promise<{ code: string }> }) {
  redirect(`/play/${encodeURIComponent((await params).code.toUpperCase())}`);
}

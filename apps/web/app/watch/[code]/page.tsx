import { WatchApp } from "@/components/player";

export default async function Page({ params }: { params: Promise<{ code: string }> }) {
  return <WatchApp code={(await params).code.toUpperCase()} />;
}

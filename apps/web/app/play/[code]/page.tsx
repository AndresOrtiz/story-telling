import { PlayerApp } from "@/components/player";

export default async function Page({ params }: { params: Promise<{ code: string }> }) {
  return <PlayerApp code={(await params).code.toUpperCase()} />;
}

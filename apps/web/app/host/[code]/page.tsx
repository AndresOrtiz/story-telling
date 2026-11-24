import { HostApp } from "@/components/host";

export default async function Page({ params }: { params: Promise<{ code: string }> }) {
  return <HostApp code={(await params).code.toUpperCase()} />;
}

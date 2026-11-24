import { StageApp } from "@/components/stage-app";

type Props = { params: Promise<{ code: string }>; searchParams: Promise<{ t?: string | string[] }> };

export default async function Page({ params, searchParams }: Props) {
  const { t } = await searchParams;
  return <StageApp code={(await params).code.toUpperCase()} token={typeof t === "string" ? t : null} />;
}

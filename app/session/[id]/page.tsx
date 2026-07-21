import SessionClient from "./session-client";

export default async function SessionPage({ params }: PageProps<"/session/[id]">) {
  const { id } = await params;
  return <SessionClient key={id} sessionId={id} />;
}

export type RecentSessionEvent={session_id:string|null;created_at:string};

export function selectLatestAuthorizedSessionId(
  recentEvents:RecentSessionEvent[],
  allowedSessionIds:Set<string>
):string|null{
  const match=recentEvents.find(event=>
    Boolean(event.session_id)&&allowedSessionIds.has(String(event.session_id))
  );
  return match?.session_id?String(match.session_id):null;
}

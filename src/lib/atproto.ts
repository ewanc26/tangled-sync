import { AtpAgent } from "@atproto/api";

/** Create and authenticate an AtpAgent from environment variables. */
export async function createAgent(): Promise<AtpAgent> {
  const username = process.env.BLUESKY_USERNAME;
  const password = process.env.BLUESKY_PASSWORD;
  const pds = process.env.BLUESKY_PDS;

  if (!username || !password) {
    throw new Error(
      "Missing Bluesky credentials. Please set BLUESKY_USERNAME and BLUESKY_PASSWORD in src/.env",
    );
  }

  const agent = new AtpAgent({ service: pds! });

  try {
    const response = await agent.login({ identifier: username, password });
    console.log(
      `[LOGIN] Successfully logged in to AT Proto as ${response.data.did}`,
    );
    console.log(`[LOGIN] Session handle: ${response.data.handle}`);
    return agent;
  } catch (error: any) {
    console.error("[ERROR] Failed to login to AT Proto:", error.message);
    throw error;
  }
}

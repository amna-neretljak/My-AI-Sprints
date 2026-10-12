import { getCloudflareContext } from "@opennextjs/cloudflare";

export async function getDb() {
	const { env } = await getCloudflareContext();
	return env.DB;
}

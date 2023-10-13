import { json } from '@sveltejs/kit';
import * as runner from '$lib/server/dnsresults.js';

/** @type {import('./$types').RequestHandler} */
export async function GET(requestEvent) {
    console.log(`${requestEvent.getClientAddress()} - ${requestEvent.url.pathname}`);
    const monitors = await runner.clientGet();
    return json(monitors, { status: 200 });
}

import { json } from '@sveltejs/kit';
import * as runner from '$lib/server/dnsresults.js';

export async function GET() {
    const monitors = await runner.getMonitors();
    return json(monitors, { status: 200 });
}
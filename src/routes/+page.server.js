import * as runner from '$lib/server/dnsresults.js';
import { loading } from '../stores';

let fetchInterval;

export async function load({ params }) {
    loading.set(false);
    const dnsResultData = await runner.getMonitors();
    fetchInterval = setInterval(()=> { runner.getMonitors(); }, 5000);
    return {
        dnsResultData: dnsResultData
    }
}
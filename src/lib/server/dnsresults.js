import { env } from '$env/dynamic/private';

import * as fs from 'fs';

const F5_XC_API_KEY = env.F5_XC_API_KEY;
const F5_XC_TENANT = env.F5_XC_TENANT;
const F5_XC_DNS_MONITOR_NAMESPACE = env.F5_XC_DNS_MONITOR_NAMESPACE;
const F5_XC_DNS_MONITOR_PREFIX = env.F5_XC_DNS_MONITOR_PREFIX;
const F5_XC_F5_MONITOR_SUFFIX = env.F5_XC_F5_MONITOR_SUFFIX;

const f5XCeaders = {
    'Authorization': `APIToken ${F5_XC_API_KEY}`
};

let fetchedData = undefined;
let f5xcRegionLatLongCache = undefined;

let fetchInterval = undefined;

async function initialize() {
    f5xcRegionLatLongCache = {};
    const f5xcRELatLongLookupUrl = `https://${F5_XC_TENANT}.console.ves.volterra.io/api/config/namespaces/default/sites?report_fields=`;
    const f5xcRELatLongLookupResponse = await fetch(f5xcRELatLongLookupUrl, { method: 'GET', headers: f5XCeaders });
    const f5xcRELatLongList = await f5xcRELatLongLookupResponse.json();
    f5xcRELatLongList.items.forEach((site) => {
        if (site.tenant === 'ves-io') {
            for (const key in site.labels) {
                if (key == 'ves.io/region') {
                    console.log(`adding f5xc region ${site.labels[key]} at lat: ${site.object.spec.gc_spec.coordinates.latitude}, long: ${site.object.spec.gc_spec.coordinates.longitude}`)
                    f5xcRegionLatLongCache[site.labels[key]] = {
                        latitude: site.object.spec.gc_spec.coordinates.latitude,
                        longitude: site.object.spec.gc_spec.coordinates.longitude
                    }
                }
            }
        }
    });
    fetchedData = await getMonitors();
}


export async function clientGet() {
    if (!fetchedData) {
        /* build cache of XC sites lat/long */
        await initialize();
        console.log('starting monitor poll agent');
        fetchInterval = setInterval(() => { getMonitors(); }, 30000);
    }
    return fetchedData;
}

export async function getMonitors() {
    const endTime = new Date();
    let dataAge = 120000;
    /* cache data for 1 minute */
    if (fetchedData) { dataAge = endTime.getTime() - new Date(fetchedData.collected).getTime() };
    if (dataAge < 60000) { return fetchedData; }
    console.log(`retrieving monitoring details from ${F5_XC_TENANT}, in namespace: ${F5_XC_DNS_MONITOR_NAMESPACE}, with prefix: ${F5_XC_DNS_MONITOR_PREFIX}`)
    const monitors = {}
    try {
        const monitorsListUrl = `https://${F5_XC_TENANT}.console.ves.volterra.io/api/observability/synthetic_monitor/namespaces/${F5_XC_DNS_MONITOR_NAMESPACE}/v1_dns_monitors`;
        const monitorListResponse = await fetch(monitorsListUrl, { method: 'GET', headers: f5XCeaders });
        const monitorList = await monitorListResponse.json();
        monitorList.items.forEach(( /** @type {{ name: string; description: string; labels: { logo: string; }; }} */ monitor) => {
            if (F5_XC_DNS_MONITOR_PREFIX && !(monitor.name.startsWith(F5_XC_DNS_MONITOR_PREFIX))) {
                return;
            } else {
                monitors[monitor.name] = {
                    name: monitor.name,
                    description: monitor.description,
                    logo: monitor.labels.logo
                };
            }
        });
        const monitorNameList = Object.keys(monitors);
        // Collect card summary for all monitors
        for (let monitor_name in monitors) {
            /* 2 min window */
            const startTime = new Date(endTime.getTime() - 2 * 60000);
            const monitorSummaryUrl = `https://${F5_XC_TENANT}.console.ves.volterra.io/api/observability/synthetic_monitor/namespaces/${F5_XC_DNS_MONITOR_NAMESPACE}/dns-monitor-summary?monitorName=${monitor_name}&startTime=${startTime.toISOString()}&endTime=${endTime.toISOString()}`;
            const monitorSummaryResponse = await fetch(monitorSummaryUrl, { method: 'GET', headers: f5XCeaders });
            const monitorSummary = await monitorSummaryResponse.json();
            monitors[monitor_name]['latency'] = monitorSummary.latency;
            monitors[monitor_name]['averageLatency'] = monitorSummary.avg_latency;
            monitors[monitor_name]['maximumLatency'] = monitorSummary.max_latency;
        }
        const monitorResults = {}
        // Collect all monitors with current latency per region
        const monitorHealthUrl = `https://${F5_XC_TENANT}.console.ves.volterra.io/api/observability/synthetic_monitor/namespaces/${F5_XC_DNS_MONITOR_NAMESPACE}/dns-monitors-health`;
        const monitorHealthBody = JSON.stringify({ monitor_names: monitorNameList, include_latency: true })
        const monitorHealthResponse = await fetch(monitorHealthUrl, { method: 'POST', headers: f5XCeaders, body: monitorHealthBody });
        const monitorHealth = await monitorHealthResponse.json();
        fs.writeFileSync('monitor_health.json', JSON.stringify(monitorHealth, null, 2), { encoding: 'utf8', flag: 'w' });
        monitorHealth.items.forEach(monitor_health => {
            monitor_health.sources.forEach(source => {
                if (!monitorResults[source.source]) {
                    monitorResults[source.source] = {
                        region: source.source,
                        latitude: f5xcRegionLatLongCache[source.source].latitude,
                        longitude: f5xcRegionLatLongCache[source.source].longitude,
                        provider: source.provider,
                        regionalWinner: undefined,
                        regionalWinnerWithoutF5: undefined,
                        winnerLatency: 2000000,
                        winnerLatencyWithoutF5: 2000000,
                        winnerLogo: undefined,
                        winnerLogoWithoutF5: undefined,
                        monitors: []
                    }
                }
                // console.log(`considering MonitorHealth for ${item.monitor_name} in ${source.source} with latency ${source.latency}`)
                // console.log(`current non F5 winning latency is: ${monitorResults[source.source].winnerLatencyWithoutF5}`)
                // console.log(`current non F5 winning latency is: ${monitorResults[source.source].winnerLatencyWithoutF5} by ${monitorResults[source.source].regionalWinnerWithoutF5}`);
                if (!monitor_health.monitor_name.endsWith(F5_XC_F5_MONITOR_SUFFIX)) {
                    // console.log(`not F5: ${monitor_health.monitor_name}`);
                    // console.log(`current non F5 winning latency is: ${monitorResults[source.source].winnerLatencyWithoutF5} by ${monitorResults[source.source].regionalWinnerWithoutF5}`);
                    // console.log(`considering ${monitor_health.monitor_name} with ${source.source} latency of: ${source.latency}`);
                    if (parseInt(source.latency) < parseInt(monitorResults[source.source].winnerLatencyWithoutF5)) {
                        monitorResults[source.source].regionalWinnerWithoutF5 = monitor_health.monitor_name
                        monitorResults[source.source].winnerLatencyWithoutF5 = source.latency
                        monitorResults[source.source].winnerLogoWithoutF5 = monitors[monitor_health.monitor_name].logo
                    }
                }
                // console.log(`current with F5 winning latency is: ${monitorResults[source.source].winnerLatency} by ${monitorResults[source.source].regionalWinner}`);
                // console.log(`considering ${monitor_health.monitor_name} with ${source.source} latency of: ${source.latency}`);
                if (parseInt(source.latency) < parseInt(monitorResults[source.source].winnerLatency)) {
                    monitorResults[source.source].regionalWinner = monitor_health.monitor_name
                    monitorResults[source.source].winnerLatency = source.latency
                    monitorResults[source.source].winnerLogo = monitors[monitor_health.monitor_name].logo
                }
                if (parseInt(source.latency) == parseInt(monitorResults[source.source].winnerLatency)) {
                    if (monitor_health.monitor_name.endsWith(F5_XC_F5_MONITOR_SUFFIX)) {
                        monitorResults[source.source].regionalWinner = monitor_health.monitor_name
                        monitorResults[source.source].winnerLatency = source.latency
                        monitorResults[source.source].winnerLogo = monitors[monitor_health.monitor_name].logo
                    }
                }
                const resultObj = {
                    name: monitor_health.monitor_name,
                    latency: source.latency
                }
                monitorResults[source.source]['monitors'].push(resultObj);
            })
        })



        // build sorted list for delivery
        const monitorDataList = [];
        const resultsDataList = [];
        Object.keys(monitors)
            .sort()
            .forEach((v, i) => {
                monitorDataList.push(monitors[v])
            });
        Object.keys(monitorResults)
            .sort()
            .forEach((v, i) => {
                resultsDataList.push(monitorResults[v])
            });
        const monitorData = {
            monitors: monitorDataList,
            results: resultsDataList,
            includedMonitorPrefix: F5_XC_DNS_MONITOR_PREFIX,
            f5MonitorSuffix: F5_XC_F5_MONITOR_SUFFIX,
            collected: endTime.toISOString()
        }
        fetchedData = monitorData;
    } catch (error) {
        console.log(`error fetching monitor data: ${error}`);
        dataAge = 0;
    }
    return fetchedData;
}


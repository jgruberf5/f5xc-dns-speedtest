import { env } from '$env/dynamic/private';
​
const F5_XC_API_KEY = env.F5_XC_API_KEY;
const F5_XC_TENANT = env.F5_XC_TENANT;
const F5_XC_DNS_MONITOR_NAMESPACE = env.F5_XC_DNS_MONITOR_NAMESPACE;
const F5_XC_DNS_MONITOR_PREFIX = env.F5_XC_DNS_MONITOR_PREFIX;
const F5_XC_F5_MONITOR_SUFFIX = env.F5_XC_F5_MONITOR_SUFFIX;
​
const f5XCeaders = {
    'Authorization': `APIToken ${F5_XC_API_KEY}`
};
const monitorsListUrl = `https://${F5_XC_TENANT}.console.ves.volterra.io/api/observability/synthetic_monitor/namespaces/${F5_XC_DNS_MONITOR_NAMESPACE}/v1_dns_monitors`;
​
let fetchedData = undefined;
let f5xcRegionLatLongCache = undefined;
​
export function clientGet() {
    return fetchedData;
}
​
export async function getMonitors() {
    const endTime = new Date();
    let dataAge = 120000;
    /* cache data for 1 minute */
    if(fetchedData) { dataAge =  endTime.getTime() - new Date(fetchedData.collected).getTime() };
    if(dataAge < 60000 ) { return fetchedData; }
    
    /* build cache of XC sites lat/long */
    if(! f5xcRegionLatLongCache) {
        //console.log(`retrieving monitoring details from ${F5_XC_TENANT}, in namespace: ${F5_XC_DNS_MONITOR_NAMESPACE}, with prefix: ${F5_XC_DNS_MONITOR_PREFIX}`)
        f5xcRegionLatLongCache = {};
        const f5xcRELatLongLookupUrl = `https://${F5_XC_TENANT}.console.ves.volterra.io/api/config/namespaces/default/sites?report_fields=`;
        const f5xcRELatLongLookupResponse = await fetch(f5xcRELatLongLookupUrl,  { method: 'GET', headers: f5XCeaders });
        const f5xcRELatLongList = await f5xcRELatLongLookupResponse.json();
        f5xcRELatLongList.items.forEach( (site) => {
            if(site.tenant === 'ves-io') {
                for (const key in site.labels) {
                    if(key == 'ves.io/region') {
                        //console.log(`adding f5xc region ${site.labels[key]} at lat: ${site.object.spec.gc_spec.coordinates.latitude}, long: ${site.object.spec.gc_spec.coordinates.longitude}`)
                        f5xcRegionLatLongCache[site.labels[key]] = {
                            latitude: site.object.spec.gc_spec.coordinates.latitude,
                            longitude: site.object.spec.gc_spec.coordinates.longitude
                        }
                    }
                }
            }
        });
    }
​
    const monitors = {}
    const monitorResults = {}
    const monitorListResponse = await fetch(monitorsListUrl, { method: 'GET', headers: f5XCeaders });
    const monitorList = await monitorListResponse.json();
    monitorList.items.forEach( ( /** @type {{ name: string; description: string; labels: { logo: string; }; }} */ monitor ) => {
        if(F5_XC_DNS_MONITOR_PREFIX && ! (monitor.name.startsWith(F5_XC_DNS_MONITOR_PREFIX))) {
            return;            
        } else {
            monitors[monitor.name] = { name: monitor.name, description: monitor.description, logo: monitor.labels.logo };
        }
    });
​
    const monitorNameList = Object.keys(monitors);
​
    // Collect all monitors with current latency per region
    const monitorHealthUrl = `https://${F5_XC_TENANT}.console.ves.volterra.io/api/observability/synthetic_monitor/namespaces/${F5_XC_DNS_MONITOR_NAMESPACE}/dns-monitors-health`;
    const body = JSON.stringify({ monitor_names: monitorNameList, include_latency: true })
    
    const monitorHealthResponse = await fetch(monitorHealthUrl, { method: 'POST', headers: f5XCeaders, body: body});
    const monitorHealth = await monitorHealthResponse.json();
​
    const monitorMap = new Map();
​
    monitorHealth.items.forEach(item => {
        const sourcesMap = new Map();
        item.sources.forEach(source => {
            sourcesMap.set(source.source, source.latency);
        });
        monitorMap.set(item.monitor_name, sourcesMap);
    });
​
    for (let monitorName in monitors) {
        /* 2 min window */
        const startTime = new Date(endTime.getTime() - 2*60000);
        const monitorSummaryUrl = `https://${F5_XC_TENANT}.console.ves.volterra.io/api/observability/synthetic_monitor/namespaces/${F5_XC_DNS_MONITOR_NAMESPACE}/dns-monitor-summary?monitorName=${monitorName}&startTime=${startTime.toISOString()}&endTime=${endTime.toISOString()}`;
        const monitorSummaryResponse = await fetch(monitorSummaryUrl, { method: 'GET', headers: f5XCeaders });
        const monitorSummary = await monitorSummaryResponse.json();
        monitors[monitorName]['latency'] = monitorSummary.latency;
        monitors[monitorName]['averageLatency'] = monitorSummary.avg_latency;
        monitors[monitorName]['maximumLatency'] = monitorSummary.max_latency;
        
        // Rather than calling source summary for every monitor, we can use the values stored in monitorMap
        if (monitorMap.has(monitorName)) {
            let coordinates; 
            const regionalLatency = monitorMap.get(monitorName);
            regionalLatency.forEach((latency, source) => {
                monitorResults[source] = {
                    region: source,
                    regionalWinner: undefined,
                    regionalWinnerWithoutF5: undefined,
                    winnerLatency: 2000000,
                    winnerLatencyWithoutF5: 2000000,
                    winnerLogo: undefined,
                    winnerLogoWithoutF5: undefined,
                    monitors: []
                };
​
                if (source.includes("ves-io-")) {
                    coordinates = f5xcRegionLatLongCache[source];
                    monitorResults[source]["latitude"] = coordinates.latitude;
                    monitorResults[source]["longitude"] = coordinates.longitude;
                    monitorResults[source]["provider"] = "f5xc"
                } else {
                    monitorResults[source]["provider"] = "aws";
                }
​
                if(! monitorName.endsWith(F5_XC_F5_MONITOR_SUFFIX)) {
                    if(parseFloat(latency) < parseFloat(monitorResults[source].winnerLatencyWithoutF5)) {
                        monitorResults[source].regionalWinnerWithoutF5 = monitorName;
                        monitorResults[source].winnerLatencyWithoutF5 = latency;
                        monitorResults[source].winnerLogoWithoutF5 = monitors[monitorName].logo;
                    }
                }
​
                //console.log(`current with F5 winning latency is: ${monitorResults[monitorStatus.region].winnerLatency} by ${monitorResults[monitorStatus.region].regionalWinner}`);
                //console.log(`considering ${monitorName} with ${monitorStatus.region} latency of: ${monitorStatus.curr_latency}`);
                if(parseFloat(latency) < parseFloat(monitorResults[source].winnerLatency)) {
                    monitorResults[source].regionalWinner = monitorName
                    monitorResults[source].winnerLatency = latency
                    monitorResults[source].winnerLogo = monitors[monitorName].logo
                }
​
                const resultObj = {
                    name: monitorName,
                    latency: latency,
                }
                monitorResults[source]['monitors'].push(resultObj);
            });   
        }
    }
    // build sorted list for delivery
    const monitorDataList = [];
    const resultsDataList = [];
    Object.keys(monitors)
          .sort()
          .forEach( (v, i) => {
              monitorDataList.push(monitors[v])
          });
    Object.keys(monitorResults)
          .sort()
          .forEach( (v, i) => {
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
    return monitorData;
}
import { F5_XC_API_KEY } from '$env/static/private';
import { F5_XC_TENANT } from '$env/static/private';
import { F5_XC_DNS_MONITOR_NAMESPACE } from '$env/static/private';
import { F5_XC_DNS_MONITOR_PREFIX } from '$env/static/private';

const f5XCeaders = {
    'Authorization': `APIToken ${F5_XC_API_KEY}`
};
const monitorsListUrl = `https://${F5_XC_TENANT}.console.ves.volterra.io/api/observability/synthetic_monitor/namespaces/${F5_XC_DNS_MONITOR_NAMESPACE}/v1_dns_monitors`;

let fetchedData = undefined;

export async function getMonitors() {
    const endTime = new Date();
    const f5MonitoName = 'test-f5xc';
    let dataAge = 120000;
    /* cache data for 1 minute */
    if(fetchedData) { dataAge =  endTime.getTime() - new Date(fetchedData.collected).getTime() };
    if(dataAge < 60000 ) { return fetchedData; }
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
    for (let monitorName in monitors) {
        /* 2 min window */
        const startTime = new Date(endTime.getTime() - 2*60000);
        const monitorSummaryUrl = `https://${F5_XC_TENANT}.console.ves.volterra.io/api/observability/synthetic_monitor/namespaces/${F5_XC_DNS_MONITOR_NAMESPACE}/dns-monitor-summary?monitorName=${monitorName}&startTime=${startTime.toISOString()}&endTime=${endTime.toISOString()}`;
        const monitorSummaryResponse = await fetch(monitorSummaryUrl, { method: 'GET', headers: f5XCeaders });
        const monitorSummary = await monitorSummaryResponse.json();
        monitors[monitorName]['latency'] = monitorSummary.latency;
        monitors[monitorName]['averageLatency'] = monitorSummary.avg_latency;
        monitors[monitorName]['maximumLatency'] = monitorSummary.max_latency;
        const sourceSummaryUrl = `https://${F5_XC_TENANT}.console.ves.volterra.io/api/observability/synthetic_monitor/namespaces/${F5_XC_DNS_MONITOR_NAMESPACE}/source-summary?monitorName=${monitorName}&monitorType=dns`;
        const sourceSummaryResponse = await fetch(sourceSummaryUrl, { method: 'GET', headers: f5XCeaders });
        const sourceSummaryList = await sourceSummaryResponse.json();
        sourceSummaryList.monitor_by_source.forEach( (monitorStatus) => {
            if(!monitorResults[monitorStatus.region]) {
                monitorResults[monitorStatus.region] = {
                    region: monitorStatus.region,
                    latitude: monitorStatus.coordinates.latitude,
                    longitude: monitorStatus.coordinates.longitude,
                    provider: monitorStatus.provider,
                    regionalWinner: undefined,
                    regionalWinnerWithoutF5: undefined,
                    winnerLatency: 2000000,
                    winnerLatencyWithoutF5: 2000000,
                    winnerLogo: undefined,
                    winnerLogoWithoutF5: undefined,
                    monitors: []
                };
            }
            
            if(monitorName != f5MonitoName) {
                /*
                console.log(`not F5: ${monitorName}`);
                console.log(`current non F5 winning latency is: ${monitorResults[monitorStatus.region.winnerLatencyWithoutF5]} by ${monitorResults[monitorStatus.region].regionalWinnerWithoutF5}`);
                console.log(`considering ${monitorName} with ${monitorStatus.region} latency of: ${monitorStatus.curr_latency}`);
                */
                if(monitorStatus.curr_latency < monitorResults[monitorStatus.region].winnerLatencyWithoutF5) {
                    monitorResults[monitorStatus.region].regionalWinnerWithoutF5 = monitorName
                    monitorResults[monitorStatus.region].winnerLatencyWithoutF5 = monitorStatus.curr_latency
                    monitorResults[monitorStatus.region].winnerLogoWithoutF5 = monitors[monitorName].logo
                }
            }
            /*
            console.log(`current with F5 winning latency is: ${monitorResults[monitorStatus.region.winnerLatency]} by ${monitorResults[monitorStatus.region].regionalWinner}`);
            console.log(`considering ${monitorName} with ${monitorStatus.region} latency of: ${monitorStatus.curr_latency}`);
            */
            if(monitorStatus.curr_latency < monitorResults[monitorStatus.region].winnerLatency) {
                monitorResults[monitorStatus.region].regionalWinner = monitorName
                monitorResults[monitorStatus.region].winnerLatency = monitorStatus.curr_latency
                monitorResults[monitorStatus.region].winnerLogo = monitors[monitorName].logo
            }

            const resultObj = {
                name: monitorName,
                latency: monitorStatus.curr_latency,
                critical: monitorStatus.critical_count,
                healthy: monitorStatus.healthy_count
            }
            monitorResults[monitorStatus.region]['monitors'].push(resultObj);
        })
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
        collected: endTime.toISOString()
    }
    fetchedData = monitorData;
    return monitorData;
}

<script lang="ts">
	import { onMount, onDestroy } from "svelte";
	import { Button, Card } from "flowbite-svelte";
	import { browser } from '$app/environment';
	import {LeafletMap, Marker, DivIcon, TileLayer} from 'svelte-leafletjs?client';
	import 'leaflet/dist/leaflet.css';
	import { loading } from '../stores';

    let dnsResultData;
	let winnerResults = [];
	let fetcherInterval;

	let showdata = false;
	let showf5 = false;
	let tileColumns = 3;

	const f5TestName = 'test-f5xc';

    const mapOptions = {
        center: [53.137811, -35.737996],
        zoom: 2,
        zoomControl: false,
        doubleClickZoom: false,
        boxZoom: false,
        dragging: false
    };
    const tileUrl = 'https://tile.jawg.io/jawg-light/{z}/{x}/{y}{r}.png?access-token=GONv9dFvCU616XgdkgIHBClBblHTuCm9004cJSwc2gsp2AEkTACEm7mIYKtPKq2H';
    const tileLayerOptions = { };

	const fetchHandler = async () => {
        loading.set(1);
		dnsResultData = await fetch(`${window.location.origin}/dnsresults/`).then((x)=>x.json());
        let updatedWinnerResults = [];
		dnsResultData.results.forEach( winner => {
			if(showf5) {
				let iconOption = `<div style='boarder: none;'><img src='/images/${winner.winnerLogo}' style='height: 24px; width:auto;' title='${winner.winnerLatency}ms' border='0'></div>`;
				updatedWinnerResults.push(
					{
						latLng: [winner.latitude, winner.longitude],
						iconOptions: {
							html: iconOption,
							className: 'dummy'
						}
					}
				) 
			} else {
				let iconOption = `<div style='boarder: none;'><img src='/images/${winner.winnerLogoWithoutF5}' style='height: 24px; width:auto;' title='${winner.winnerLatencyWithoutF5}ms' border='0'></div>`;
				updatedWinnerResults.push(
					{
						latLng: [winner.latitude, winner.longitude],
						iconOptions: {
							html: iconOption,
							className: 'dummy'
						}
					}
				)
			}
		});
		winnerResults = updatedWinnerResults;
		loading.set(0);
	};
	onMount(async () => {
		loading.set(true);
		await fetchHandler()
		loading.set(false);
        fetcherInterval = setInterval(fetchHandler, 10000)
	});
	onDestroy( async () => {
        clearInterval(fetcherInterval);
	});
	const togglelData = () => {
		showdata = !showdata;
	}
	const revealF5 = () => {
		fetchHandler();
		showf5 = true;
		tileColumns = 3;
	}
	const hideF5 = () => {
		fetchHandler();
		showf5 = false;
		tileColumns = 3;
	}

</script>

<svelte:head>
	<title>DNS Speedtest</title>
	<meta name="description" content="Test DNS Resolve Latency across F5 Distributed Cloud Observed Monitors" />
</svelte:head>

<div class='flex justify-center mb-3'>
	<div class="rounded-lg border border-gray-200 dark:border-gray-700 shadow-md" style="width: 70vh; height: 30vh;" >
		{#if browser}
			<LeafletMap options={mapOptions}>
				<TileLayer url={tileUrl} options={tileLayerOptions}/>
				{#if dnsResultData}
					{#each winnerResults as result}
					<Marker latLng={result.latLng}>
						<DivIcon options={result.iconOptions} />
					</Marker>
					{/each}
				{/if}
			</LeafletMap>
		{/if}
	</div>
</div>

<section>
	{#if dnsResultData}
	    {#if ! showf5}
            <Button class="max-w-md mx-auto mb-3 p-1 pl-4" rounded large outline color="dark" on:click={revealF5}>
				<b>Reveal</b><img src="/images/f5.svg" style="height: 32px; width:auto;" alt="reveal F5">
			</Button>
		{:else}
            <Card class="grid grid-cols-1 gap-2 mb-2" style="width 400px; width:auto" on:click={hideF5}>
			    <div class="grid grid-cols-2 gap-2">
					<div>
						<img src='/images/f5.svg' style="height:80px; width:auto" alt="DNS monitor logo" >
						<h5 class="text-xs whitespace-nowrap mb-2 font-bold tracking-tight text-gray-900 dark:text-white">
							F5 Distributed Cloud DNS
						</h5>
					</div>
					<div class='content-end ml-2 mt-2'>
						{#each dnsResultData.monitors as monitor}
							{#if showf5 && monitor.name === f5TestName}
							<ul>
								<li class='text-sm break-keep'>latency: <b>{Math.round(monitor.latency)}ms</b></li>
								<li class='text-sm break-keep'>avg: <b>{Math.round(monitor.averageLatency)}ms</b></li>
								<li class='text-sm break-keep'>max: <b>{Math.round(monitor.maximumLatency)}ms</b></li>
							</ul>
							{/if}
						{/each}
					</div>
				</div>
			</Card>
		{/if}
		<div class="grid grid-cols-{tileColumns} gap-2">
			{#each dnsResultData.monitors as monitor}
				{#if monitor.name != f5TestName}
					<div class="max-w-md mx-auto">
						<Card padding='sm' size='m' style="width:200px;">
							<div class="flex justify-center">
								<img src="/images/{monitor.logo}" style="height:48px; width:auto" alt="DNS monitor logo"><br/>
							</div>
							<div class="flex justify-center">
								<h5 class="text-xs whitespace-nowrap mb-2 font-bold tracking-tight text-gray-900 dark:text-white">
									{monitor.description}
								</h5>
							</div>
							<ul>
								<li class='text-xs break-keep'>latency: <b>{Math.round(monitor.latency)}ms</b></li>
								<li class='text-xs break-keep'>avg: <b>{Math.round(monitor.averageLatency)}ms</b></li>
								<li class='text-xs break-keep'>max: <b>{Math.round(monitor.maximumLatency)}ms</b></li>
							</ul>
						</Card>
					</div>
				{/if}
			{/each}
		</div>
	{/if}
</section>

<section>
	<div class='flex justify-center mb-3 mt-3'>
		{#if dnsResultData}
		    <a alt='Toggle Data Visible' on:click={togglelData}>&Pi;</a><br/>
		{/if}
	</div>
	<div class='flex justify-center mb-3 mt-3'>
		{#if dnsResultData && showdata}
		<pre>{JSON.stringify(dnsResultData, null, 2)}</pre>
		{/if}
	</div>
</section>

<style>
	section {
		display: flex;
		flex-direction: column;
		justify-content: center;
		align-items: center;
		flex: 0.6;
	}

</style>
